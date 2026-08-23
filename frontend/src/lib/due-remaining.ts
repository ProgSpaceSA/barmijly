import { differenceInCalendarDays, startOfDay } from "date-fns";
import { DUE_REMAINING_LABELS } from "@/lib/constants";
import { parseTimestamp } from "@/lib/dates";

export type DueRemainingTone = "ok" | "soon" | "overdue";

export type DueRemainingInfo = {
  label: string;
  tone: DueRemainingTone;
};

/** Calendar days left until `date`. Null when there is no due date. */
export function dueRemaining(
  date: string | Date | null | undefined,
  now = new Date(),
): DueRemainingInfo | null {
  if (!date) return null;
  const days = differenceInCalendarDays(startOfDay(parseTimestamp(date)), startOfDay(now));
  if (days < 0) return { label: DUE_REMAINING_LABELS.overdue(-days), tone: "overdue" };
  if (days === 0) return { label: DUE_REMAINING_LABELS.today, tone: "soon" };
  if (days === 1) return { label: DUE_REMAINING_LABELS.tomorrow, tone: "soon" };
  return { label: DUE_REMAINING_LABELS.remaining(days), tone: days <= 3 ? "soon" : "ok" };
}

/** True when the due date is a previous calendar day. */
export function isPastDue(
  date: string | Date | null | undefined,
  now = new Date(),
): boolean {
  return dueRemaining(date, now)?.tone === "overdue";
}
