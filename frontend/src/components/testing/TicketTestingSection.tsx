"use client";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bug as BugIcon, ChevronDown, ChevronRight, FlaskConical, Link2, Plus, X } from "lucide-react";
import { OrderedStepList } from "./OrderedStepList";
import { PassRateBar, type SuiteRollup } from "./PassRateBar";
import { LinkExistingBugDialog } from "./LinkExistingBugDialog";
import { BugStatusBadge, ResultBadge, SeverityBadge, TestCodeBadge } from "./TestingBadges";
import { useTicketTesting } from "@/hooks/useTestSuites";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { TESTING_LABELS, bugStatusColor } from "@/lib/constants";

type TicketTesting = {
  suites: {
    id: string;
    suiteNumber?: number | null;
    title: string;
    state: string;
    rollup?: SuiteRollup;
  }[];
  cases: {
    id: string;
    caseNumber?: number | null;
    title: string;
    state: string;
    lastResult: string;
    suite?: { id: string; title: string } | null;
    steps?: { id: string; order: number; body: string; attachments?: { id: string; url: string; fileName: string }[] }[];
  }[];
  bugs: {
    id: string;
    bugNumber?: number | null;
    title: string;
    severity: string;
    status: string;
  }[];
};

const ACTION_BTN =
  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold";

const ATTENTION_CASE = "FAIL";
const ATTENTION_CASE_BLOCKED = "BLOCKED";
const ATTENTION_BUG = new Set(["OPEN", "IN_PROGRESS"]);

/** Counts for the ticket Section title icons (non-zero only). */
export function ticketTestingAttentionCounts(data?: {
  cases?: { lastResult: string }[];
  bugs?: { status: string }[];
}) {
  const cases = data?.cases ?? [];
  const bugs = data?.bugs ?? [];
  return {
    openBugs: bugs.filter((b) => ATTENTION_BUG.has(b.status)).length,
    failedCases: cases.filter((c) => c.lastResult === ATTENTION_CASE).length,
    blockedCases: cases.filter((c) => c.lastResult === ATTENTION_CASE_BLOCKED).length,
  };
}

export function useTicketTestingAttention(ticketId: string) {
  const { data } = useTicketTesting(ticketId);
  return useMemo(() => ticketTestingAttentionCounts(data as TicketTesting | undefined), [data]);
}

function attentionBorder(kind: "fail" | "blocked" | "bug"): CSSProperties {
  if (kind === "fail") {
    return {
      borderInlineStart: "3px solid #EF4444",
      boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.15)",
    };
  }
  if (kind === "blocked") {
    return {
      borderInlineStart: "3px solid #F59E0B",
      boxShadow: "inset 0 0 0 1px rgba(245,158,11,0.15)",
    };
  }
  return {
    borderInlineStart: "3px solid #F59E0B",
    boxShadow: "inset 0 0 0 1px rgba(245,158,11,0.2)",
  };
}

/** Action buttons for the ticket Section `actions` slot (visual left in RTL). */
export function TicketTestingHeaderActions({
  canAuthor = false,
  canFileBug = false,
  canLinkBug = false,
  onFileBug,
  onLinkBug,
  onLinkSuite,
}: {
  canAuthor?: boolean;
  canFileBug?: boolean;
  canLinkBug?: boolean;
  onFileBug?: () => void;
  onLinkBug?: () => void;
  onLinkSuite?: () => void;
}) {
  if (!canFileBug && !canAuthor && !canLinkBug) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canFileBug && (
        <button
          type="button"
          onClick={onFileBug}
          className={ACTION_BTN}
          style={{
            minHeight: 36,
            background: "rgba(239,68,68,0.08)",
            color: "#EF4444",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {TESTING_LABELS.newBug}
        </button>
      )}
      {canLinkBug && (
        <button
          type="button"
          onClick={onLinkBug}
          className={ACTION_BTN}
          style={{
            minHeight: 36,
            background: "rgba(239,68,68,0.06)",
            color: "#DC2626",
            border: "1px solid rgba(239,68,68,0.20)",
          }}
        >
          <BugIcon className="h-3.5 w-3.5" aria-hidden />
          {TESTING_LABELS.linkBugToTicket}
        </button>
      )}
      {canAuthor && (
        <button
          type="button"
          onClick={onLinkSuite}
          className={ACTION_BTN}
          style={{
            minHeight: 36,
            background: "rgba(79,70,229,0.08)",
            color: "#4F46E5",
            border: "1px solid rgba(79,70,229,0.25)",
          }}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden />
          {TESTING_LABELS.linkSuiteFromTicket}
        </button>
      )}
    </div>
  );
}

