"use client";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { MeetingCodeBadge, MeetingStatusBadge, MeetingTypeBadge } from "./MeetingBadges";
import { MEETING_LABELS, MEETING_STATUS_COLORS } from "@/lib/constants";
import { formatAbsoluteTime } from "@/lib/dates";

export type MeetingCardMeeting = {
  id: string;
  meetingNumber?: number | null;
  title: string;
  type: string;
  status: string;
  heldAt?: string | null;
  location?: string | null;
  isArchived?: boolean;
  organizer?: { id: string; firstName?: string; lastName?: string } | null;
  company?: { id: string; name: string; logoUrl?: string | null } | null;
  systems?: { system: { id: string; name: string } }[];
  _count?: { points?: number; attendees?: number };
};

/**
 * One meeting row. Inline-start (right in RTL) bar = status, matching the
 * ticket and bug cards so the three boards read as one system.
 */
export function MeetingListCard({
  meeting,
  onOpen,
}: {
  meeting: MeetingCardMeeting;
  onOpen?: (id: string) => void;
}) {
  const organizer = [meeting.organizer?.firstName, meeting.organizer?.lastName]
    .filter(Boolean)
    .join(" ");
  const systems = (meeting.systems ?? []).map((row) => row.system?.name).filter(Boolean);
  const dimmed = meeting.status === "CANCELLED" || meeting.isArchived;

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
        style={{ background: MEETING_STATUS_COLORS[meeting.status] ?? "#0EA5E9" }}
        aria-hidden
        data-status-spine={meeting.status}
      />

      <div className="min-w-0 flex-1 p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <MeetingCodeBadge kind="meeting" value={meeting.meetingNumber} />
          <MeetingTypeBadge type={meeting.type} />
          <MeetingStatusBadge status={meeting.status} />
        </div>

        <button
          type="button"
          onClick={() => onOpen?.(meeting.id)}
          className="brm-row-title block w-full text-start font-semibold"
          style={{ color: dimmed ? "var(--muted-foreground)" : "var(--foreground)" }}
        >
          {meeting.title}
        </button>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {meeting.heldAt && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CalendarDays className="h-3 w-3" aria-hidden />
              {formatAbsoluteTime(meeting.heldAt)}
            </span>
          )}
          {meeting.location && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <MapPin className="h-3 w-3" aria-hidden />
              {meeting.location}
            </span>
          )}
          {organizer && (
            <span
              className="text-xs"
              title={MEETING_LABELS.organizer}
              style={{ color: "var(--muted-foreground)" }}
            >
              {MEETING_LABELS.organizer}: {organizer}
            </span>
          )}
          {meeting.company && (
            <span
              className="flex items-center gap-1 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              <CompanyLogo company={meeting.company} size="xs" />
              {meeting.company.name}
            </span>
          )}
          {systems.length > 0 && (
            <span className="truncate text-xs" style={{ color: "var(--muted-foreground)" }}>
              {systems.join(" · ")}
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end justify-center gap-1 p-3">
        <span
          className="font-brm inline-flex items-center gap-1 text-xs tabular-nums"
          style={{ color: "var(--muted-foreground)" }}
          title={MEETING_LABELS.minutePoints}
        >
          {MEETING_LABELS.pointCount(meeting._count?.points ?? 0)}
        </span>
        <span
          className="font-brm inline-flex items-center gap-1 text-xs tabular-nums"
          style={{ color: "var(--muted-foreground)" }}
          title={MEETING_LABELS.attendees}
        >
          <Users className="h-3 w-3" aria-hidden />
          {meeting._count?.attendees ?? 0}
        </span>
      </div>
    </div>
  );
}
