"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
  TEST_RESULT_LABELS,
  TEST_STATE_LABELS,
  TESTING_LABELS,
} from "@/lib/constants";
import { formatBugCode, formatCaseCode, formatSuiteCode } from "@/lib/utils";

/** The last run of a case. Never merged with the state chip — two axes. */
export function ResultBadge({ result }: { result?: string | null }) {
  if (!result) return null;
  return (
    <span className="brm-chip" data-result={result}>
      <span className={`brm-chip-dot ${result === "FAIL" ? "pulse-red" : ""}`} />
      {TEST_RESULT_LABELS[result] ?? result}
    </span>
  );
}

/** Authoring state of a suite or a case: DRAFT / ACTIVE / ARCHIVED. */
export function TestStateBadge({ state }: { state?: string | null }) {
  if (!state) return null;
  return (
    <span className="brm-chip" data-test-state={state}>
      <span className="brm-chip-dot" />
      {TEST_STATE_LABELS[state] ?? state}
    </span>
  );
}

/** Impact. Sits beside PriorityBadge, which answers a different question. */
export function SeverityBadge({ severity }: { severity?: string | null }) {
  if (!severity) return null;
  return (
    <span className="brm-chip" data-severity={severity} title={TESTING_LABELS.severity}>
      <span className="brm-chip-dot" />
      {BUG_SEVERITY_LABELS[severity] ?? severity}
    </span>
  );
}

export function BugStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <span className="brm-chip" data-bug-status={status}>
      <span className="brm-chip-dot" />
      {BUG_STATUS_LABELS[status] ?? status}
    </span>
  );
}

/**
 * `TS-0007` / `TC-0114` / `BUG-0114`, isolated LTR inside the RTL page so the
 * digits never reorder around the dash. Click copies — same pattern as tickets.
 */
export function TestCodeBadge({
  kind,
  value,
}: {
  kind: "suite" | "case" | "bug";
  value?: number | null;
}) {
  const code =
    kind === "suite"
      ? formatSuiteCode(value)
      : kind === "case"
        ? formatCaseCode(value)
        : formatBugCode(value);
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(TESTING_LABELS.copiedCode);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(TESTING_LABELS.copyFailed);
    }
  };

  return (
    <button
      type="button"
      dir="ltr"
      onClick={copy}
      title={TESTING_LABELS.copyCode}
      aria-label={`${TESTING_LABELS.copyCode} ${code}`}
      className="brm-ticket-code ltr-isolate inline-flex h-6 shrink-0 items-center gap-1 rounded-full border-0 px-2.5 font-brm text-xs font-semibold leading-4 transition-all"
    >
      {code}
      {copied ? <Check className="h-2.5 w-2.5" aria-hidden /> : <Copy className="h-2.5 w-2.5 opacity-50" aria-hidden />}
    </button>
  );
}