/**
 * The «الاختبارات والأخطاء» card on the ticket page.
 *
 * Three groups, not three tabs: the ticket page is a stack of `Section` cards
 * with no tabs anywhere on it, and introducing one here would be a pattern that
 * exists in exactly one place. Steps are read-only — the workspace is where a
 * case gets edited.
 *
 * Action buttons live in the parent Section `actions` via
 * `TicketTestingHeaderActions` so they sit on the visual left in RTL.
 */
export function TicketTestingSection({
  ticketId,
  systemId,
  companyId,
  canAuthor = false,
  canFileBug = false,
  canLinkBug = false,
  canUnlink = false,
  linkBugOpen = false,
  onLinkBugOpenChange,
  onFileBug,
  onLinkSuite,
  onUnlinkSuite,
  onUnlinkCase,
  onUnlinkBug,
  onOpenImage,
}: {
  ticketId: string;
  systemId?: string;
  companyId?: string;
  canAuthor?: boolean;
  canFileBug?: boolean;
  /** Link an existing bug to this ticket (PATCH ticketId). */
  canLinkBug?: boolean;
  /** Author (or file-bug for bugs) may unlink — parent owns the confirm. */
  canUnlink?: boolean;
  /** Controlled link-bug dialog when header actions live in the parent Section. */
  linkBugOpen?: boolean;
  onLinkBugOpenChange?: (open: boolean) => void;
  onFileBug?: () => void;
  /** Receives the ids already linked, so the picker can grey them out. */
  onLinkSuite?: (linkedSuiteIds: string[]) => void;
  onUnlinkSuite?: (suiteId: string) => void;
  onUnlinkCase?: (caseId: string) => void;
  onUnlinkBug?: (bugId: string) => void;
  onOpenImage?: (attachmentId: string) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useTicketTesting(ticketId);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [internalLinkBugOpen, setInternalLinkBugOpen] = useState(false);

  const testing = data as TicketTesting | undefined;
  const suites = testing?.suites ?? [];
  const cases = testing?.cases ?? [];
  const bugs = testing?.bugs ?? [];
  const empty = !suites.length && !cases.length && !bugs.length;
  const showUnlink = canUnlink || canAuthor;
  const actionsInParent = Boolean(onLinkBugOpenChange);
  const showInlineActions =
    !actionsInParent && (canFileBug || canAuthor || canLinkBug);
  const dialogOpen = actionsInParent ? linkBugOpen : internalLinkBugOpen;
  const setDialogOpen = actionsInParent
    ? (open: boolean) => onLinkBugOpenChange?.(open)
    : setInternalLinkBugOpen;

  if (isLoading) {
    return (
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {TESTING_LABELS.loading}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {showInlineActions && (
        <TicketTestingHeaderActions
          canAuthor={canAuthor}
          canFileBug={canFileBug}
          canLinkBug={canLinkBug}
          onFileBug={onFileBug}
          onLinkBug={() => setDialogOpen(true)}
          onLinkSuite={() => onLinkSuite?.(suites.map((s) => s.id))}
        />
      )}

      {empty && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {TESTING_LABELS.ticketSectionEmpty}
        </p>
      )}

      {!!suites.length && (
        <Group title={TESTING_LABELS.linkedSuites}>
          {suites.map((suite) => (
            <div
              key={suite.id}
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg px-2.5 py-2 lg:flex-nowrap"
              style={{ background: "var(--muted)" }}
            >
              <Link
                href={`/test-suites/${suite.id}`}
                className="flex min-w-0 flex-1 flex-wrap items-center gap-2 lg:flex-nowrap"
              >
                <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden style={{ color: "#4F46E5" }} />
                <TestCodeBadge kind="suite" value={suite.suiteNumber} />
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  style={{ color: "var(--foreground)" }}
                >
                  {suite.title}
                </span>
                <span className="w-full max-w-full lg:w-32">
                  <PassRateBar rollup={suite.rollup} state={suite.state} />
                </span>
              </Link>
              {showUnlink && onUnlinkSuite && (
                <button
                  type="button"
                  onClick={() => onUnlinkSuite(suite.id)}
                  aria-label={TESTING_LABELS.unlinkSuite}
                  className="shrink-0 rounded p-1"
                  style={{ color: "var(--muted-foreground)", minHeight: 32, minWidth: 32 }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          ))}
        </Group>
      )}

      {!!cases.length && (
        <Group title={TESTING_LABELS.coveringCases}>
          {cases.map((testCase) => {
            const open = expanded === testCase.id;
            const workspaceHref = testCase.suite?.id
              ? `/test-suites/${testCase.suite.id}?caseId=${testCase.id}`
              : undefined;
            const needsAttention =
              testCase.lastResult === ATTENTION_CASE ||
              testCase.lastResult === ATTENTION_CASE_BLOCKED;
            const attentionKind =
              testCase.lastResult === ATTENTION_CASE ? "fail" : "blocked";
            return (
              <div
                key={testCase.id}
                className="min-w-0 rounded-lg"
                data-attention={needsAttention ? testCase.lastResult : undefined}
                style={{
                  background: "var(--muted)",
                  ...(needsAttention ? attentionBorder(attentionKind) : {}),
                }}
              >
                <div
                  className="flex w-full min-w-0 flex-wrap items-center gap-2 px-2.5 py-2"
                  style={{ minHeight: 44 }}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpanded(open ? null : testCase.id);
                    }}
                    aria-expanded={open}
                    aria-label={open ? TESTING_LABELS.cases : TESTING_LABELS.steps}
                    className="inline-flex items-center gap-1.5 text-start"
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                  </button>
                  <TestCodeBadge kind="case" value={testCase.caseNumber} />
                  {workspaceHref ? (
                    <Link
                      href={workspaceHref}
                      className="min-w-0 flex-1 truncate text-start text-xs"
                      style={{ color: "var(--foreground)" }}
                    >
                      {testCase.title}
                    </Link>
                  ) : (
                    <span
                      className="min-w-0 flex-1 truncate text-start text-xs"
                      style={{ color: "var(--foreground)" }}
                    >
                      {testCase.title}
                    </span>
                  )}
                  {testCase.lastResult === ATTENTION_CASE && (
                    <AlertTriangle
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: "#EF4444" }}
                      aria-hidden
                    />
                  )}
                  <ResultBadge result={testCase.lastResult} />
                  {showUnlink && onUnlinkCase && (
                    <button
                      type="button"
                      onClick={() => onUnlinkCase(testCase.id)}
                      aria-label={TESTING_LABELS.unlinkCase}
                      className="shrink-0 rounded p-1"
                      style={{ color: "var(--muted-foreground)", minHeight: 32, minWidth: 32 }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
                {open && (
                  <div className="px-2.5 pb-2.5">
                    <OrderedStepList
                      steps={testCase.steps ?? []}
                      label={TESTING_LABELS.steps}
                      readOnly
                      onOpenImage={onOpenImage}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Group>
      )}

      {!!bugs.length && (
        <Group title={TESTING_LABELS.filedBugs}>
          {bugs.map((bug) => {
            const needsAttention = ATTENTION_BUG.has(bug.status);
            return (
              <div
                key={bug.id}
                className="flex min-w-0 items-start gap-2 rounded-lg px-2.5 py-2 lg:items-center"
                data-attention={needsAttention ? bug.status : undefined}
                style={{
                  background: "var(--muted)",
                  ...(needsAttention ? attentionBorder("bug") : {}),
                }}
              >
                <Link
                  href={`/bugs/${bug.id}`}
                  className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <BugIcon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: bugStatusColor(bug.status) }}
                      aria-hidden
                    />
                    <TestCodeBadge kind="bug" value={bug.bugNumber} />
                    <span
                      className="min-w-0 flex-1 truncate text-xs"
                      style={{ color: "var(--foreground)" }}
                    >
                      {bug.title}
                    </span>
                    {needsAttention && (
                      <AlertTriangle
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: "#F59E0B" }}
                        aria-hidden
                      />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5 ps-5 lg:shrink-0 lg:ps-0">
                    <SeverityBadge severity={bug.severity} />
                    <BugStatusBadge status={bug.status} />
                  </span>
                </Link>
                {(showUnlink || canFileBug) && onUnlinkBug && (
                  <button
                    type="button"
                    onClick={() => onUnlinkBug(bug.id)}
                    aria-label={TESTING_LABELS.unlinkBug}
                    className="shrink-0 rounded p-1"
                    style={{ color: "var(--muted-foreground)", minHeight: 32, minWidth: 32 }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            );
          })}
        </Group>
      )}

      {dialogOpen && (
        <LinkExistingBugDialog
          ticketId={ticketId}
          systemId={systemId}
          companyId={companyId}
          linkedIds={bugs.map((b) => b.id)}
          onClose={() => setDialogOpen(false)}
          onLinked={() => {
            void qc.invalidateQueries({ queryKey: qk.ticket.testing(ticketId) });
          }}
        />
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <p className="font-brm mb-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {title}
      </p>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </section>
  );
}
