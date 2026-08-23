import { describe, it, expect } from "vitest";
import { dueRemaining, isPastDue } from "./due-remaining";

const NOW = new Date("2026-08-20T12:00:00");

function daysFromNow(n: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d;
}

describe("dueRemaining", () => {
  it("returns null when there is no date", () => {
    expect(dueRemaining(null, NOW)).toBeNull();
    expect(dueRemaining(undefined, NOW)).toBeNull();
  });

  it("labels today, tomorrow, remaining, and overdue", () => {
    expect(dueRemaining(daysFromNow(0), NOW)).toEqual({ label: "اليوم", tone: "soon" });
    expect(dueRemaining(daysFromNow(1), NOW)).toEqual({ label: "غداً", tone: "soon" });
    expect(dueRemaining(daysFromNow(2), NOW)).toEqual({ label: "متبقي يومان", tone: "soon" });
    expect(dueRemaining(daysFromNow(5), NOW)).toEqual({ label: "متبقي 5 أيام", tone: "ok" });
    expect(dueRemaining(daysFromNow(-1), NOW)).toEqual({ label: "متأخر يوم", tone: "overdue" });
    expect(dueRemaining(daysFromNow(-4), NOW)).toEqual({ label: "متأخر 4 أيام", tone: "overdue" });
  });

  it("treats a YYYY-MM-DD deadline as that local calendar day", () => {
    expect(dueRemaining("2026-08-20", NOW)).toEqual({ label: "اليوم", tone: "soon" });
    expect(isPastDue("2026-08-20", NOW)).toBe(false);
    expect(isPastDue("2026-08-19", NOW)).toBe(true);
  });
});
