"use client";
import { TICKET_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/constants";

const STATUS_CONFIG: Record<string, { dot: string; bg: string; text: string; pulse?: string }> = {
  DRAFT:                  { dot: "#94A3B8", bg: "rgba(148,163,184,0.12)", text: "#64748B" },
  NEW:                    { dot: "#3B82F6", bg: "rgba(59,130,246,0.1)",   text: "#2563EB" },
  AWAITING_INFO:          { dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",   text: "#B45309" },
  AWAITING_APPROVAL:      { dot: "#F97316", bg: "rgba(249,115,22,0.1)",   text: "#C2410C" },
  APPROVED:               { dot: "#10B981", bg: "rgba(16,185,129,0.1)",   text: "#065F46" },
  REJECTED:               { dot: "#EF4444", bg: "rgba(239,68,68,0.1)",    text: "#B91C1C" },
  SCHEDULED:              { dot: "#8B5CF6", bg: "rgba(139,92,246,0.1)",   text: "#6D28D9" },
  IN_PROGRESS:            { dot: "#22C55E", bg: "rgba(34,197,94,0.1)",    text: "#15803D", pulse: "green" },
  AWAITING_TESTING:       { dot: "#06B6D4", bg: "rgba(6,182,212,0.1)",    text: "#0E7490" },
  AWAITING_OWNER_APPROVAL:{ dot: "#14B8A6", bg: "rgba(20,184,166,0.1)",   text: "#0F766E" },
  COMPLETED:              { dot: "#10B981", bg: "rgba(16,185,129,0.1)",   text: "#065F46" },
  CLOSED:                 { dot: "#6B7280", bg: "rgba(107,114,128,0.1)",  text: "#374151" },
  ON_HOLD:                { dot: "#94A3B8", bg: "rgba(148,163,184,0.1)",  text: "#475569" },
};

const PRIORITY_CONFIG: Record<string, { dot: string; bg: string; text: string }> = {
  CRITICAL: { dot: "#EF4444", bg: "rgba(239,68,68,0.1)",    text: "#B91C1C" },
  HIGH:     { dot: "#F97316", bg: "rgba(249,115,22,0.1)",   text: "#C2410C" },
  MEDIUM:   { dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",   text: "#92400E" },
  LOW:      { dot: "#22C55E", bg: "rgba(34,197,94,0.1)",    text: "#15803D" },
  DEFERRED: { dot: "#94A3B8", bg: "rgba(148,163,184,0.1)",  text: "#475569" },
};

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const cfg = STATUS_CONFIG[status] ?? { dot: "#94A3B8", bg: "rgba(148,163,184,0.1)", text: "#64748B" };
  const dotClass = overdue ? "pulse-red" : cfg.pulse === "green" ? "pulse-green" : "";

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: overdue ? "rgba(239,68,68,0.1)" : cfg.bg, color: overdue ? "#B91C1C" : cfg.text }}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`}
        style={{ background: overdue ? "#EF4444" : cfg.dot }}
      />
      {overdue ? "متأخرة" : (TICKET_STATUS_LABELS[status] || status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  const cfg = PRIORITY_CONFIG[priority] ?? { dot: "#94A3B8", bg: "rgba(148,163,184,0.1)", text: "#475569" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}
