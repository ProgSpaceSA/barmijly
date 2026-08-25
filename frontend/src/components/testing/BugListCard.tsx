"use client";
import Link from "next/link";
import { ExternalLink, User } from "lucide-react";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { BugStatusBadge, SeverityBadge, TestCodeBadge } from "./TestingBadges";
import { RESOLVED_BUG_STATUSES, TESTING_LABELS, bugStatusColor } from "@/lib/constants";
import { formatTicketCode } from "@/lib/utils";

const RESOLVED = new Set<string>(RESOLVED_BUG_STATUSES);

export type BugCardBug = {
  id: string;
  bugNumber?: number | null;
  title: string;
  severity: string;
  status: string;
  priority?: string | null;
  createdAt: string;
  isArchived?: boolean;
  ticketId?: string | null;
  ticket?: { id: string; ticketNumber?: number | null } | null;
  reportedBy?: { id: string; firstName?: string; lastName?: string } | null;
  assignedTo?: { id: string; firstName?: string; lastName?: string } | null;
  system?: { id: string; name: string } | null;
  company?: { id: string; name: string; logoUrl?: string | null } | null;
  testCase?: { id: string; title: string; caseNumber?: number | null } | null;
};

/**
 * One bug row.
 * Inline-start (right in RTL) bar = status. Severity is the pill only — no left bar.
 */
export function BugListCard({
  bug,
  canPromote = false,
  canUnarchive = false,
  promoting = false,
  unarchiving = false,
  onPromote,
  onUnarchive,
  onOpen,
}: {
  bug: BugCardBug;
  canPromote?: boolean;
  canUnarchive?: boolean;
  promoting?: boolean;
  unarchiving?: boolean;
  onPromote?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const reporter = [bug.reportedBy?.firstName, bug.reportedBy?.lastName].filter(Boolean).join(" ");
  const assignee = [bug.assignedTo?.firstName, bug.assignedTo?.lastName].filter(Boolean).join(" ");
  const resolved = RESOLVED.has(bug.status);
  const archived = Boolean(bug.isArchived);

  return (
    <div
      className="flex min-w-0 overflow-hidden rounded-xl"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        opacity: resolved || archived ? 0.85 : 1,
      }}
    >
      {/* First in DOM = inline-start = right in RTL */}
      <div
        className="w-[3px] shrink-0 self-stretch"
        style={{ background: bugStatusColor(bug.status) }}
        aria-hidden
        data-status-spine={bug.status}
      />

      <div className="min-w-0 flex-1 p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <TestCodeBadge kind="bug" value={bug.bugNumber} />
          <SeverityBadge severity={bug.severity} />
          <BugStatusBadge status={bug.status} />
          <PriorityBadge priority={bug.priority} />
        </div>

        <button
          type="button"
          onClick={() => onOpen?.(bug.id)}
          className="brm-row-title block w-full text-start font-semibold"
          style={{ color: resolved ? "var(--muted-foreground)" : "var(--foreground)" }}
        >
          {bug.title}
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {reporter && (
            <span
              className="flex items-center gap-1 text-xs"
              title={TESTING_LABELS.reportedBy}
              style={{ color: "var(--muted-foreground)" }}
            >
              <User className="h-3 w-3" aria-hidden />
              {reporter}
            </span>
          )}
          {assignee && (
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.assignee}: {assignee}
            </span>
          )}
          {bug.system?.name && (
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {bug.system.name}
            </span>
          )}
          {bug.company && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CompanyLogo company={bug.company} size="xs" />
              {bug.company.name}
            </span>
          )}
          <RelativeTime date={bug.createdAt} label={TESTING_LABELS.detectedAt} />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center p-3">
        {canUnarchive ? (
          <button
            type="button"
            disabled={unarchiving}
            onClick={() => onUnarchive?.(bug.id)}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
            style={{
              background: "rgba(79,70,229,0.12)",
              color: "#818CF8",
              border: "1px solid rgba(79,70,229,0.35)",
              minHeight: 36,
            }}
          >
            {unarchiving ? TESTING_LABELS.saving : TESTING_LABELS.unarchiveBug}
          </button>
        ) : bug.ticketId ? (
          <Link
            href={`/tickets/${bug.ticketId}`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            style={{ background: "#4F46E5", color: "#fff", minHeight: 36 }}
          >
            <span dir="ltr" className="ltr-isolate font-brm">
              {formatTicketCode(bug.ticket?.ticketNumber) ?? TESTING_LABELS.hasTicket}
            </span>
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        ) : (
          canPromote && (
            <button
              type="button"
              disabled={promoting}
              onClick={() => onPromote?.(bug.id)}
              title={TESTING_LABELS.promoteHint}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: "rgba(79,70,229,0.10)", color: "#4F46E5", minHeight: 36 }}
            >
              {promoting ? TESTING_LABELS.promoting : TESTING_LABELS.promote}
            </button>
          )
        )}
      </div>
    </div>
  );
}
