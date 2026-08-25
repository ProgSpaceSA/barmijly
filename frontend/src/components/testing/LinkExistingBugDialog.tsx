"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bug as BugIcon, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { BugStatusBadge, SeverityBadge } from "./TestingBadges";
import { useBugActions, useBugs } from "@/hooks/useBugs";
import { TESTING_LABELS, bugStatusColor } from "@/lib/constants";
import { formatBugCode } from "@/lib/utils";

type BugRow = {
  id: string;
  bugNumber?: number | null;
  title: string;
  description?: string | null;
  severity: string;
  status: string;
  ticketId?: string | null;
  testCaseId?: string | null;
  system?: { id: string; name: string } | null;
};

/** Shape handed back so the case bugs pane can paint without waiting on cache. */
export type LinkedBugSummary = {
  id: string;
  bugNumber?: number | null;
  title: string;
  severity: string;
  status: string;
  ticketId?: string | null;
  testCaseId?: string | null;
  description?: string | null;
};

/**
 * Searchable picker to link an existing bug to a case or a ticket.
 * The whole row is clickable — no separate «ربط» control.
 */
export function LinkExistingBugDialog({
  caseId,
  ticketId,
  suiteId,
  systemId,
  companyId,
  linkedIds,
  onClose,
  onLinked,
}: {
  caseId?: string;
  ticketId?: string;
  suiteId?: string;
  systemId?: string;
  companyId?: string;
  linkedIds: string[];
  onClose: () => void;
  /** Called with the row that was linked so the parent can paint it immediately. */
  onLinked?: (bug: LinkedBugSummary) => void;
}) {
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const filters = useMemo(() => {
    const next: Record<string, string> = { limit: "50" };
    if (systemId) next.systemId = systemId;
    else if (suiteId) next.suiteId = suiteId;
    if (companyId) next.companyId = companyId;
    return next;
  }, [systemId, suiteId, companyId]);
  const { data, isLoading } = useBugs(filters);
  const actions = useBugActions(undefined, caseId);
  const linked = useMemo(() => new Set(linkedIds), [linkedIds]);
  const q = search.trim().toLowerCase();

  const dialogTitle = ticketId
    ? TESTING_LABELS.linkBugToTicket
    : TESTING_LABELS.linkExistingBug;

  const candidates = useMemo(() => {
    const list = (data?.data ?? data ?? []) as BugRow[];
    return list.filter((bug) => {
      if (linked.has(bug.id)) return false;
      if (caseId && bug.testCaseId === caseId) return false;
      if (ticketId && bug.ticketId === ticketId) return false;
      if (!q) return true;
      return (
        bug.title.toLowerCase().includes(q) ||
        String(bug.bugNumber ?? "").includes(q) ||
        (bug.description ?? "").toLowerCase().includes(q) ||
        (bug.system?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, linked, caseId, ticketId, q]);

  const link = (bug: BugRow) => {
    const patch = caseId
      ? { id: bug.id, testCaseId: caseId }
      : ticketId
        ? { id: bug.id, ticketId }
        : null;
    if (!patch) return;
    setPendingId(bug.id);
    void actions.update
      .mutateAsync(patch)
      .then(() => {
        toast.success(
          caseId ? TESTING_LABELS.bugLinkedToCase : TESTING_LABELS.bugLinkedToast,
        );
        const linked: LinkedBugSummary = {
          id: bug.id,
          bugNumber: bug.bugNumber,
          title: bug.title,
          severity: bug.severity,
          status: bug.status,
          ticketId: ticketId ?? bug.ticketId ?? null,
          testCaseId: caseId ?? bug.testCaseId ?? null,
          description: bug.description,
        };
        onLinked?.(linked);
        onClose();
      })
      .finally(() => setPendingId(null));
  };

  const busy = actions.update.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialogTitle}
        className="brm-modal flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-2xl sm:max-w-lg"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {dialogTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={TESTING_LABELS.close}
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 px-5 pt-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 start-3"
              style={{ color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={TESTING_LABELS.searchBugs}
              aria-label={TESTING_LABELS.searchBugs}
              className="h-10 ps-9 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {isLoading && (
            <p className="py-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.loading}
            </p>
          )}
          {!isLoading && !candidates.length && (
            <div className="flex flex-col items-center gap-1.5 px-2 py-8 text-center">
              <BugIcon className="h-6 w-6" style={{ color: "var(--muted-foreground)" }} aria-hidden />
              <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                {TESTING_LABELS.noBugsToLink}
              </p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {TESTING_LABELS.noBugsToLinkHint}
              </p>
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {candidates.map((bug) => {
              const snippet =
                bug.description?.trim() ||
                bug.system?.name ||
                null;
              const rowPending = pendingId === bug.id;
              return (
                <li key={bug.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => link(bug)}
                    className="brm-list-choice flex w-full min-w-0 flex-col items-stretch gap-1.5 rounded-xl px-3 py-2.5 text-start transition-colors disabled:opacity-60"
                    style={{
                      opacity: busy && !rowPending ? 0.55 : 1,
                    }}
                    aria-label={`${TESTING_LABELS.linkBug}: ${bug.title}`}
                    aria-busy={rowPending || undefined}
                  >
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <BugIcon
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: bugStatusColor(bug.status) }}
                        aria-hidden
                      />
                      <span
                        className="min-w-0 flex-1 truncate text-xs font-medium"
                        style={{ color: "var(--foreground)" }}
                      >
                        {rowPending ? TESTING_LABELS.saving : bug.title}
                      </span>
                    </span>
                    <span className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
                      {formatBugCode(bug.bugNumber) && (
                        <span
                          dir="ltr"
                          className="brm-ticket-code ltr-isolate shrink-0 rounded-full px-2 py-0.5 font-brm text-[0.65rem] font-semibold"
                        >
                          {formatBugCode(bug.bugNumber)}
                        </span>
                      )}
                      <SeverityBadge severity={bug.severity} />
                      <BugStatusBadge status={bug.status} />
                      {snippet && (
                        <span
                          className="min-w-0 truncate text-[0.7rem] leading-relaxed"
                          style={{ color: "var(--muted-foreground)" }}
                        >
                          {snippet}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
