"use client";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { usePermissions } from "@/hooks/usePermissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useDashboardStats, useDeveloperStats, useTicketTrend, useOverdueTickets } from "@/hooks/useReports";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import {
  buildStatusDistribution,
  formatTrendMonth,
  niceYAxisMax,
  rankDevelopers,
  summarizeDevelopers,
  trendTooltipRows,
  yAxisTicks,
  type DeveloperStat,
  type RankedDeveloper,
  type StatusCount,
} from "@/lib/report-charts";
import { TREND_SERIES_LABELS } from "@/lib/constants";
import { avatarTint, cn } from "@/lib/utils";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import Link from "next/link";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { AlertTriangle, CheckCircle2, ListTodo, TrendingUp, Users } from "lucide-react";

const RANK_TONES = ["#F59E0B", "#94A3B8", "#D97706"];

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {label}
      {count !== undefined && (
        <span className="font-brm text-[10px] opacity-70">{count}</span>
      )}
    </button>
  );
}

function MetricValue({
  value,
  tone,
  idle,
}: {
  value: number;
  tone?: "success" | "danger";
  idle?: boolean;
}) {
  if (idle) {
    return <span className="font-brm text-muted-foreground/40">—</span>;
  }
  if (value === 0) {
    return <span className="font-brm text-muted-foreground/45">0</span>;
  }
  if (tone === "success") {
    return <span className="font-brm font-semibold text-emerald-600 dark:text-emerald-400">{value}</span>;
  }
  if (tone === "danger") {
    return (
      <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-red-500/10 px-1.5 py-0.5 font-brm text-xs font-semibold text-red-600 dark:text-red-400">
        {value}
      </span>
    );
  }
  return <span className="font-brm font-medium tabular-nums">{value}</span>;
}

