import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  BugStatusBadge,
  ResultBadge,
  SeverityBadge,
  TestCodeBadge,
  TestStateBadge,
} from "./TestingBadges";
import {
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
  TEST_RESULT_LABELS,
  TEST_STATE_LABELS,
} from "@/lib/constants";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

/**
 * The chips carry their enum on a data attribute, and `globals.css` colours
 * them off it. A typo there is silent — the chip renders, just unstyled — which
 * is why the attribute is asserted rather than the colour.
 */
const chip = () => document.querySelector(".brm-chip") as HTMLElement;

describe("ResultBadge", () => {
  it.each(Object.keys(TEST_RESULT_LABELS))("labels and tags %s", (result) => {
    render(<ResultBadge result={result} />);
    expect(screen.getByText(TEST_RESULT_LABELS[result])).toBeInTheDocument();
    expect(chip()).toHaveAttribute("data-result", result);
  });

  it("renders nothing without a result", () => {
    const { container } = render(<ResultBadge result={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("pulses only on a failure", () => {
    const { container, unmount } = render(<ResultBadge result="FAIL" />);
    expect(container.querySelector(".pulse-red")).toBeTruthy();
    unmount();

    const { container: passed } = render(<ResultBadge result="PASS" />);
    expect(passed.querySelector(".pulse-red")).toBeNull();
  });
});

describe("TestStateBadge", () => {
  it.each(Object.keys(TEST_STATE_LABELS))("labels and tags %s", (state) => {
    render(<TestStateBadge state={state} />);
    expect(screen.getByText(TEST_STATE_LABELS[state])).toBeInTheDocument();
    expect(chip()).toHaveAttribute("data-test-state", state);
  });

  it("uses a different attribute from the result chip — two axes, two scales", () => {
    render(<TestStateBadge state="DRAFT" />);
    expect(chip()).not.toHaveAttribute("data-result");
  });
});

describe("SeverityBadge", () => {
  it.each(Object.keys(BUG_SEVERITY_LABELS))("labels and tags %s", (severity) => {
    render(<SeverityBadge severity={severity} />);
    expect(screen.getByText(BUG_SEVERITY_LABELS[severity])).toBeInTheDocument();
    expect(chip()).toHaveAttribute("data-severity", severity);
  });

  it("never borrows the priority attribute — impact is not urgency", () => {
    render(<SeverityBadge severity="CRITICAL" />);
    expect(chip()).not.toHaveAttribute("data-priority");
  });
});

describe("BugStatusBadge", () => {
  it.each(Object.keys(BUG_STATUS_LABELS))("labels and tags %s", (status) => {
    render(<BugStatusBadge status={status} />);
    expect(screen.getByText(BUG_STATUS_LABELS[status])).toBeInTheDocument();
    expect(chip()).toHaveAttribute("data-bug-status", status);
  });

  it("does not collide with the ticket-status attribute", () => {
    render(<BugStatusBadge status="OPEN" />);
    expect(chip()).not.toHaveAttribute("data-status");
  });
});

describe("TestCodeBadge", () => {
  it.each([
    ["suite", 7, "TS-0007"],
    ["case", 114, "TC-0114"],
    ["bug", 114, "BUG-0114"],
  ] as const)("formats a %s number as %s", (kind, value, expected) => {
    render(<TestCodeBadge kind={kind} value={value} />);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("isolates the code LTR so the digits do not reorder inside RTL text", () => {
    const { container } = render(<TestCodeBadge kind="case" value={9} />);
    const code = screen.getByRole("button", { name: /TC-0009/ });
    expect(code).toHaveAttribute("dir", "ltr");
    expect(container.querySelector(".ltr-isolate")).toBeTruthy();
  });

  it("pads to four digits, matching BRM-0142", () => {
    render(<TestCodeBadge kind="suite" value={1} />);
    expect(screen.getByText("TS-0001")).toBeInTheDocument();
  });

  it("renders nothing for a row with no number yet", () => {
    const { container } = render(<TestCodeBadge kind="bug" value={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("copies the code on click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const { fireEvent, waitFor } = await import("@testing-library/react");
    render(<TestCodeBadge kind="case" value={9} />);
    fireEvent.click(screen.getByRole("button", { name: /TC-0009/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("TC-0009"));
  });
});
