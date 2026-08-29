import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { RELATIVE_TIME_LABELS } from "@/lib/constants";

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse an API timestamp. Bare `YYYY-MM-DD` is that local calendar day, not UTC midnight. */
export function parseTimestamp(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = DATE_ONLY.exec(value);
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

/** Exact elapsed period from millisecond difference — no timezone-offset adjustment. */
export function formatRelativeTime(value: string | Date, now = new Date()): string {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "";

  const diffMs = now.getTime() - date.getTime();
  const future = diffMs < 0;
  const abs = Math.abs(diffMs);

  let phrase: string;
  if (abs < 45_000) {
    phrase = RELATIVE_TIME_LABELS.lessThanMinute;
  } else if (abs < 45 * 60_000) {
    phrase = RELATIVE_TIME_LABELS.minutes(Math.max(1, Math.round(abs / 60_000)));
  } else if (abs < 24 * 3_600_000) {
    const hours = Math.max(1, Math.round(abs / 3_600_000));
    phrase = hours >= 24 ? RELATIVE_TIME_LABELS.days(1) : RELATIVE_TIME_LABELS.hours(hours);
  } else {
    phrase = RELATIVE_TIME_LABELS.days(Math.max(1, Math.round(abs / 86_400_000)));
  }

  return future ? RELATIVE_TIME_LABELS.ahead(phrase) : RELATIVE_TIME_LABELS.ago(phrase);
}

/** Absolute local time with Arabic day-period so 1:28 ص is not read as afternoon. */
export function formatAbsoluteTime(value: string | Date): string {
  const date = parseTimestamp(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMMM yyyy، h:mm a", { locale: ar });
}

export type MeetingDatePreset = "all" | "today" | "week" | "month" | "year";

function startOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfLocalDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function isoRange(from: Date, to: Date): { heldFrom: string; heldTo: string } {
  return { heldFrom: from.toISOString(), heldTo: to.toISOString() };
}

/** Local-day bounds for the meetings list date tabs. */
export function meetingDateRange(
  preset: MeetingDatePreset,
): { heldFrom?: string; heldTo?: string } {
  if (preset === "all") return {};

  const now = new Date();
  const start = startOfLocalDay(now);

  if (preset === "today") {
    return isoRange(start, endOfLocalDay(now));
  }
  if (preset === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const sunday = new Date(start);
    sunday.setDate(start.getDate() + 6);
    return isoRange(start, endOfLocalDay(sunday));
  }
  if (preset === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return isoRange(startOfLocalDay(from), endOfLocalDay(to));
  }
  if (preset === "year") {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31);
    return isoRange(startOfLocalDay(from), endOfLocalDay(to));
  }
  return {};
}

/** `YYYY-MM-DD` for a date input's `value` / `min` / `max`. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive local-day range for custom from/to pickers. */
export function customMeetingDateRange(
  from: string,
  to: string,
): { heldFrom?: string; heldTo?: string } {
  const range: { heldFrom?: string; heldTo?: string } = {};
  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    range.heldFrom = new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    range.heldTo = new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
  }
  return range;
}
