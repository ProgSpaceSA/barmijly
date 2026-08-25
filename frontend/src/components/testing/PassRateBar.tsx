"use client";
import { TESTING_LABELS } from "@/lib/constants";

export type SuiteRollup = {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  notRun: number;
  passRate: number;
  openBugs: number;
};

export type SuiteHealth = "failing" | "open-bugs" | "not-run" | "clean" | "draft";

/**
 * One word for how a suite is doing, in the order that matters to whoever
 * reads it: a failure outranks an open bug, which outranks work not yet
 * started. A draft has no health at all — nothing has been claimed yet.
 */
export function suiteHealth(
  rollup: SuiteRollup | undefined,
  state?: string | null,
): SuiteHealth {
  if (state === "DRAFT" || state === "ARCHIVED") return "draft";
  if (!rollup || !rollup.total) return "not-run";
  if (rollup.fail > 0) return "failing";
  if (rollup.openBugs > 0) return "open-bugs";
  if (rollup.notRun > 0) return "not-run";
  return "clean";
}

export const HEALTH_COLORS: Record<SuiteHealth, string> = {
  failing: "#EF4444",
  "open-bugs": "#F97316",
  "not-run": "#94A3B8",
  clean: "#10B981",
  draft: "#94A3B8",
};

/**
 * The pass rate as a bar plus its own number.
 *
 * The bar alone is a shape; the number alone is hard to scan across a list of
 * suites. Both, and the counts behind them stay in the tooltip rather than
 * crowding the card.
 */
export function PassRateBar({
  rollup,
  state,
  showLabel = true,
  className = "",
}: {
  rollup?: SuiteRollup;
  state?: string | null;
  showLabel?: boolean;
  className?: string;
}) {
  const health = suiteHealth(rollup, state);
  const rate = rollup?.passRate ?? 0;
  const detail = rollup
    ? `${TESTING_LABELS.passRate}: ${rate}% — ${rollup.pass}/${rollup.total}`
    : TESTING_LABELS.neverRun;

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`.trim()} title={detail}>
      <div
        className="brm-passrate"
        data-health={health}
        role="progressbar"
        aria-label={TESTING_LABELS.passRate}
        aria-valuenow={rate}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="brm-passrate-fill" style={{ width: `${rate}%` }} />
      </div>
      {showLabel && (
        <span
          className="font-brm shrink-0 text-xs tabular-nums"
          style={{ color: "var(--muted-foreground)" }}
        >
          {rate}%
        </span>
      )}
    </div>
  );
}
