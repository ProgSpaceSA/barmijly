import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { TICKET_STATUS_LABELS, TREND_SERIES_LABELS } from "@/lib/constants";

export type TrendSeriesKey = keyof typeof TREND_SERIES_LABELS;

export type TrendTooltipEntry = {
  dataKey?: string | number;
  value?: number;
  color?: string;
  name?: string;
};

export type TrendTooltipRow = {
  key: TrendSeriesKey;
  label: string;
  value: number;
  color?: string;
};

const TREND_SERIES_ORDER: TrendSeriesKey[] = ["created", "closed"];

function isTrendSeriesKey(key: string): key is TrendSeriesKey {
  return key === "created" || key === "closed";
}

/**
 * Area fills and line strokes share a dataKey, so Recharts sends both.
 * Keep one row per series and always use the Arabic label — never the English key.
 */
export function trendTooltipRows(payload: TrendTooltipEntry[] | undefined): TrendTooltipRow[] {
  const latest = new Map<TrendSeriesKey, TrendTooltipEntry>();
  for (const entry of payload ?? []) {
    const key = String(entry.dataKey);
    if (!isTrendSeriesKey(key)) continue;
    latest.set(key, entry);
  }
  return TREND_SERIES_ORDER.flatMap((key) => {
    const entry = latest.get(key);
    if (!entry) return [];
    return [
      {
        key,
        label: TREND_SERIES_LABELS[key],
        value: entry.value ?? 0,
        color: entry.color,
      },
    ];
  });
}

/** Workflow order used only to break ties after sorting by count. */
export const STATUS_FLOW_ORDER = [
  "DRAFT",
  "NEW",
  "AWAITING_INFO",
  "AWAITING_APPROVAL",
  "REJECTED",
  "APPROVED",
  "SCHEDULED",
  "IN_PROGRESS",
  "ON_HOLD",
  "AWAITING_TESTING",
  "AWAITING_OWNER_APPROVAL",
  "COMPLETED",
  "CLOSED",
];

/** Hex fills aligned with StatusBadge dots so the chart matches ticket chips. */
export const STATUS_CHART_COLORS: Record<string, string> = {
  DRAFT: "#94A3B8",
  NEW: "#3B82F6",
  AWAITING_INFO: "#F59E0B",
  AWAITING_APPROVAL: "#F97316",
  APPROVED: "#10B981",
  REJECTED: "#EF4444",
  SCHEDULED: "#8B5CF6",
  IN_PROGRESS: "#4F46E5",
  AWAITING_TESTING: "#06B6D4",
  AWAITING_OWNER_APPROVAL: "#14B8A6",
  COMPLETED: "#059669",
  CLOSED: "#6B7280",
  ON_HOLD: "#64748B",
};

export type StatusCount = { status: string; _count: number };

export type StatusDistributionRow = {
  status: string;
  name: string;
  value: number;
  percent: number;
  barPercent: number;
  color: string;
};

function flowIndex(status: string) {
  const i = STATUS_FLOW_ORDER.indexOf(status);
  return i === -1 ? STATUS_FLOW_ORDER.length : i;
}

/**
 * Builds a ranked horizontal-bar series. Length is `value / max * 100` so equal
 * counts share the same bar length regardless of label width.
 */
export function buildStatusDistribution(ticketsByStatus: StatusCount[]): {
  rows: StatusDistributionRow[];
  max: number;
  total: number;
} {
  const total = ticketsByStatus.reduce((sum, s) => sum + s._count, 0);
  const max = Math.max(0, ...ticketsByStatus.map((s) => s._count));
  const scale = Math.max(max, 1);

  const rows = ticketsByStatus
    .map((s) => ({
      status: s.status,
      name: TICKET_STATUS_LABELS[s.status] || s.status,
      value: s._count,
      percent: total > 0 ? Math.round((s._count / total) * 100) : 0,
      barPercent: (s._count / scale) * 100,
      color: STATUS_CHART_COLORS[s.status] ?? "#4F46E5",
    }))
    .sort((a, b) => b.value - a.value || flowIndex(a.status) - flowIndex(b.status));

  return { rows, max, total };
}

