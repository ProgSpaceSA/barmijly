import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PriorityBadge, StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it("shows the Arabic status label", () => {
    render(<StatusBadge status="IN_PROGRESS" />);
    const chip = screen.getByText("قيد التنفيذ");
    expect(chip).toHaveAttribute("data-status", "IN_PROGRESS");
  });

  it("marks overdue tickets in Arabic", () => {
    render(<StatusBadge status="IN_PROGRESS" overdue />);
    expect(screen.getByText("متأخرة")).toHaveAttribute("data-overdue", "true");
  });
});

describe("PriorityBadge", () => {
  it("shows the Arabic priority label", () => {
    render(<PriorityBadge priority="HIGH" />);
    expect(screen.getByText("عالية")).toHaveAttribute("data-priority", "HIGH");
  });

  it("renders nothing without a priority", () => {
    const { container } = render(<PriorityBadge />);
    expect(container).toBeEmptyDOMElement();
  });
});
