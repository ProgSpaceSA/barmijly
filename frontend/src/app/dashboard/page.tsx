"use client";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useDashboardStats, useOverdueTickets, useDeveloperStats, useTicketTrend } from "@/hooks/useReports";
import { useAuthStore } from "@/store/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { ROLE_LABELS, TICKET_STATUS_LABELS } from "@/lib/constants";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { AlertTriangle, Clock, TrendingUp, CheckCircle, Activity, Users } from "lucide-react";
import Link from "next/link";

function StatCard({ title, value, icon: Icon, color }: any) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value ?? "—"}</p>
          </div>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: stats, isLoading } = useDashboardStats();
  const { data: overdue } = useOverdueTickets();
  const { data: devStats } = useDeveloperStats();
  const { data: trend } = useTicketTrend();

  const isManager = user?.role && ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"].includes(user.role);

  return (
    <AppShell>
      <PageHeader
        title={`مرحباً، ${user?.firstName} 👋`}
        description={ROLE_LABELS[user?.role || ""]}
      />

      {isLoading ? <LoadingSpinner /> : (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="إجمالي التذاكر" value={stats?.totalTickets} icon={Activity} color="bg-primary" />
            <StatCard title="تذاكر مفتوحة" value={stats?.openTickets} icon={Clock} color="bg-blue-500" />
            <StatCard title="قيد التنفيذ" value={stats?.inProgressTickets} icon={TrendingUp} color="bg-indigo-500" />
            <StatCard title="متأخرة" value={stats?.overdueTickets} icon={AlertTriangle} color="bg-red-500" />
          </div>

          {isManager && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Trend Chart */}
              {trend && trend.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">اتجاه التذاكر (6 أشهر)</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trend}>
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="created" stroke="#4F46E5" name="مُنشأة" strokeWidth={2} />
                        <Line type="monotone" dataKey="closed" stroke="#10B981" name="مُغلقة" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Developer Stats */}
              {devStats && devStats.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">أداء المطورين</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {devStats.slice(0, 5).map((dev: any) => (
                        <div key={dev.id} className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                            {dev.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="font-medium truncate">{dev.name}</span>
                              <span className="text-muted-foreground shrink-0">{dev.completed}/{dev.assigned}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${dev.completionRate}%` }} />
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

          {/* Overdue Tickets */}
          {overdue && overdue.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  التذاكر المتأخرة ({overdue.length})
                </CardTitle>
                <Link href="/tickets?status=overdue" className="text-sm text-primary hover:underline">عرض الكل</Link>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {overdue.slice(0, 5).map((t: any) => (
                    <Link key={t.id} href={`/tickets/${t.id}`}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary">{t.title}</p>
                        <p className="text-xs text-muted-foreground">{t.system?.name} — {t.company?.name}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 mr-3">
                        <StatusBadge status={t.status} />
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
