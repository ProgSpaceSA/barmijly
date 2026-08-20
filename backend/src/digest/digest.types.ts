import { Priority, TaskStatus, TicketStatus, UserRole } from '@prisma/client';

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

export interface DigestTaskRef {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: Date | null;
  ticket: DigestTicketRef;
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
  isEmpty: boolean;
}
