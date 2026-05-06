"use client";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useDashboardStats, useDeveloperStats, useTicketTrend, useOverdueTickets } from "@/hooks/useReports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import Link from "next/link";

const COLORS = ["#4F46E5","#6366F1","#8B5CF6","#10B981","#F59E0B","#EF4444","#06B6D4","#84CC16"];

export default function ReportsPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: devStats } = useDeveloperStats();
  const { data: trend } = useTicketTrend();
  const { data: overdue } = useOverdueTickets();

  if (isLoading) return <AppShell><LoadingSpinner /></AppShell>;

  const statusData = stats?.ticketsByStatus?.map((s: any) => ({
    name: s.status, value: s._count,
  })) || [];

  return (
    <AppShell>
      <PageHeader title="التقارير والإحصائيات" />

      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "إجمالي", value: stats?.totalTickets, color: "text-primary" },
            { label: "مفتوحة", value: stats?.openTickets, color: "text-blue-600" },
            { label: "قيد التنفيذ", value: stats?.inProgressTickets, color: "text-indigo-600" },
            { label: "متأخرة", value: stats?.overdueTickets, color: "text-red-600" },
            { label: "حرجة", value: stats?.criticalTickets, color: "text-orange-600" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className={`text-3xl font-bold ${color}`}>{value ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Trend */}
          {trend?.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">اتجاه التذاكر الشهري</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trend}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="created" stroke="#4F46E5" name="مُنشأة" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="closed" stroke="#10B981" name="مُغلقة" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Status Distribution */}
          {statusData.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">توزيع الحالات</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={statusData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#4F46E5" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Developer Performance */}
        {devStats?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">أداء المطورين</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground text-right">
                      <th className="pb-2 font-medium">المطور</th>
                      <th className="pb-2 font-medium text-center">مُسندة</th>
                      <th className="pb-2 font-medium text-center">مكتملة</th>
                      <th className="pb-2 font-medium text-center">متأخرة</th>
                      <th className="pb-2 font-medium text-center">الإنجاز</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {devStats.map((dev: any) => (
                      <tr key={dev.id}>
                        <td className="py-3 font-medium">{dev.name}</td>
                        <td className="py-3 text-center">{dev.assigned}</td>
                        <td className="py-3 text-center text-emerald-600">{dev.completed}</td>
                        <td className="py-3 text-center text-red-500">{dev.overdue}</td>
                        <td className="py-3 text-center">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${dev.completionRate}%` }} />
                            </div>
                            <span className="text-xs shrink-0">{dev.completionRate}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overdue */}
        {overdue?.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base text-red-600">تذاكر متأخرة ({overdue.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overdue.map((t: any) => (
                  <Link key={t.id} href={`/tickets/${t.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground">{t.system?.name} — {format(new Date(t.estimatedDeadline), "d MMM yyyy", { locale: ar })}</p>
                    </div>
                    <div className="flex gap-2 shrink-0 mr-3">
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
    </AppShell>
  );
}
