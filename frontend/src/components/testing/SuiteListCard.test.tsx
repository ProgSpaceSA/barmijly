import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SuiteListCard, type SuiteCardSuite } from "./SuiteListCard";
import { HEALTH_COLORS } from "./PassRateBar";
import { TESTING_LABELS, TEST_STATE_LABELS } from "@/lib/constants";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const suite = (over: Partial<SuiteCardSuite> = {}): SuiteCardSuite => ({
  id: "suite-1",
  suiteNumber: 7,
  title: "مجموعة تسجيل الدخول",
  state: "ACTIVE",
  owner: { id: "qa-1", firstName: "سارة", lastName: "أحمد" },
  system: { id: "system-1", name: "نظام الفواتير" },
  company: { id: "company-1", name: "شركة أ" },
  _count: { cases: 12 },
  rollup: {
    total: 12, pass: 10, fail: 0, blocked: 0, skipped: 0, notRun: 2, passRate: 83, openBugs: 0,
  },
  ...over,
});

/** jsdom normalises `#RRGGBB` to `rgb(...)`, so the expectation does too. */
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
};

/** The 4px spine is the first child of the card body. */
const spineColor = (container: HTMLElement) =>
  (container.querySelector(".w-1") as HTMLElement | null)?.style.background;

describe("SuiteListCard", () => {
  it("links to the workspace", () => {
    render(<SuiteListCard suite={suite()} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/test-suites/suite-1");
  });

  it("shows the suite code in an LTR-isolated run", () => {
    const { container } = render(<SuiteListCard suite={suite()} />);
    const code = screen.getByRole("button", { name: /TS-0007/ });
    expect(code).toHaveAttribute("dir", "ltr");
    expect(container.querySelector(".ltr-isolate")).toBeTruthy();
  });

  it("carries the state chip and the case count", () => {
    render(<SuiteListCard suite={suite()} />);
    expect(screen.getByText(TEST_STATE_LABELS.ACTIVE)).toBeInTheDocument();
    expect(screen.getByText(`12 ${TESTING_LABELS.caseCount}`)).toBeInTheDocument();
  });

  it("paints the spine red when a case is failing", () => {
    const { container } = render(
      <SuiteListCard
        suite={suite({ rollup: { total: 4, pass: 3, fail: 1, blocked: 0, skipped: 0, notRun: 0, passRate: 75, openBugs: 0 } })}
      />,
    );
    expect(spineColor(container)).toBe(rgb(HEALTH_COLORS.failing));
  });

  it("paints the spine orange for open bugs with nothing failing", () => {
    const { container } = render(
      <SuiteListCard
        suite={suite({ rollup: { total: 4, pass: 4, fail: 0, blocked: 0, skipped: 0, notRun: 0, passRate: 100, openBugs: 2 } })}
      />,
    );
    expect(spineColor(container)).toBe(rgb(HEALTH_COLORS["open-bugs"]));
  });

  it("paints the spine green when everything passed", () => {
    const { container } = render(
      <SuiteListCard
        suite={suite({ rollup: { total: 4, pass: 4, fail: 0, blocked: 0, skipped: 0, notRun: 0, passRate: 100, openBugs: 0 } })}
      />,
    );
    expect(spineColor(container)).toBe(rgb(HEALTH_COLORS.clean));
  });

  it("paints a draft grey even when its cases are failing", () => {
    const { container } = render(
      <SuiteListCard
        suite={suite({
          state: "DRAFT",
          rollup: { total: 4, pass: 0, fail: 4, blocked: 0, skipped: 0, notRun: 0, passRate: 0, openBugs: 0 },
        })}
      />,
    );
    expect(spineColor(container)).toBe(rgb(HEALTH_COLORS.draft));
  });

  it("surfaces the open-bug count so it can be acted on from the list", () => {
    render(
      <SuiteListCard
        suite={suite({ rollup: { total: 4, pass: 4, fail: 0, blocked: 0, skipped: 0, notRun: 0, passRate: 100, openBugs: 3 } })}
      />,
    );
    expect(screen.getByText(`3 ${TESTING_LABELS.openBugs}`)).toBeInTheDocument();
  });

  it("says so plainly when a suite has never been run", () => {
    render(<SuiteListCard suite={suite({ lastRunAt: null })} />);
    expect(screen.getByText(TESTING_LABELS.neverRun)).toBeInTheDocument();
  });

  it("marks the caller's own suites", () => {
    render(<SuiteListCard suite={suite()} currentUserId="qa-1" />);
    expect(screen.getByText(/سارة أحمد/)).toHaveTextContent(TESTING_LABELS.mine);
  });
});
