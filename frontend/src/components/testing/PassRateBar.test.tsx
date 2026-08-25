import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PassRateBar, suiteHealth, HEALTH_COLORS, type SuiteRollup } from "./PassRateBar";
import { TESTING_LABELS } from "@/lib/constants";

const rollup = (over: Partial<SuiteRollup> = {}): SuiteRollup => ({
  total: 10,
  pass: 8,
  fail: 0,
  blocked: 0,
  skipped: 0,
  notRun: 2,
  passRate: 80,
  openBugs: 0,
  ...over,
});

describe("suiteHealth — what the spine colour means", () => {
  it("calls a suite with any failure failing, however good the rate", () => {
    expect(suiteHealth(rollup({ fail: 1, passRate: 90 }), "ACTIVE")).toBe("failing");
  });

  it("ranks a failure above an open bug", () => {
    expect(suiteHealth(rollup({ fail: 1, openBugs: 3 }), "ACTIVE")).toBe("failing");
  });

  it("ranks an open bug above work not yet run", () => {
    expect(suiteHealth(rollup({ openBugs: 1, notRun: 4 }), "ACTIVE")).toBe("open-bugs");
  });

  it("is clean only when everything ran and nothing is outstanding", () => {
    expect(suiteHealth(rollup({ pass: 10, notRun: 0, passRate: 100 }), "ACTIVE")).toBe("clean");
  });

  it("treats an empty suite as not-run rather than clean", () => {
    expect(suiteHealth(rollup({ total: 0, pass: 0, notRun: 0, passRate: 0 }), "ACTIVE")).toBe(
      "not-run",
    );
  });

  it.each(["DRAFT", "ARCHIVED"])("gives a %s suite no health at all", (state) => {
    expect(suiteHealth(rollup({ fail: 5 }), state)).toBe("draft");
  });

  it("gives each health its own colour, so the spine is readable", () => {
    const colors = Object.values(HEALTH_COLORS);
    expect(new Set(colors).size).toBeGreaterThan(3);
    expect(HEALTH_COLORS.failing).not.toBe(HEALTH_COLORS.clean);
  });
});

describe("PassRateBar", () => {
  it("reports the rate to assistive tech, not only as a width", () => {
    render(<PassRateBar rollup={rollup()} state="ACTIVE" />);
    const bar = screen.getByRole("progressbar", { name: TESTING_LABELS.passRate });
    expect(bar).toHaveAttribute("aria-valuenow", "80");
    expect(bar).toHaveAttribute("data-health", "not-run");
  });

  it("shows 0% for a suite with no cases rather than an empty label", () => {
    render(<PassRateBar rollup={rollup({ total: 0, pass: 0, passRate: 0 })} state="ACTIVE" />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  it("renders without a rollup at all — a suite nobody has run yet", () => {
    render(<PassRateBar state="DRAFT" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
