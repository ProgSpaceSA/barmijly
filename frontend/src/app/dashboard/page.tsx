"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonStat, SkeletonList } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { useDashboardStats, useOverdueTickets, useDeveloperStats, useTicketTrend } from "@/hooks/useReports";
import { useMyTasks, useUpdateTaskStatus } from "@/hooks/useTasks";
import { useMyCreatedTickets } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { AlertTriangle, Clock, TrendingUp, Activity, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { format, formatDistanceToNow, isAfter, isBefore, addDays } from "date-fns";
import { ar } from "date-fns/locale";

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
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 64;
  const h = 28;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (v / max) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

function StatCard({ title, value, icon: Icon, color, sparkData, sparkColor }: any) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-medium" style={{ color: "var(--muted-foreground)" }}>{title}</p>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold mt-1 mb-3" style={{ color: "var(--foreground)" }}>
          <CountUp value={value} />
        </p>
        {sparkData && (
          <MiniSparkline data={sparkData} color={sparkColor ?? "#4F46E5"} />
        )}
      </CardContent>
    </Card>
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

const STATUS_ORDER: Record<string, number> = { IN_PROGRESS: 0, NEW: 1, COMPLETED: 2 };
const STATUS_CFG = {
  NEW:         { label: "جديدة",       color: "#3B82F6", bg: "rgba(59,130,246,0.12)",  flag: "--new" },
  IN_PROGRESS: { label: "قيد التنفيذ", color: "#F59E0B", bg: "rgba(245,158,11,0.12)", flag: "--in-progress" },
  COMPLETED:   { label: "مكتملة",      color: "#10B981", bg: "rgba(16,185,129,0.12)", flag: "--completed" },
};
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
  ON_HOLD:                 { label: "معلقة",              color: "#94A3B8", bg: "rgba(148,163,184,0.12)" },
};

