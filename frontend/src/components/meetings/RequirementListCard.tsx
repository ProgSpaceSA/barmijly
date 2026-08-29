"use client";
import Link from "next/link";
import { CalendarClock, ExternalLink, User } from "lucide-react";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { PriorityBadge } from "@/components/shared/StatusBadge";
import { usePermissions } from "@/hooks/usePermissions";
import {
  MeetingCodeBadge,
  RequirementSourceBadge,
  RequirementStatusBadge,
} from "./MeetingBadges";
import { MEETING_LABELS, requirementStatusColor } from "@/lib/constants";
import { formatTicketCode } from "@/lib/utils";

export type RequirementCardRequirement = {
  id: string;
  requirementNumber?: number | null;
  title: string;
  status: string;
  source: string;
  priority?: string | null;
  dueDate?: string | null;
  createdAt: string;
  isArchived?: boolean;
  systemId?: string | null;
  owner?: { id: string; firstName?: string; lastName?: string } | null;
  requestedBy?: { id: string; firstName?: string; lastName?: string } | null;
  requestedByName?: string | null;
  system?: { id: string; name: string } | null;
  company?: { id: string; name: string; logoUrl?: string | null } | null;
  meetingPoint?: {
    id: string;
    meeting?: { id: string; title: string; meetingNumber?: number | null } | null;
  } | null;
  tickets?: { id: string; ticketNumber?: number | null }[];
  _count?: { tickets?: number; comments?: number };
};

/**
 * One requirement row. Inline-start (right in RTL) bar = status, matching the
 * ticket, bug and meeting cards.
 *
 * An unpinned requirement wears the «لم يُحدَّد المشروع» note rather than a
 * blank space: it is the one thing standing between the ask and a ticket, and
 * the backlog is read to find exactly those.
 */
export function RequirementListCard({
  requirement,
  canPromote = false,
  promoting = false,
  onPromote,
  onOpen,
}: {
  requirement: RequirementCardRequirement;
  canPromote?: boolean;
  promoting?: boolean;
  onPromote?: (id: string) => void;
  onOpen?: (id: string) => void;
}) {
  const { can: allowed } = usePermissions();
  const owner = [requirement.owner?.firstName, requirement.owner?.lastName]
    .filter(Boolean)
    .join(" ");
  const asker =
    [requirement.requestedBy?.firstName, requirement.requestedBy?.lastName]
      .filter(Boolean)
      .join(" ") || requirement.requestedByName;
  const converted = requirement.status === "CONVERTED";
  const dimmed = converted || requirement.status === "DECLINED" || requirement.isArchived;
  const firstTicket = requirement.tickets?.[0];

  return (
    <div
      className="flex min-w-0 overflow-hidden rounded-xl"
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        opacity: dimmed ? 0.85 : 1,
      }}
    >
      {/* First in DOM = inline-start = right in RTL */}
      <div
        className="w-[3px] shrink-0 self-stretch"
        style={{ background: requirementStatusColor(requirement.status) }}
        aria-hidden
        data-status-spine={requirement.status}
      />

      <div className="min-w-0 flex-1 p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <MeetingCodeBadge kind="requirement" value={requirement.requirementNumber} />
          <RequirementStatusBadge status={requirement.status} />
          <RequirementSourceBadge source={requirement.source} />
          <PriorityBadge priority={requirement.priority} />
        </div>

        <button
          type="button"
          onClick={() => onOpen?.(requirement.id)}
          className="brm-row-title block w-full text-start font-semibold"
          style={{ color: dimmed ? "var(--muted-foreground)" : "var(--foreground)" }}
        >
          {requirement.title}
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {asker && (
            <span
              className="flex items-center gap-1 text-xs"
              title={MEETING_LABELS.requestedBy}
              style={{ color: "var(--muted-foreground)" }}
            >
              <User className="h-3 w-3" aria-hidden />
              {asker}
            </span>
          )}
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {MEETING_LABELS.owner}: {owner || MEETING_LABELS.unassigned}
          </span>
          <span
            className="text-xs"
            style={{
              color: requirement.system ? "var(--muted-foreground)" : "#F59E0B",
            }}
          >
            {requirement.system?.name ?? MEETING_LABELS.unpinned}
          </span>
          {requirement.company && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CompanyLogo company={requirement.company} size="xs" />
              {requirement.company.name}
            </span>
          )}
          {requirement.dueDate && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CalendarClock className="h-3 w-3" aria-hidden />
              <RelativeTime date={requirement.dueDate} label={MEETING_LABELS.dueDate} />
            </span>
          )}
          {requirement.meetingPoint?.meeting && (
            allowed("meeting:read") ? (
              <Link
                href={`/meetings/${requirement.meetingPoint.meeting.id}`}
                className="brm-ticket-link inline-flex items-center gap-1 text-xs"
              >
                {MEETING_LABELS.originFromMeeting}
                <ExternalLink className="h-2.5 w-2.5" aria-hidden />
              </Link>
            ) : (
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {MEETING_LABELS.originFromMeeting}
              </span>
            )
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-center p-3">
        {firstTicket ? (
          <Link
            href={`/tickets/${firstTicket.id}`}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
            style={{ background: "#4F46E5", color: "#fff", minHeight: 36 }}
          >
            <span dir="ltr" className="ltr-isolate font-brm">
              {formatTicketCode(firstTicket.ticketNumber) ?? MEETING_LABELS.linkedTickets}
            </span>
            <ExternalLink className="h-3 w-3" aria-hidden />
          </Link>
        ) : (
          canPromote &&
          !requirement.isArchived &&
          !converted && (
            <button
              type="button"
              disabled={promoting || !requirement.systemId}
              onClick={() => onPromote?.(requirement.id)}
              title={
                requirement.systemId
                  ? MEETING_LABELS.promoteHint
                  : MEETING_LABELS.promoteNeedsSystem
              }
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
              style={{ background: "rgba(79,70,229,0.10)", color: "#4F46E5", minHeight: 36 }}
            >
              {promoting ? MEETING_LABELS.promoting : MEETING_LABELS.promote}
            </button>
          )
        )}
      </div>
    </div>
  );
}
