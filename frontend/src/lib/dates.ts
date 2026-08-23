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
