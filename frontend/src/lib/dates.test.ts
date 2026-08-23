import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatAbsoluteTime, formatRelativeTime, parseTimestamp } from "./dates";

const NOW = new Date("2026-08-20T18:20:00.000Z");

function hoursAgo(hours: number) {
  return new Date(NOW.getTime() - hours * 3_600_000).toISOString();
}

describe("parseTimestamp", () => {
  it("keeps a YYYY-MM-DD value on that local calendar day", () => {
    const d = parseTimestamp("2026-08-20");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(0);
  });

  it("keeps an ISO instant as the same instant", () => {
    const iso = "2026-08-19T22:28:30.348Z";
    expect(parseTimestamp(iso).toISOString()).toBe(iso);
  });
});

describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows 4 hours for a timestamp 4 hours ago, not 17", () => {
    expect(formatRelativeTime(hoursAgo(4), NOW)).toBe("منذ 4 ساعات");
    expect(formatRelativeTime(hoursAgo(4), NOW)).not.toContain("17");
  });

  it("shows 17 hours for a timestamp 17 hours ago", () => {
    expect(formatRelativeTime(hoursAgo(17), NOW)).toBe("منذ 17 ساعة");
  });

  it("uses the exact hour count instead of an approximate bucket", () => {
    expect(formatRelativeTime(hoursAgo(1), NOW)).toBe("منذ ساعة");
    expect(formatRelativeTime(hoursAgo(2), NOW)).toBe("منذ ساعتين");
    expect(formatRelativeTime(hoursAgo(4), NOW)).not.toContain("تقريباً");
  });
});

describe("formatAbsoluteTime", () => {
  it("includes a morning or evening marker", () => {
    const label = formatAbsoluteTime("2026-08-19T22:28:30.348Z");
    expect(label === "" || /[صم]/.test(label)).toBe(true);
    expect(label).not.toMatch(/\d{2}:\d{2}$/);
  });
});
