import {
  MeetingStatus, MeetingType, Priority, TaskStatus, TicketStatus, UserRole,
} from '@prisma/client';

/** Saudi time — overridden by `DAILY_DIGEST_TIMEZONE`. */
export const DEFAULT_DIGEST_TIMEZONE = 'Asia/Riyadh';

/** Deadlines this many days out are surfaced as due soon. */
export const DIGEST_DUE_SOON_DAYS = 3;

/** Cap per listed section so the email stays readable. */
export const DIGEST_MAX_ITEMS = 8;

/** Same display id the app uses (`BRM-0031`). */
export function formatTicketCode(ticketNumber: number): string {
  return `BRM-${String(ticketNumber).padStart(4, '0')}`;
}

/**
 * Inclusive start / exclusive end of the calendar day of `now` in `timeZone`.
 * Used so "meetings today" follows the digest clock (default Asia/Riyadh), not UTC.
 */
export function zonedDayBounds(now: Date, timeZone: string): { start: Date; end: Date } {
  const wall = zonedWallParts(now, timeZone);
  const start = zonedWallToUtc(wall.year, wall.month, wall.day, timeZone);
  const next = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
  const end = zonedWallToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), timeZone);
  return { start, end };
}

function zonedWallParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** UTC instant at which `timeZone` reads as y-m-d 00:00:00. */
function zonedWallToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const utcGuess = Date.UTC(year, month - 1, day, 12, 0, 0);
  const wall = zonedWallParts(new Date(utcGuess), timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const offsetMs = asUtc - utcGuess;
  return new Date(Date.UTC(year, month - 1, day) - offsetMs);
}

export interface DigestTicketRef {
  id: string;
  ticketNumber: number;
  /** Display id matching the app, e.g. `BRM-0031`. */
  ticketCode: string;
  title: string;
  status: TicketStatus;
  priority: Priority | null;
  estimatedDeadline: Date | null;
  url: string;
  companyName?: string | null;
  systemName?: string | null;
}

export interface DigestMention {
  ticket: DigestTicketRef;
  authorName: string;
  excerpt: string;
  createdAt: Date;
}

export interface DigestUnreadThread {
  ticket: DigestTicketRef;
  count: number;
}

/** Unread BUG_ASSIGNED notification tied to a ticket the recipient works. */
export interface DigestBugAlert {
  ticket: DigestTicketRef;
  bugCode: string;
  summary: string;
  createdAt: Date;
}

export interface DigestTaskRef {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  ticket: DigestTicketRef;
}

/** A meeting the recipient is attending whose `heldAt` falls on today's digest calendar day. */
export interface DigestMeetingRef {
  id: string;
  meetingNumber: number;
  /** Display id matching the app, e.g. `MTG-0007`. */
  meetingCode: string;
  title: string;
  type: MeetingType;
  status: MeetingStatus;
  heldAt: Date;
  durationMins: number | null;
  location: string | null;
  url: string;
  companyName?: string | null;
}

/** One "بانتظار إجراءك" group — the label is already Arabic and role-specific. */
export interface DigestActionGroup {
  label: string;
  tickets: DigestTicketRef[];
  total: number;
}

export interface DigestRecipient {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}

export interface UserDigest {
  recipient: DigestRecipient;
  /** How far back the "new activity" sections look, in hours. */
  windowHours: number;
  mentions: DigestMention[];
  unreadThreads: DigestUnreadThread[];
  unreadTotal: number;
  bugAlerts: DigestBugAlert[];
  /** Unread bug notifications in the window — listed rows may be capped. */
  bugAlertTotal: number;
  actionGroups: DigestActionGroup[];
  /** Full queue size — the listed groups are only what moved in the window. */
  actionTotal: number;
  openTasks: DigestTaskRef[];
  /** Open overdue tickets in scope, capped at DIGEST_MAX_ITEMS. */
  overdue: DigestTicketRef[];
  /** All open overdue tickets in scope, including ones not listed. */
  overdueTotal: number;
  dueSoon: DigestTicketRef[];
  dueSoonTotal: number;
  /** Meetings the recipient is attending today, capped at DIGEST_MAX_ITEMS. */
  todayMeetings: DigestMeetingRef[];
  todayMeetingTotal: number;
  isEmpty: boolean;
}