function TaskStatusDot({ status, onClick, pending }: { status: string; onClick: () => void; pending: boolean }) {
  const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.NEW;
  return (
    <button
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
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const isOverdue = isBefore(d, now);
  const isSoon   = !isOverdue && isBefore(d, addDays(now, 3));
  const color = isOverdue ? "#EF4444" : isSoon ? "#F59E0B" : "var(--muted-foreground)";
  return (
    <span className="font-brm" style={{ fontSize: 11, color, whiteSpace: "nowrap" }}>
      {isOverdue ? "⚠ " : ""}{format(d, "dd MMM", { locale: ar })}
    </span>
  );
}

function TimeAgo({ date }: { date: string }) {
  return (
    <span className="font-brm" style={{ fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
      {formatDistanceToNow(new Date(date), { addSuffix: true, locale: ar })}
    </span>
  );
}

function DevTaskHub() {
  const { data: tasks,          isLoading: tasksLoading   } = useMyTasks();
  const { data: createdTickets, isLoading: ticketsLoading } = useMyCreatedTickets();
  const { mutate: updateStatus, isPending } = useUpdateTaskStatus();
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
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
      {/* macOS terminal header */}
      <div style={{ background: "var(--foreground)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57", display: "block" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E", display: "block" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840", display: "block" }} />
        </div>
        <span className="font-brm" style={{ color: "var(--background)", fontSize: 12, opacity: 0.7, flex: 1 }}>
          $ brmctl activity --user:me --active
        </span>
        <span className="font-brm" style={{ fontSize: 11, color: activeTasks > 0 ? "#28C840" : "rgba(255,255,255,0.3)" }}>
          {activeTasks > 0 ? `● ${activeTasks} active` : "○ idle"}
        </span>
      </div>

      <div style={{ background: "var(--card)" }}>
        {/* Summary strip */}
        <div className="font-brm" style={{ display: "flex", gap: 16, padding: "10px 20px", fontSize: 11, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <span style={{ color: "var(--muted-foreground)" }}>
            tasks <span style={{ color: "var(--foreground)", fontWeight: 700 }}>{taskItems.length}</span>
          </span>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ color: "var(--muted-foreground)" }}>
            tickets <span style={{ color: "var(--foreground)", fontWeight: 700 }}>{ticketItems.length}</span>
          </span>
          {totalUpdates > 0 && (
            <>
              <span style={{ color: "var(--border)" }}>|</span>
              <span style={{ color: "#D97706", display: "flex", alignItems: "center", gap: 4 }}>
                <span className="relative flex" style={{ width: 7, height: 7, display: "inline-flex" }}>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "#F59E0B" }} />
                  <span className="relative inline-flex rounded-full" style={{ width: 7, height: 7, background: "#F59E0B" }} />
                </span>
                {totalUpdates} تحديث جديد
              </span>
            </>
          )}
        </div>

        {/* Unified list */}
        <div style={{ padding: "4px 0 8px" }}>
          {isLoading ? (
            <div style={{ padding: "16px 24px" }}><SkeletonList count={4} /></div>
          ) : allItems.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div className="font-brm" style={{ color: "var(--muted-foreground)", fontSize: 13 }}>// no active items</div>
            </div>
          ) : allItems.map((item: any) => {
            if (item._kind === "task") {
              const cfg = STATUS_CFG[item.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.NEW;
              const brmNum = item.ticket?.ticketNumber ? `BRM-${String(item.ticket.ticketNumber).padStart(4, "0")}` : null;
              const isPendingThis = pendingId === item.id && isPending;
              return (
                <div key={`task-${item.id}`}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--border)", transition: "background 0.1s" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <TaskStatusDot status={item.status} onClick={() => cycleStatus(item)} pending={isPendingThis} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span className="font-brm" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(59,130,246,0.12)", color: "#3B82F6", border: "1px solid rgba(59,130,246,0.25)", flexShrink: 0 }}>TASK</span>
                      <Link href={`/tickets/${item.ticket?.id}`} style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }} className="truncate hover:underline">
                        {item.title}
                      </Link>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      {brmNum && <span className="font-brm" style={{ fontSize: 11, color: "#4F46E5", opacity: 0.8 }}>{brmNum}</span>}
                      {brmNum && <span style={{ color: "var(--border)", fontSize: 10 }}>·</span>}
                      <Link href={`/tickets/${item.ticket?.id}`} className="truncate">
                        <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{item.ticket?.title}</span>
                      </Link>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <DueDateLabel date={item.dueDate} />
                    <span className="font-brm" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33`, whiteSpace: "nowrap" }}>{item.status}</span>
                    <TimeAgo date={item.updatedAt} />
                  </div>
                </div>
              );
            }

            // ticket row
            const scfg = TICKET_STATUS_CFG[item.status] ?? { label: item.status, color: "#6B7280", bg: "rgba(107,114,128,0.12)" };
            const brmNum = `BRM-${String(item.ticketNumber).padStart(4, "0")}`;
            return (
              <Link key={`ticket-${item.id}`} href={`/tickets/${item.id}`}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1px solid var(--border)", transition: "background 0.1s", textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Update dot */}
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
                    <span className="font-brm" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(139,92,246,0.12)", color: "#8B5CF6", border: "1px solid rgba(139,92,246,0.25)", flexShrink: 0 }}>TICKET</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }} className="truncate">{item.title}</span>
                    {item.hasUpdates && (
                      <span className="font-brm" style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "rgba(245,158,11,0.12)", color: "#D97706", border: "1px solid rgba(245,158,11,0.3)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {item.unreadCount} جديد
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span className="font-brm" style={{ fontSize: 11, color: "#4F46E5", opacity: 0.8 }}>{brmNum}</span>
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
  const { data: stats, isLoading } = useDashboardStats();
  const { data: overdue } = useOverdueTickets();
  const { data: devStats } = useDeveloperStats();
  const { data: trend } = useTicketTrend();

  const isManager = user?.role && ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"].includes(user.role);
  const isDeveloper = user?.role === "DEVELOPER";
  const isSeniorManagement = user?.role === "SENIOR_MANAGEMENT";
  const showTaskHub = !isSeniorManagement;
  const greeting = GREETINGS[user?.role ?? ""] ?? "";

  const trendCreated = trend?.map((t: any) => t.created) ?? [];
  const trendClosed  = trend?.map((t: any) => t.closed)  ?? [];

  return (
    <AppShell>
      <PageHeader
        title={`مرحباً، ${user?.firstName}`}
        description={greeting || ROLE_LABELS[user?.role || ""]}
      />

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0,1,2,3].map(i => <SkeletonStat key={i} />)}
          </div>
        </div>
      ) : (
        <div className="space-y-6">

          {/* Task hub for everyone except senior management */}
          {showTaskHub && <DevTaskHub />}

          {/* KPI cards for non-developers */}
          {!isDeveloper && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="إجمالي التذاكر"     value={stats?.totalTickets}      icon={Activity}      color="bg-indigo-500"  sparkData={trendCreated} sparkColor="#6366F1" />
              <StatCard title="تذاكر مفتوحة"      value={stats?.openTickets}       icon={Clock}         color="bg-blue-500"    sparkData={trendCreated} sparkColor="#3B82F6" />
              <StatCard title="قيد التنفيذ"        value={stats?.inProgressTickets} icon={TrendingUp}    color="bg-violet-500"  />
              <StatCard title="متأخرة"             value={stats?.overdueTickets}    icon={AlertTriangle} color="bg-red-500"     sparkData={[]} sparkColor="#EF4444" />
            </div>
          )}

          {/* Charts for managers */}
          {isManager && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {trend && trend.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">اتجاه التذاكر (6 أشهر)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={trend} margin={{ left: 8, right: 8, bottom: 0, top: 4 }}>
                        <XAxis dataKey="month" tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }} />
                        <YAxis tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }} width={28} />
                        <Tooltip contentStyle={{ fontFamily: "Cairo, sans-serif", fontSize: 12, background: "var(--card)", border: "1px solid var(--border)" }} />
                        <Line type="monotone" dataKey="created" stroke="#4F46E5" name="مُنشأة" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="closed"  stroke="#10B981" name="مُغلقة" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {devStats && devStats.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">أداء المطورين</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {devStats.slice(0, 5).map((dev: any) => (
                        <div key={dev.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-indigo-600 shrink-0" style={{ background: "rgba(79,70,229,0.1)" }}>
                            {dev.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium truncate">{dev.name}</span>
                              <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>{dev.completed}/{dev.assigned}</span>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--muted)" }}>
                              <div className="h-full rounded-full transition-all" style={{ width: `${dev.completionRate}%`, background: "linear-gradient(90deg, #4F46E5, #6C5CE7)" }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Overdue tickets */}
          {overdue && overdue.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  التذاكر المتأخرة ({overdue.length})
                </CardTitle>
                <Link href="/tickets" className="text-sm hover:underline" style={{ color: "#4F46E5" }}>عرض الكل</Link>
              </CardHeader>
              <CardContent>
                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                  {overdue.slice(0, 5).map((t: any) => (
                    <Link key={t.id} href={`/tickets/${t.id}`}
                      className="flex items-center justify-between p-3 rounded-lg transition-colors group"
                      style={{ background: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{t.title}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>{t.system?.name}</span>
                          {t.company && (
                            <span className="flex items-center gap-1 font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
                              — <CompanyLogo company={t.company} size="xs" /> {t.company.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mr-3">
                        <StatusBadge status={t.status} overdue />
                        <PriorityBadge priority={t.finalPriority} />
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </AppShell>
  );
}
