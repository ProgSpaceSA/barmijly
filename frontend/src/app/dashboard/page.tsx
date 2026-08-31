"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList, SkeletonDashboard } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { useDashboardStats, useOverdueTickets, useDeveloperStats, useTicketTrend } from "@/hooks/useReports";
import { useMyTasks, useUpdateTaskStatus } from "@/hooks/useTasks";
import { useMyCreatedTickets } from "@/hooks/useTickets";
import { useMarkTicketRead } from "@/hooks/useNotifications";
import { useAuthStore } from "@/store/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { personalGreetingFor, ROLE_LABELS, TASK_LABELS, TASK_STATUS_COLORS, TASK_STATUS_LABELS, TREND_SERIES_LABELS } from "@/lib/constants";
import { formatTrendMonth, niceYAxisMax, rankDevelopers, trendTooltipRows, yAxisTicks } from "@/lib/report-charts";
import { Area, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, AlertTriangle, Check, Clock, Lock, TrendingUp, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { DueRemaining } from "@/components/shared/DueRemaining";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { CodeComment } from "@/components/shared/CodeComment";

function TrendYTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number | string;
  y?: number | string;
  payload?: { value: number | string };
}) {
  const cx = Number(x);
  const cy = Number(y);
  return (
    <text
      x={cx - 22}
      y={cy}
      dy={4}
      textAnchor="middle"
      fontSize={10}
      fontFamily="IBM Plex Mono, monospace"
      fill="currentColor"
      style={{ direction: "ltr", unicodeBidi: "isolate" }}
    >
      {payload?.value}
    </text>
  );
}

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string; dataKey?: string | number }>;
  label?: string;
}) {
  const rows = trendTooltipRows(payload);
  if (!active || !rows.length || !label) return null;
  return (
    <div className="rounded-md border bg-card px-3 py-2 text-xs shadow-md" dir="rtl">
      <p className="mb-1.5 font-medium text-foreground">{formatTrendMonth(label, "tooltip")}</p>
      {rows.map((row) => (
        <p key={row.key} className="flex items-center justify-between gap-6 tabular-nums">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: row.color }} />
            {row.label}
          </span>
          <span className="font-medium text-foreground">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

function CountUp({ value }: { value: number | undefined }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (value === undefined) return;
    ref.current = 0;
    setDisplay(0);
    const step = value / 30;
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= value) {
        setDisplay(value);
        clearInterval(timer);
      } else {
        setDisplay(Math.floor(current));
      }
    }, 20);
    return () => clearInterval(timer);
  }, [value]);

  if (value === undefined) return <span>—</span>;
  return (
    <span className="count-reveal font-brm" style={{ display: "inline-block" }}>
      {display}
    </span>
  );
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80;
  const h = 24;
  const coords = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * (h - 2) - 1;
    return { x, y };
  });
  const line = coords.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polygon points={area} fill={color} opacity="0.14" />
      <polyline points={line} stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const STAT_TONES = {
  indigo: "#6366F1",
  blue: "#3B82F6",
  violet: "#8B5CF6",
  red: "#EF4444",
} as const;

