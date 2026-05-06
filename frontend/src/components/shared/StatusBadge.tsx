"use client";
import { cn } from "@/lib/utils";
import { TICKET_STATUS_LABELS, TICKET_STATUS_COLORS, PRIORITY_LABELS, PRIORITY_COLORS } from "@/lib/constants";

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", TICKET_STATUS_COLORS[status] || "bg-gray-100 text-gray-700")}>
      {TICKET_STATUS_LABELS[status] || status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority?: string | null }) {
  if (!priority) return null;
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", PRIORITY_COLORS[priority] || "bg-gray-100 text-gray-700")}>
      {PRIORITY_LABELS[priority] || priority}
    </span>
  );
}
