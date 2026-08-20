"use client";
import { TICKET_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/constants";

export function StatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const dotClass = overdue ? "pulse-red" : status === "IN_PROGRESS" ? "pulse-green" : "";

  return (
    <span className="brm-chip" data-status={status} data-overdue={overdue ? "true" : undefined}>
      <span className={`brm-chip-dot ${dotClass}`} />
      {overdue ? "متأخرة" : (TICKET_STATUS_LABELS[status] || status)}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return (
    <span className="brm-chip" data-priority={priority}>
      <span className="brm-chip-dot" />
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}
