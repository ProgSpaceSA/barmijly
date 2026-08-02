"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonStat, SkeletonList } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { useDashboardStats, useOverdueTickets, useDeveloperStats, useTicketTrend } from "@/hooks/useReports";
import { useAuthStore } from "@/store/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { AlertTriangle, Clock, TrendingUp, Activity } from "lucide-react";
import Link from "next/link";
import { CompanyLogo } from "@/components/shared/CompanyLogo";

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

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: overdue } = useOverdueTickets();
  const { data: devStats } = useDeveloperStats();
  const { data: trend } = useTicketTrend();

  const isManager = user?.role && ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"].includes(user.role);
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
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="إجمالي التذاكر"   value={stats?.totalTickets}    icon={Activity}      color="bg-indigo-500"  sparkData={trendCreated} sparkColor="#6366F1" />
            <StatCard title="تذاكر مفتوحة"    value={stats?.openTickets}     icon={Clock}         color="bg-blue-500"    sparkData={trendCreated} sparkColor="#3B82F6" />
            <StatCard title="قيد التنفيذ"      value={stats?.inProgressTickets} icon={TrendingUp}  color="bg-violet-500"  />
            <StatCard title="متأخرة"           value={stats?.overdueTickets}  icon={AlertTriangle} color="bg-red-500"    sparkData={[]} sparkColor="#EF4444" />
          </div>

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
