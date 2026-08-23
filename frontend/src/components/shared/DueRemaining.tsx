"use client";

import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { DUE_REMAINING_LABELS } from "@/lib/constants";
import { parseTimestamp } from "@/lib/dates";
import { dueRemaining } from "@/lib/due-remaining";
import type { CSSProperties } from "react";

export function DueRemaining({
  date,
  className,
  style,
}: {
  date?: string | Date | null;
  className?: string;
  style?: CSSProperties;
}) {
  const remaining = dueRemaining(date);
  if (!remaining || !date) return null;

  const parsed = parseTimestamp(date);
  const toneClass =
    remaining.tone === "overdue" ? "brm-overdue" : remaining.tone === "soon" ? "brm-soon" : "";
  const absolute = format(parsed, "d MMM yyyy", { locale: ar });

  return (
    <time
      dateTime={parsed.toISOString()}
      title={`${DUE_REMAINING_LABELS.field} — ${absolute}`}
      aria-label={DUE_REMAINING_LABELS.field}
      className={`whitespace-nowrap ${toneClass} ${className ?? ""}`}
      style={{
        color: remaining.tone === "ok" ? "var(--muted-foreground)" : undefined,
        ...style,
      }}
    >
      {remaining.label}
    </time>
  );
}
