"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonStat, SkeletonList } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { useDashboardStats, useOverdueTickets, useDeveloperStats, useTicketTrend } from "@/hooks/useReports";
import { useMyTasks, useUpdateTaskStatus } from "@/hooks/useTasks";
import { useAuthStore } from "@/store/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { AlertTriangle, Clock, TrendingUp, Activity, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { format, isAfter, isBefore, addDays } from "date-fns";
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

function DevTaskHub() {
  const { data: tasks, isLoading } = useMyTasks();
  const { mutate: updateStatus, isPending } = useUpdateTaskStatus();
  const [filter, setFilter] = useState<"all" | "NEW" | "IN_PROGRESS" | "COMPLETED">("all");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const sorted: any[] = [...(tasks ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
  );

  const filtered = filter === "all" ? sorted : sorted.filter(t => t.status === filter);

  const counts = {
    total:       tasks?.length ?? 0,
    NEW:         tasks?.filter((t: any) => t.status === "NEW").length ?? 0,
    IN_PROGRESS: tasks?.filter((t: any) => t.status === "IN_PROGRESS").length ?? 0,
    COMPLETED:   tasks?.filter((t: any) => t.status === "COMPLETED").length ?? 0,
  };

  function cycleStatus(task: any) {
    const next = NEXT_STATUS[task.status];
    if (!next) return;
    setPendingId(task.id);
    updateStatus({ id: task.id, status: next }, { onSettled: () => setPendingId(null) });
  }

  const FILTERS = [
    { key: "all",         label: "--all",          count: counts.total },
    { key: "NEW",         label: "--new",           count: counts.NEW },
    { key: "IN_PROGRESS", label: "--in-progress",   count: counts.IN_PROGRESS },
    { key: "COMPLETED",   label: "--completed",     count: counts.COMPLETED },
  ] as const;

  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>
      {/* Terminal header */}
      <div style={{ background: "var(--foreground)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FF5F57", display: "block" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#FEBC2E", display: "block" }} />
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#28C840", display: "block" }} />
        </div>
        <span className="font-brm" style={{ color: "var(--background)", fontSize: 12, opacity: 0.7, flex: 1 }}>
          $ brmctl tasks --assignee:me
        </span>
        <span className="font-brm" style={{ fontSize: 11, color: counts.IN_PROGRESS > 0 ? "#28C840" : "rgba(255,255,255,0.3)" }}>
          {counts.IN_PROGRESS > 0 ? `● ${counts.IN_PROGRESS} active` : "○ idle"}
        </span>
      </div>

      <div style={{ background: "var(--card)" }}>
        {/* Stat chips */}
        <div style={{ display: "flex", gap: 0, padding: "12px 16px 0", overflowX: "auto" }}>
          {([
            { label: "total",       val: counts.total,       color: "var(--muted-foreground)" },
            { label: "new",         val: counts.NEW,         color: "#3B82F6" },
            { label: "in_progress", val: counts.IN_PROGRESS, color: "#F59E0B" },
            { label: "completed",   val: counts.COMPLETED,   color: "#10B981" },
          ] as const).map(s => (
            <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "6px 8px", minWidth: 70 }}>
              <div className="font-brm" style={{ fontSize: 22, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.val}</div>
              <div className="font-brm" style={{ fontSize: 10, color: "var(--muted-foreground)", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--border)", margin: "12px 0 0" }} />

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 2, padding: "8px 16px", overflowX: "auto" }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="font-brm"
              style={{
                fontSize: 11,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: filter === f.key ? "#4F46E5" : "var(--border)",
                background: filter === f.key ? "rgba(79,70,229,0.1)" : "transparent",
                color: filter === f.key ? "#4F46E5" : "var(--muted-foreground)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition: "all 0.12s",
              }}
            >
              {f.label}
              <span style={{ marginRight: 5, opacity: 0.6 }}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Task list */}
        <div style={{ padding: "4px 0 8px" }}>
          {isLoading ? (
            <div style={{ padding: "16px 24px" }}><SkeletonList count={3} /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div className="font-brm" style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
                // no tasks match this filter
              </div>
            </div>
          ) : (
            filtered.map((task: any) => {
              const cfg = STATUS_CFG[task.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.NEW;
              const brmNum = task.ticket?.ticketNumber
                ? `BRM-${String(task.ticket.ticketNumber).padStart(4, "0")}`
                : null;
              const isPendingThis = pendingId === task.id && isPending;

              return (
                <div
                  key={task.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 20px",
                    borderBottom: "1px solid var(--border)",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  {/* Status cycle button */}
                  <TaskStatusDot status={task.status} onClick={() => cycleStatus(task)} pending={isPendingThis} />

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/tickets/${task.ticket?.id}`}
                      style={{ display: "block", fontWeight: 600, fontSize: 14, color: "var(--foreground)", marginBottom: 3 }}
                      className="truncate hover:underline"
                    >
                      {task.title}
                    </Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {brmNum && (
                        <Link href={`/tickets/${task.ticket?.id}`}>
                          <span className="font-brm" style={{ fontSize: 11, color: "#4F46E5", opacity: 0.85 }}>{brmNum}</span>
                        </Link>
                      )}
                      {brmNum && <span style={{ color: "var(--border)", fontSize: 11 }}>·</span>}
                      <Link href={`/tickets/${task.ticket?.id}`} className="truncate">
                        <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{task.ticket?.title}</span>
                      </Link>
                    </div>
                  </div>

                  {/* Right side: status chip + due date */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    <DueDateLabel date={task.dueDate} />
                    <span
                      className="font-brm"
                      style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 4,
                        background: cfg.bg, color: cfg.color,
                        border: `1px solid ${cfg.color}33`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {task.status}
                    </span>
                    <ChevronRight style={{ width: 14, height: 14, color: "var(--muted-foreground)", opacity: 0.5 }} />
                  </div>
                </div>
              );
            })
          )}
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