function DeveloperPerformance({ developers }: { developers: DeveloperStat[] }) {
  const [hideIdle, setHideIdle] = useState(true);
  const summary = useMemo(() => summarizeDevelopers(developers), [developers]);
  const rows = useMemo(
    () => rankDevelopers(developers, { hideIdle }),
    [developers, hideIdle],
  );

  const chips = [
    { label: "نشطون", value: summary.active, color: "#4F46E5", icon: Users },
    { label: "مُسندة", value: summary.assigned, color: "#6366F1", icon: ListTodo },
    { label: "مكتملة", value: summary.completed, color: "#10B981", icon: CheckCircle2 },
    { label: "متأخرة", value: summary.overdue, color: "#EF4444", icon: AlertTriangle },
    { label: "متوسط الإنجاز", value: `${summary.avgRate}%`, color: "#8B5CF6", icon: TrendingUp },
  ];

  return (
    <Card data-testid="developer-performance-card">
      <CardHeader className="border-b pb-4">
        <CardTitle className="text-base">أداء المطورين</CardTitle>
        <CardDescription className="text-[11px]">
          نسبة الإنجاز من التذاكر المُسندة — مرتبة حسب الأداء
        </CardDescription>
        <CardAction>
          <div
            className="flex flex-wrap gap-1 rounded-xl p-1"
            style={{ background: "var(--muted)" }}
            data-testid="developer-filter"
          >
            <FilterPill
              label="نشطون"
              count={summary.active}
              active={hideIdle}
              onClick={() => setHideIdle(true)}
            />
            <FilterPill
              label="الكل"
              count={summary.total}
              active={!hideIdle}
              onClick={() => setHideIdle(false)}
            />
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {chips.map((chip) => (
            <div
              key={chip.label}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: "var(--muted)" }}
            >
              <chip.icon className="size-3.5 shrink-0" style={{ color: chip.color }} />
              <div className="min-w-0">
                <p className="font-brm text-lg leading-none font-bold" style={{ color: chip.color }}>
                  {chip.value}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">{chip.label}</p>
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            لا يوجد مطورون بتذاكر مُسندة حالياً
          </p>
        ) : (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b text-right text-muted-foreground">
                  <th className="w-10 pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">المطور</th>
                  <th className="pb-2 text-center font-medium">مُسندة</th>
                  <th className="pb-2 text-center font-medium">مكتملة</th>
                  <th className="pb-2 text-center font-medium">متأخرة</th>
                  <th className="min-w-[9rem] pb-2 text-center font-medium">الإنجاز</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((dev) => (
                  <DeveloperRow key={dev.id} dev={dev} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DeveloperRow({ dev }: { dev: RankedDeveloper }) {
  const { can: allowed } = usePermissions();
  const tint = avatarTint(dev.id);
  const rankTone = !dev.idle && dev.rank <= 3 ? RANK_TONES[dev.rank - 1] : undefined;
  // Reports reach further than the staff directory does: without user:read the
  // profile page would bounce them straight back, so the name is plain text.
  const canOpenProfile = allowed("user:read");

  return (
    <tr
      data-testid={`dev-row-${dev.id}`}
      data-idle={dev.idle ? "true" : "false"}
      className={cn(
        "border-b border-border/60 last:border-0 transition-colors hover:bg-muted/50",
        dev.idle && "opacity-55",
        !dev.idle && dev.rank === 1 && "bg-primary/5",
      )}
    >
      <td className="py-3 pe-2">
        <span
          className="font-brm inline-flex size-6 items-center justify-center rounded-full text-[11px] font-bold"
          style={{
            color: rankTone ?? "var(--muted-foreground)",
            background: rankTone ? `${rankTone}22` : "transparent",
          }}
        >
          {dev.rank}
        </span>
      </td>
      <td className="py-3">
        {(() => {
          const body = (
            <>
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: `color-mix(in srgb, ${tint} 20%, transparent)`, color: tint }}
                aria-hidden="true"
              >
                {dev.initials}
              </div>
              <span className={cn("truncate font-medium", canOpenProfile && "hover:underline")}>
                {dev.name}
              </span>
            </>
          );
          return canOpenProfile ? (
            <Link href={`/users/${dev.id}`} className="flex min-w-0 items-center gap-2.5">{body}</Link>
          ) : (
            <div className="flex min-w-0 items-center gap-2.5">{body}</div>
          );
        })()}
      </td>
      <td className="py-3 text-center" data-testid={`dev-assigned-${dev.id}`}>
        <MetricValue value={dev.assigned} idle={dev.idle} />
      </td>
      <td className="py-3 text-center" data-testid={`dev-completed-${dev.id}`}>
        <MetricValue value={dev.completed} tone="success" idle={dev.idle} />
      </td>
      <td className="py-3 text-center" data-testid={`dev-overdue-${dev.id}`}>
        <MetricValue value={dev.overdue} tone="danger" idle={dev.idle} />
      </td>
      <td className="py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            {!dev.idle && (
              <div
                className="brm-dev-fill h-full"
                style={{ width: `${dev.completionRate}%` }}
                data-testid={`dev-bar-${dev.id}`}
                data-bar-percent={dev.completionRate}
              />
            )}
          </div>
          <span
            className={cn(
              "font-brm w-9 shrink-0 text-start text-xs tabular-nums",
              dev.idle ? "text-muted-foreground/40" : "text-muted-foreground",
            )}
            data-testid={`dev-rate-${dev.id}`}
          >
            {dev.idle ? "—" : `${dev.completionRate}%`}
          </span>
        </div>
      </td>
    </tr>
  );
}

function TrendYTick({
  x = 0,
  y = 0,
  payload,
}: {
  // Recharts types axis coordinates as `string | number`, so they are widened
  // here and coerced below rather than fought with a cast.
  x?: number | string;
  y?: number | string;
  payload?: { value: number | string };
}) {
  const cx = Number(x);
  const cy = Number(y);
  return (
    <text
      x={cx}
      y={cy}
      dy={3}
      textAnchor="end"
      fontSize={10}
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

export default function ReportsPage() {
  const { data: stats, isLoading } = useDashboardStats();
  const { data: devStats } = useDeveloperStats();
  const { data: trend } = useTicketTrend();
  const { data: overdue } = useOverdueTickets();

  if (isLoading) return <AppShell requires="report:read-team"><LoadingSpinner /></AppShell>;

  const { rows: statusRows, max: maxStatusValue } = buildStatusDistribution(
    (stats?.ticketsByStatus ?? []) as StatusCount[],
  );
  const trendMax = Math.max(0, ...(trend ?? []).flatMap((t: { created: number; closed: number }) => [t.created, t.closed]));
  const trendYMax = niceYAxisMax(trendMax);
  const trendYTicks = yAxisTicks(trendMax);

  return (
    <AppShell requires="report:read-team">
      <PageHeader title="التقارير والإحصائيات" />

      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "إجمالي", value: stats?.totalTickets, color: "text-primary" },
            { label: "مفتوحة", value: stats?.openTickets, color: "text-blue-600 dark:text-blue-400" },
            { label: "قيد التنفيذ", value: stats?.inProgressTickets, color: "text-indigo-600 dark:text-indigo-400" },
            { label: "متأخرة", value: stats?.overdueTickets, color: "text-red-600 dark:text-red-400" },
            { label: "حرجة", value: stats?.criticalTickets, color: "text-orange-600 dark:text-orange-400" },
          ].map(({ label, value, color }) => (
            <Card key={label}>
              <CardContent className="p-4 text-center">
                <p className={`text-3xl font-bold ${color}`}>{value ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
          <Card size="sm" className="h-full w-full min-w-0 gap-2 py-3" data-testid="trend-chart-card">
            <CardHeader className="shrink-0 pb-0">
              <CardTitle className="text-base">اتجاه التذاكر الشهري</CardTitle>
              <CardDescription className="text-[11px]">آخر 6 أشهر — مرّر لعرض العدد</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
              {trend?.length > 0 ? (
                <>
                  <div className="relative min-h-[220px] w-full flex-1">
                    <div dir="ltr" className="absolute inset-0">
                      <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ left: 4, right: 12, top: 12, bottom: 4 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="currentColor"
                          strokeOpacity={0.12}
                          vertical={false}
                        />
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
                          width={32}
                          domain={[0, trendYMax]}
                          ticks={trendYTicks}
                          tick={TrendYTick}
                          tickMargin={4}
                          axisLine={{ stroke: "currentColor", strokeOpacity: 0.35 }}
                          tickLine={false}
                          allowDecimals={false}
                        />
                        <Tooltip
                          content={<TrendTooltip />}
                          cursor={{ stroke: "currentColor", strokeOpacity: 0.25, strokeDasharray: "4 4" }}
                        />
                        <Line
                          type="linear"
                          dataKey="created"
                          stroke="#4F46E5"
                          name={TREND_SERIES_LABELS.created}
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          type="linear"
                          dataKey="closed"
                          stroke="#10B981"
                          name={TREND_SERIES_LABELS.closed}
                          strokeWidth={2}
                          dot={{ r: 3, strokeWidth: 2, fill: "var(--card)" }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="mt-1 flex shrink-0 justify-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full bg-[#4F46E5]" />
                      {TREND_SERIES_LABELS.created}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block size-2 rounded-full bg-[#10B981]" />
                      {TREND_SERIES_LABELS.closed}
                    </span>
                  </div>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات اتجاه بعد</p>
              )}
            </CardContent>
          </Card>

          <Card size="sm" className="h-full w-full min-w-0 gap-2 py-3" data-testid="status-chart-card">
            <CardHeader className="shrink-0 pb-0">
              <CardTitle className="text-base">توزيع الحالات</CardTitle>
              <CardDescription className="text-[11px]">مرتبة من الأكثر إلى الأقل</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
              {statusRows.length > 0 ? (
                <>
                  <ul className="sr-only">
                    {statusRows.map((s) => (
                      <li key={s.status}>{s.name}: {s.value} ({s.percent}%)</li>
                    ))}
                  </ul>
                  <div
                    className="grid w-full items-center gap-x-3 gap-y-2"
                    dir="rtl"
                    role="img"
                    aria-label="توزيع الحالات"
                    style={{ gridTemplateColumns: "max-content 2.25rem minmax(4.5rem, 1fr)" }}
                  >
                    {statusRows.map((s) => (
                      <div key={s.status} className="contents">
                        <span className="text-xs leading-5 whitespace-nowrap">{s.name}</span>
                        <span className="text-end text-[11px] font-brm leading-5 tabular-nums">{s.value}</span>
                        <div
                          className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
                          dir="rtl"
                          title={`${s.name}: ${s.value} (${s.percent}%)`}
                          data-testid={`status-bar-${s.status}`}
                          data-bar-percent={s.barPercent}
                        >
                          <div
                            className="h-full shrink-0 rounded-full"
                            style={{ width: `${s.barPercent}%`, backgroundColor: s.color }}
                          />
                        </div>
                      </div>
                    ))}
                    <div />
                    <div />
                    <div className="flex justify-between text-[10px] leading-none text-muted-foreground tabular-nums" dir="rtl">
                      <span>0</span>
                      <span>{maxStatusValue}</span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">لا توجد تذاكر لعرض توزيع الحالات</p>
              )}
            </CardContent>
          </Card>
        </div>

        {devStats && devStats.length > 0 && (
          <DeveloperPerformance developers={devStats} />
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
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                        {t.company && <><CompanyLogo company={t.company} size="xs" />{t.company.name} —</>}
                        <span>{t.system?.name} — {format(new Date(t.estimatedDeadline), "d MMM yyyy", { locale: ar })}</span>
                      </div>
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
