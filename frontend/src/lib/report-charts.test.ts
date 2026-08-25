import { describe, it, expect } from "vitest";
import {
  buildStatusDistribution,
  developerInitials,
  formatTrendMonth,
  niceYAxisMax,
  rankDevelopers,
  statusAxisTicks,
  summarizeDevelopers,
  trendTooltipRows,
  yAxisTicks,
  type DeveloperStat,
} from "./report-charts";

describe("buildStatusDistribution", () => {
  it("scales every bar against the same max so equal counts share length", () => {
    const { rows, max } = buildStatusDistribution([
      { status: "NEW", _count: 1 },
      { status: "IN_PROGRESS", _count: 2 },
      { status: "DRAFT", _count: 1 },
    ]);

    expect(max).toBe(2);
    expect(rows[0]).toMatchObject({ status: "IN_PROGRESS", barPercent: 100, name: "قيد التنفيذ" });
    const ones = rows.filter((r) => r.value === 1);
    expect(ones).toHaveLength(2);
    expect(ones[0].barPercent).toBe(50);
    expect(ones[1].barPercent).toBe(50);
  });

  it("sorts by count then workflow order, and keeps Arabic labels", () => {
    const { rows } = buildStatusDistribution([
      { status: "CLOSED", _count: 1 },
      { status: "NEW", _count: 1 },
      { status: "ON_HOLD", _count: 3 },
    ]);

    expect(rows.map((r) => r.status)).toEqual(["ON_HOLD", "NEW", "CLOSED"]);
    expect(rows[0].name).toBe("معلقة");
  });
});

describe("statusAxisTicks", () => {
  it("lists every integer when the max is small", () => {
    expect(statusAxisTicks(2)).toEqual([0, 1, 2]);
  });

  it("keeps the true max on the axis for larger counts", () => {
    expect(statusAxisTicks(16).at(-1)).toBe(16);
    expect(statusAxisTicks(16)[0]).toBe(0);
  });
});

describe("formatTrendMonth", () => {
  it("formats axis ticks as Arabic month names", () => {
    expect(formatTrendMonth("2026-08")).toMatch(/أغسطس/);
  });

  it("formats tooltips with month and year", () => {
    expect(formatTrendMonth("2026-08", "tooltip")).toMatch(/أغسطس/);
    expect(formatTrendMonth("2026-08", "tooltip")).toMatch(/2026/);
  });
});

describe("trendTooltipRows", () => {
  it("keeps one Arabic row per series when area and line share a dataKey", () => {
    expect(
      trendTooltipRows([
        { dataKey: "created", name: "created", value: 118, color: "transparent" },
        { dataKey: "closed", name: "closed", value: 37, color: "transparent" },
        { dataKey: "created", name: "مُنشأة", value: 118, color: "#818CF8" },
        { dataKey: "closed", name: "مُغلقة", value: 37, color: "#34D399" },
      ]),
    ).toEqual([
      { key: "created", label: "مُنشأة", value: 118, color: "#818CF8" },
      { key: "closed", label: "مُغلقة", value: 37, color: "#34D399" },
    ]);
  });
});

describe("niceYAxisMax / yAxisTicks", () => {
  it("pads 16 up to a round 20 with five ticks", () => {
    expect(niceYAxisMax(16)).toBe(20);
    expect(yAxisTicks(16)).toEqual([0, 5, 10, 15, 20]);
  });

  it("uses a floor of 4 when every month is empty", () => {
    expect(niceYAxisMax(0)).toBe(4);
    expect(yAxisTicks(0)).toEqual([0, 1, 2, 3, 4]);
  });
});

const sampleDevelopers: DeveloperStat[] = [
  { id: "idle", name: "Developer Idle", assigned: 0, completed: 0, overdue: 0, completionRate: 0 },
  { id: "low", name: "سارة حسن", assigned: 6, completed: 2, overdue: 3, completionRate: 33 },
  { id: "high", name: "أحمد علي", assigned: 10, completed: 8, overdue: 1, completionRate: 80 },
  { id: "tie", name: "Developer Tie", assigned: 4, completed: 2, overdue: 0, completionRate: 33 },
];

describe("developerInitials", () => {
  it("takes the first letter of the first and last names", () => {
    expect(developerInitials("أحمد علي")).toBe("أع");
    expect(developerInitials("DeveloperC1 Company1")).toBe("DC");
  });

  it("falls back to the first two letters of a single token", () => {
    expect(developerInitials("سارة")).toBe("سا");
  });
});

describe("rankDevelopers", () => {
  it("puts active developers first, then completed volume, then completion rate", () => {
    expect(rankDevelopers(sampleDevelopers).map((d) => d.id)).toEqual([
      "high",
      "tie",
      "low",
      "idle",
    ]);
  });

  it("ranks higher completed volume above a perfect rate on fewer tickets", () => {
    const devs: DeveloperStat[] = [
      { id: "one", name: "مطور أ", assigned: 1, completed: 1, overdue: 0, completionRate: 100 },
      { id: "many", name: "مطور ب", assigned: 8, completed: 7, overdue: 1, completionRate: 88 },
    ];
    expect(rankDevelopers(devs).map((d) => d.id)).toEqual(["many", "one"]);
  });

  it("drops idle rows when hideIdle is on", () => {
    expect(rankDevelopers(sampleDevelopers, { hideIdle: true }).map((d) => d.id)).toEqual([
      "high",
      "tie",
      "low",
    ]);
  });
});

describe("summarizeDevelopers", () => {
  it("averages completion only across developers with assigned tickets", () => {
    expect(summarizeDevelopers(sampleDevelopers)).toEqual({
      total: 4,
      active: 3,
      assigned: 20,
      completed: 12,
      overdue: 4,
      avgRate: 49,
    });
  });
});
