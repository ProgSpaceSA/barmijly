"use client";
import { Bug, Paperclip } from "lucide-react";
import {
  RESOLVED_BUG_STATUSES,
  TEST_RESULT_LABELS,
  TEST_STATE_LABELS,
  bugStatusColor,
} from "@/lib/constants";
import { formatCaseCode } from "@/lib/utils";

export type TestCaseSummary = {
  id: string;
  caseNumber?: number | null;
  title: string;
  state: string;
  lastResult: string;
  assignedTo?: { id: string; firstName?: string; lastName?: string } | null;
  bugs?: { status: string }[];
  _count?: { bugs?: number; openBugs?: number; attachments?: number; steps?: number };
};

/** The dot colour is the result, not the state — a draft is grey either way. */
const RESULT_DOTS: Record<string, string> = {
  PASS: "#10B981",
  FAIL: "#EF4444",
  BLOCKED: "#F97316",
  SKIPPED: "#6B7280",
  NOT_RUN: "#94A3B8",
};

const RESOLVED = new Set<string>(RESOLVED_BUG_STATUSES);

/** Bug-count accent: open attention red/amber, all-resolved green. */
export function caseBugIconColor(testCase: TestCaseSummary): string {
  if (typeof testCase._count?.openBugs === "number") {
    return testCase._count.openBugs > 0 ? "#EF4444" : "#10B981";
  }
  if (testCase.bugs?.length) {
    const allResolved = testCase.bugs.every((b) => RESOLVED.has(b.status));
    if (allResolved) return "#10B981";
    const hasOpen = testCase.bugs.some((b) => b.status === "OPEN" || b.status === "IN_PROGRESS");
    return hasOpen ? bugStatusColor(testCase.bugs.find((b) => !RESOLVED.has(b.status))!.status) : "#F59E0B";
  }
  const total = testCase._count?.bugs ?? 0;
  return total > 0 ? "#EF4444" : "#94A3B8";
}

/**
 * One row in the case panel. Deliberately dense: result, title, code, and only
 * the counts that change what you would do next.
 *
 * `shrink-0` is required — the panel list is a flex column, and without it
 * rows compress so the meta line paints outside the selected background.
 */
export function TestCaseRow({
  testCase,
  selected = false,
  onSelect,
}: {
  testCase: TestCaseSummary;
  selected?: boolean;
  onSelect?: (id: string) => void;
}) {
  const bugCount = testCase._count?.bugs ?? testCase.bugs?.length ?? 0;
  const fileCount = testCase._count?.attachments ?? 0;
  const isDraft = testCase.state === "DRAFT";
  const code = formatCaseCode(testCase.caseNumber);

  return (
    <button
      type="button"
      onClick={() => onSelect?.(testCase.id)}
      aria-current={selected ? "true" : undefined}
      className="flex w-full shrink-0 flex-col gap-1.5 rounded-xl px-3 py-2.5 text-start transition-colors"
      style={{
        background: selected ? "rgba(79,70,229,0.10)" : "transparent",
      }}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: RESULT_DOTS[testCase.lastResult] ?? RESULT_DOTS.NOT_RUN }}
        />
        <span className="sr-only">{TEST_RESULT_LABELS[testCase.lastResult]}</span>
        <span
          className="min-w-0 flex-1 truncate text-sm font-medium"
          style={{ color: "var(--foreground)" }}
        >
          {testCase.title}
        </span>
      </span>

      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ps-[18px]">
        {code && (
          <span
            dir="ltr"
            className="ltr-isolate rounded-md px-1.5 py-0.5 font-brm text-[0.65rem] font-semibold"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            {code}
          </span>
        )}
        {isDraft && (
          <span
            className="rounded px-1.5 text-[0.65rem] font-semibold"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
          >
            {TEST_STATE_LABELS.DRAFT}
          </span>
        )}
        {bugCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[0.65rem] tabular-nums"
            style={{ color: caseBugIconColor(testCase) }}
          >
            <Bug className="h-2.5 w-2.5" aria-hidden />
            {bugCount}
          </span>
        )}
        {fileCount > 0 && (
          <span
            className="inline-flex items-center gap-1 text-[0.65rem] tabular-nums"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Paperclip className="h-2.5 w-2.5" aria-hidden />
            {fileCount}
          </span>
        )}
      </span>
    </button>
  );
}