function StatCard({
  title,
  value,
  icon: Icon,
  tone,
  sparkData,
  alert,
}: {
  title: string;
  value: number | undefined;
  icon: LucideIcon;
  tone: keyof typeof STAT_TONES;
  sparkData?: number[];
  alert?: boolean;
}) {
  const color = STAT_TONES[tone];
  return (
    <div
      className="brm-stat"
      data-alert={alert ? "true" : undefined}
      style={{ "--stat-tone": color } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="brm-stat-label">{title}</p>
          <p className="brm-stat-value">
            <CountUp value={value} />
          </p>
        </div>
        <div className="brm-stat-icon">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      {sparkData && sparkData.length > 1 && (
        <div className="brm-stat-spark">
          <MiniSparkline data={sparkData} color={color} />
        </div>
      )}
    </div>
  );
}

const GREETINGS: Record<string, string> = {
  PROGRAMMING_HEAD: "جاهز للإنتاج؟",
  PROJECT_MANAGER: "ما الأولوية اليوم؟",
  DEVELOPER: "هل ثمة كود يريد حلاً؟",
  QA: "ما يجتاز الاختبار يعيش.",
  TICKET_REQUESTER: "طلبك هو بدايتنا.",
  SYSTEM_OWNER: "كل شيء تحت السيطرة.",
  SENIOR_MANAGEMENT: "الصورة الكاملة هنا.",
};

/** Task status. Label and colour come from constants so the ticket page,
    this hub and the force-status grid can never drift apart. */
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> =
  Object.fromEntries(
    Object.keys(TASK_STATUS_LABELS).map((key) => [key, {
      label: TASK_STATUS_LABELS[key],
      color: TASK_STATUS_COLORS[key],
      bg: `${TASK_STATUS_COLORS[key]}1F`,
    }]),
  );
const NEXT_STATUS: Record<string, string> = { NEW: "IN_PROGRESS", IN_PROGRESS: "COMPLETED", COMPLETED: "NEW" };

const TICKET_STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  DRAFT:                   { label: "مسودة",              color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  NEW:                     { label: "جديدة",              color: "#3B82F6", bg: "rgba(59,130,246,0.12)"  },
  AWAITING_INFO:           { label: "انتظار معلومات",     color: "#F59E0B", bg: "rgba(245,158,11,0.12)"  },
  AWAITING_APPROVAL:       { label: "انتظار اعتماد",      color: "#F97316", bg: "rgba(249,115,22,0.12)"  },
  APPROVED:                { label: "معتمدة",             color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  REJECTED:                { label: "مرفوضة",             color: "#EF4444", bg: "rgba(239,68,68,0.12)"   },
  SCHEDULED:               { label: "مجدولة",             color: "#8B5CF6", bg: "rgba(139,92,246,0.12)"  },
  IN_PROGRESS:             { label: "قيد التنفيذ",        color: "#6366F1", bg: "rgba(99,102,241,0.12)"  },
  AWAITING_TESTING:        { label: "انتظار اختبار",      color: "#06B6D4", bg: "rgba(6,182,212,0.12)"   },
  AWAITING_OWNER_APPROVAL: { label: "انتظار اعتماد المالك", color: "#14B8A6", bg: "rgba(20,184,166,0.12)" },
  COMPLETED:               { label: "مكتملة",             color: "#10B981", bg: "rgba(16,185,129,0.12)"  },
  CLOSED:                  { label: "مغلقة",              color: "#6B7280", bg: "rgba(107,114,128,0.12)" },
  BLOCKED:                 { label: "متوقفة",             color: "#FB7185", bg: "rgba(251,113,133,0.12)" },
  ON_HOLD:                 { label: "معلقة",              color: "#94A3B8", bg: "rgba(148,163,184,0.12)" },
};

function TaskStatusDot({ status, onClick, pending, blockedBy }: {
  status: string;
  onClick: () => void;
  pending: boolean;
  /** An unfinished blocking task above this one on its ticket. */
  blockedBy?: { title: string } | null;
}) {
  const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.NEW;

  // Nothing to cycle: the API refuses the same move, so the dot says why
  // instead of offering a click that would only come back as a toast.
  if (blockedBy) {
    const note = TASK_LABELS.blockedBy(blockedBy.title);
    return (
      <span
        title={note}
        aria-label={note}
        style={{
          width: 22, height: 22, borderRadius: "50%",
          border: "2px solid #F59E0B", color: "#F59E0B",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Lock style={{ width: 11, height: 11 }} aria-hidden />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={e => { e.preventDefault(); onClick(); }}
      disabled={pending}
      title={`→ ${STATUS_CFG[NEXT_STATUS[status] as keyof typeof STATUS_CFG]?.label}`}
      style={{
        width: 22, height: 22, borderRadius: "50%",
        border: `2px solid ${cfg.color}`,
        background: status === "COMPLETED" ? cfg.color : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: pending ? "default" : "pointer",
        opacity: pending ? 0.5 : 1,
        flexShrink: 0,
        transition: "all 0.15s",
      }}
    >
      {status === "COMPLETED" && <Check style={{ width: 11, height: 11, color: "#fff", strokeWidth: 3 }} />}
      {status === "IN_PROGRESS" && (
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, display: "block" }} />
      )}
    </button>
  );
}

function DueDateLabel({ date }: { date: string | null }) {
  return <DueRemaining date={date} className="font-brm" style={{ fontSize: 11 }} />;
}

function TimeAgo({ date }: { date: string }) {
  return <RelativeTime date={date} className="whitespace-nowrap" />;
}

function DevTaskHub() {
  const { data: tasks,          isLoading: tasksLoading   } = useMyTasks();
  const { data: createdTickets, isLoading: ticketsLoading } = useMyCreatedTickets();
  const { mutate: updateStatus, isPending } = useUpdateTaskStatus();
  const { mutate: markTicketRead } = useMarkTicketRead();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const DONE_TASK_STATUSES   = new Set(["COMPLETED"]);
  const DONE_TICKET_STATUSES = new Set(["COMPLETED", "CLOSED"]);

  const taskItems = (tasks ?? [])
    .filter((t: any) => !DONE_TASK_STATUSES.has(t.status))
    .map((t: any) => ({ ...t, _kind: "task" as const }));

  const ticketItems = (createdTickets ?? [])
    .filter((t: any) => !DONE_TICKET_STATUSES.has(t.status))
    .map((t: any) => ({ ...t, _kind: "ticket" as const }));

  const allItems = [...taskItems, ...ticketItems].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const activeTasks   = taskItems.filter((t: any) => t.status === "IN_PROGRESS").length;
  const totalUpdates  = ticketItems.reduce((n: number, t: any) => n + (t.unreadCount ?? 0), 0);

  function cycleStatus(task: any) {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    setPendingId(task.id);
    updateStatus({ id: task.id, status: next }, { onSettled: () => setPendingId(null) });
  }

  const isLoading = tasksLoading || ticketsLoading;

  return (
    <div className="brm-term">
      <div className="brm-term-bar">
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57", display: "block" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E", display: "block" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840", display: "block" }} />
        </div>
        <span className="font-brm ltr-isolate" dir="ltr" style={{ fontSize: 12, opacity: 0.8, flex: 1 }}>
          $ brmctl activity --user:me --active
        </span>
        <span className="font-brm" style={{ fontSize: 11, color: activeTasks > 0 ? "#34D399" : "rgba(255,255,255,0.35)" }}>
          {activeTasks > 0 ? `● ${activeTasks} active` : "○ idle"}
        </span>
      </div>

      <div>
        <div className="brm-term-strip font-brm">
          <span>
            tasks <span style={{ color: "var(--foreground)", fontWeight: 700 }}>{taskItems.length}</span>
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span>
            tickets <span style={{ color: "var(--foreground)", fontWeight: 700 }}>{ticketItems.length}</span>
          </span>
          {totalUpdates > 0 && (
            <>
              <span style={{ color: "var(--border)" }}>|</span>
              <span className="brm-soon" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span className="relative flex" style={{ width: 7, height: 7, display: "inline-flex" }}>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#F59E0B" }} />
                  <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: "#F59E0B" }} />
                </span>
                {totalUpdates} تحديث جديد
              </span>
            </>
          )}
        </div>

        <div className="brm-term-body" role="region" aria-label="النشاط الحالي">
          {isLoading ? (
            <div style={{ padding: "16px 24px" }}><SkeletonList count={4} /></div>
          ) : allItems.length === 0 ? (
            <div style={{ padding: "28px 24px", textAlign: "center" }}>
              <div className="font-brm" style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
                <CodeComment>no active items</CodeComment>
              </div>
            </div>
          ) : allItems.map((item: any) => {
            if (item._kind === "task") {
              const cfg = STATUS_CFG[item.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.NEW;
              const isPendingThis = pendingId === item.id && isPending;
              return (
                <div key={`task-${item.id}`} className="brm-term-row">
                  <TaskStatusDot status={item.status} onClick={() => cycleStatus(item)} pending={isPendingThis} blockedBy={item.blockedBy} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span className="brm-kind brm-kind-task">TASK</span>
                      <Link href={`/tickets/${item.ticket?.id}`} style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }} className="brm-row-title hover:underline">
                        {item.title}
                      </Link>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <TicketCodeBadge ticketNumber={item.ticket?.ticketNumber} />
                      {item.ticket?.ticketNumber != null && <span style={{ color: "var(--border)", fontSize: 10 }}>·</span>}
                      <Link href={`/tickets/${item.ticket?.id}`} className="brm-row-title min-w-0">
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{item.ticket?.title}</span>
                      </Link>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <DueDateLabel date={item.dueDate} />
                    <span className="font-brm" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, whiteSpace: "nowrap" }}>{cfg.label}</span>
                    <TimeAgo date={item.updatedAt} />
                  </div>
                </div>
              );
            }

            const scfg = TICKET_STATUS_CFG[item.status] ?? { label: item.status, color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
            return (
              <Link
                key={`ticket-${item.id}`}
                href={`/tickets/${item.id}`}
                className="brm-term-row"
                onClick={() => { if (item.hasUpdates) markTicketRead(item.id); }}
              >
                <div style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {item.hasUpdates ? (
                    <span className="relative flex" style={{ width: 10, height: 10 }}>
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#F59E0B" }} />
                      <span className="relative inline-flex rounded-full" style={{ width: 10, height: 10, background: "#F59E0B" }} />
                    </span>
                  ) : (
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--border)", display: "block" }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span className="brm-kind brm-kind-ticket">TICKET</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }} className="brm-row-title">{item.title}</span>
                    {item.hasUpdates && (
                      <span className="font-brm brm-soon" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {item.unreadCount} جديد
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <TicketCodeBadge ticketNumber={item.ticketNumber} />
                    <span style={{ color: "var(--border)", fontSize: 10 }}>·</span>
                    <CompanyLogo company={item.company} size="xs" />
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{item.company?.name}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <DueDateLabel date={item.estimatedDeadline} />
                  <span className="font-brm" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: scfg.bg, color: scfg.color, border: `1px solid ${scfg.color}33`, whiteSpace: "nowrap" }}>{scfg.label}</span>
                  <TimeAgo date={item.updatedAt} />
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { can: allowed } = usePermissions();
  // The team panels come from endpoints gated on report:read-team. Asking for
  // them without the action is a guaranteed 403, so the queries stay off.
  const isManager = allowed("report:read-team");

  const { data: stats, isLoading } = useDashboardStats();
  const { data: overdue } = useOverdueTickets();
  const { data: devStats } = useDeveloperStats({ enabled: isManager });
  const { data: trend } = useTicketTrend(6, { enabled: isManager });

  const isDeveloper = user?.role === "DEVELOPER";
  const isSeniorManagement = user?.role === "SENIOR_MANAGEMENT";
  const showTaskHub = !isSeniorManagement;
  const greeting = personalGreetingFor(user?.email) ?? GREETINGS[user?.role ?? ""] ?? "";

  const trendCreated = trend?.map((t: any) => t.created) ?? [];
  const trendMax = Math.max(0, ...(trend ?? []).flatMap((t: { created: number; closed: number }) => [t.created, t.closed]));
  const trendYMax = niceYAxisMax(trendMax);
  const trendYTicks = yAxisTicks(trendMax);
  const rankedDevs = rankDevelopers(devStats ?? []);

  return (
    <AppShell>
      <PageHeader
        title={`مرحباً، ${user?.firstName}`}
        description={greeting || ROLE_LABELS[user?.role || ""]}
      />

      <div className="space-y-5">
      {showTaskHub && <DevTaskHub />}

      {isLoading ? (
        <SkeletonDashboard showStats={!isDeveloper} showCharts={isManager} />
      ) : (
        <>

          {!isDeveloper && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
              <StatCard title="إجمالي التذاكر" value={stats?.totalTickets}      icon={Activity}      tone="indigo" sparkData={trendCreated} />
              <StatCard title="تذاكر مفتوحة"  value={stats?.openTickets}       icon={Clock}         tone="blue"   sparkData={trendCreated} />
              <StatCard title="قيد التنفيذ"    value={stats?.inProgressTickets} icon={TrendingUp}    tone="violet" />
              <StatCard title="متأخرة"         value={stats?.overdueTickets}    icon={AlertTriangle} tone="red"    alert={(stats?.overdueTickets ?? 0) > 0} />
            </div>
          )}

          {isManager && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {trend && trend.length > 0 && (
                <Card size="sm" className="overflow-visible">
                  <CardHeader className="pb-0">
                    <CardTitle className="text-base">اتجاه التذاكر (6 أشهر)</CardTitle>
                    <CardDescription className="text-[11px]">مُنشأة مقابل مُغلقة</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div dir="ltr" className="w-full overflow-visible text-muted-foreground">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={trend} margin={{ left: 4, right: 12, bottom: 4, top: 12 }}>
                          <defs>
                            <linearGradient id="dash-created" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#818CF8" stopOpacity={0.28} />
                              <stop offset="100%" stopColor="#818CF8" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="dash-closed" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#34D399" stopOpacity={0.22} />
                              <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} vertical={false} />
                          <XAxis
                            dataKey="month"
                            tickFormatter={(value: string) => formatTrendMonth(value)}
                            tick={{ fontSize: 11, fill: "currentColor" }}
                            axisLine={{ stroke: "currentColor", strokeOpacity: 0.35 }}
                            tickLine={false}
                            interval={0}
                            height={28}
                          />
                          <YAxis
                            orientation="left"
                            width={44}
                            domain={[0, trendYMax]}
                            ticks={trendYTicks}
                            tick={TrendYTick}
                            axisLine={{ stroke: "currentColor", strokeOpacity: 0.35 }}
                            tickLine={false}
                            allowDecimals={false}
                          />
                          <Tooltip content={<TrendTooltip />} cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }} />
                          <Area type="monotone" dataKey="created" name={TREND_SERIES_LABELS.created} stroke="none" fill="url(#dash-created)" tooltipType="none" />
                          <Area type="monotone" dataKey="closed" name={TREND_SERIES_LABELS.closed} stroke="none" fill="url(#dash-closed)" tooltipType="none" />
                          <Line type="monotone" dataKey="created" stroke="#818CF8" name={TREND_SERIES_LABELS.created} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                          <Line type="monotone" dataKey="closed"  stroke="#34D399" name={TREND_SERIES_LABELS.closed} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-1 flex justify-center gap-4 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2 rounded-full bg-[#818CF8]" />
                        {TREND_SERIES_LABELS.created}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block size-2 rounded-full bg-[#34D399]" />
                        {TREND_SERIES_LABELS.closed}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {rankedDevs.length > 0 && (
                <Card size="sm">
                  <CardHeader className="pb-0">
                    <CardTitle className="text-base">أداء المطورين ({rankedDevs.length})</CardTitle>
                    <CardDescription className="text-[11px]">مكتمل من المُسند</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="brm-panel-scroll max-h-[200px]"
                      role="region"
                      aria-label="أداء المطورين"
                      data-testid="developer-performance-list"
                    >
                      <div className="space-y-3 pt-1" dir="rtl">
                        {rankedDevs.map((dev) => (
                          <div key={dev.id} className="flex items-center gap-3" data-testid={`dev-row-${dev.id}`}>
                            <div className="brm-dev-avatar">{dev.initials}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between text-sm mb-1">
                                <span className="font-medium truncate">{dev.name}</span>
                                <span className="font-brm text-xs text-muted-foreground tabular-nums">{dev.completed}/{dev.assigned}</span>
                              </div>
                              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                                <div className="brm-dev-fill transition-all" style={{ width: `${dev.completionRate}%` }} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {overdue && overdue.length > 0 && (
            <Card size="sm">
              <CardHeader className="items-center pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  التذاكر المتأخرة ({overdue.length})
                </CardTitle>
                <CardAction className="self-center">
                  <Link href="/tickets?overdue=true" className="text-sm whitespace-nowrap hover:underline" style={{ color: "#818CF8" }}>عرض الكل</Link>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  {overdue.slice(0, 5).map((t: any) => (
                    <Link key={t.id} href={`/tickets/${t.id}`}
                      className="flex flex-wrap items-center justify-between gap-y-1.5 p-2.5 rounded-lg transition-colors"
                      style={{ background: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="min-w-0 flex-1 basis-56">
                        <p className="brm-row-title text-sm font-medium">{t.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>{t.system?.name}</span>
                          {t.company && (
                            <span className="flex items-center gap-1 font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
                              — <CompanyLogo company={t.company} size="xs" /> {t.company.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0 sm:mr-3">
                        <StatusBadge status={t.status} overdue />
                        <PriorityBadge priority={t.finalPriority} />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
      </div>
    </AppShell>
  );
}