/** 0 at the reading start (right in RTL), max at the far end. */
export function statusAxisTicks(max: number): number[] {
  if (max <= 0) return [0];
  if (max <= 4) return Array.from({ length: max + 1 }, (_, i) => i);
  const step = Math.ceil(max / 4);
  const ticks: number[] = [];
  for (let v = 0; v < max; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

export function parseTrendMonth(month: string): Date {
  const [year, m] = month.split("-").map(Number);
  return new Date(year, (m || 1) - 1, 1);
}

export function formatTrendMonth(month: string, style: "axis" | "tooltip" = "axis"): string {
  const date = parseTrendMonth(month);
  if (Number.isNaN(date.getTime())) return month;
  return style === "tooltip"
    ? format(date, "MMMM yyyy", { locale: ar })
    : format(date, "LLL", { locale: ar });
}

/** Round the Y domain up so tick labels stay whole numbers with headroom. */
export function niceYAxisMax(maxValue: number): number {
  if (maxValue <= 0) return 4;
  const padded = Math.max(4, Math.ceil(maxValue * 1.15));
  if (padded <= 4) return 4;
  if (padded <= 6) return 6;
  if (padded <= 8) return 8;
  if (padded <= 10) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const residual = padded / magnitude;
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  return Math.ceil(nice * magnitude);
}

export function yAxisTicks(maxValue: number): number[] {
  const nice = niceYAxisMax(maxValue);
  const steps = 4;
  const step = nice / steps;
  return Array.from({ length: steps + 1 }, (_, i) => Math.round(i * step));
}

export type DeveloperStat = {
  id: string;
  name: string;
  assigned: number;
  completed: number;
  overdue: number;
  completionRate: number;
};

export type RankedDeveloper = DeveloperStat & {
  rank: number;
  initials: string;
  idle: boolean;
};

export function developerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  const first = [...parts[0]][0] ?? "";
  if (parts.length === 1) {
    const second = [...parts[0]][1] ?? "";
    return `${first}${second}` || first || "؟";
  }
  const last = [...parts[parts.length - 1]][0] ?? "";
  return `${first}${last}`;
}

function compareDevelopers(a: DeveloperStat, b: DeveloperStat) {
  const idleDelta = Number(a.assigned === 0) - Number(b.assigned === 0);
  if (idleDelta !== 0) return idleDelta;
  if (b.completed !== a.completed) return b.completed - a.completed;
  if (b.completionRate !== a.completionRate) return b.completionRate - a.completionRate;
  if (a.overdue !== b.overdue) return a.overdue - b.overdue;
  if (b.assigned !== a.assigned) return b.assigned - a.assigned;
  return a.name.localeCompare(b.name, "ar");
}

/** Active developers first, then completed volume, then completion rate. Idle rows keep a rank after the active set. */
export function rankDevelopers(
  developers: DeveloperStat[],
  options: { hideIdle?: boolean } = {},
): RankedDeveloper[] {
  const ranked = [...developers].sort(compareDevelopers).map((dev, index) => ({
    ...dev,
    rank: index + 1,
    initials: developerInitials(dev.name),
    idle: dev.assigned === 0,
  }));
  return options.hideIdle ? ranked.filter((dev) => !dev.idle) : ranked;
}

export function summarizeDevelopers(developers: DeveloperStat[]) {
  const active = developers.filter((dev) => dev.assigned > 0);
  const assigned = developers.reduce((sum, dev) => sum + dev.assigned, 0);
  const completed = developers.reduce((sum, dev) => sum + dev.completed, 0);
  const overdue = developers.reduce((sum, dev) => sum + dev.overdue, 0);
  return {
    total: developers.length,
    active: active.length,
    assigned,
    completed,
    overdue,
    avgRate:
      active.length === 0
        ? 0
        : Math.round(active.reduce((sum, dev) => sum + dev.completionRate, 0) / active.length),
  };
}
