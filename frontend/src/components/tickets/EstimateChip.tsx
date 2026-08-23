"use client";
import { Fragment } from "react";
import { Gauge, Timer } from "lucide-react";
import { DIFFICULTY_LABELS, ESTIMATE_LABELS } from "@/lib/constants";

/**
 * Estimate and actual side by side.
 *
 * Hours and difficulty are two different questions — how long, and how hard —
 * so both are shown rather than folded into one number. `actual` excludes any
 * time the ticket spent blocked or on hold, which is why it can be well under
 * the wall-clock gap between start and finish.
 */
export function EstimateChip({
  hours,
  difficulty,
  actual,
  className = "",
  inline = false,
}: {
  hours?: number | null;
  difficulty?: number | null;
  actual?: number | null;
  className?: string;
  /** Join hours and difficulty with · instead of a wide flex gap — for task meta lines. */
  inline?: boolean;
}) {
  const parts: React.ReactNode[] = [];

  if (hours != null) {
    const showActual = actual != null && actual > 0;
    parts.push(
      <span key="h" className="inline-flex items-center gap-1" title={ESTIMATE_LABELS.hours}>
        <Timer className="w-3 h-3 shrink-0" aria-hidden />
        {showActual
          ? `${ESTIMATE_LABELS.actualHours(actual)} / ${ESTIMATE_LABELS.hoursShort(hours)}`
          : ESTIMATE_LABELS.hoursShort(hours)}
      </span>,
    );
  } else if (actual != null && actual > 0) {
    parts.push(
      <span key="a" className="inline-flex items-center gap-1" title={ESTIMATE_LABELS.actual}>
        <Timer className="w-3 h-3 shrink-0" aria-hidden />
        {ESTIMATE_LABELS.actualHours(actual)}
      </span>,
    );
  }

  if (difficulty != null) {
    parts.push(
      <span key="d" className="inline-flex items-center gap-1" title={ESTIMATE_LABELS.difficulty}>
        <Gauge className="w-3 h-3 shrink-0" aria-hidden />
        {DIFFICULTY_LABELS[difficulty] ?? difficulty}
      </span>,
    );
  }

  if (!parts.length) return null;

  if (inline) {
    return (
      <span className={`inline-flex flex-wrap items-center text-xs leading-none ${className}`} style={{ color: "var(--muted-foreground)" }}>
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <span className="px-1 opacity-50 select-none" aria-hidden>
                ·
              </span>
            )}
            {part}
          </Fragment>
        ))}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-3 text-xs ${className}`}
      style={{ color: "var(--muted-foreground)" }}
    >
      {parts}
    </span>
  );
}
