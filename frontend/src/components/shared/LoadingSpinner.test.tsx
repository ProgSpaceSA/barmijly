import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  SkeletonList,
  SkeletonTable,
  SkeletonTicketDetail,
  SkeletonReports,
  SkeletonDashboard,
  SkeletonProfile,
} from "./LoadingSpinner";

describe("page skeletons", () => {
  it("announces loading in Arabic and keeps widths fluid", () => {
    const { container } = render(<SkeletonList count={3} />);
    const frame = screen.getByRole("status", { name: "جارٍ التحميل" });
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveClass("w-full");
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/\bw-64\b/);
  });

  it("renders compact rows for notification-shaped lists", () => {
    render(<SkeletonList count={4} variant="rows" />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toHaveClass("w-full");
  });

  it("fills the page column instead of a capped max-width", () => {
    const { rerender } = render(<SkeletonTicketDetail />);
    const frame = screen.getByRole("status", { name: "جارٍ التحميل" });
    expect(frame).toHaveClass("w-full");
    expect(frame.className).not.toMatch(/\bmax-w-4xl\b/);

    rerender(<SkeletonTable />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toHaveClass("w-full");

    rerender(<SkeletonReports />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toHaveClass("w-full");

    rerender(<SkeletonDashboard showCharts />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toHaveClass("w-full");

    rerender(<SkeletonProfile />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toHaveClass("w-full");
  });

  it("renders table, ticket, reports, dashboard, and profile shapes", () => {
    const { rerender, container } = render(<SkeletonTable />);
    expect(container.querySelector("table")).toBeTruthy();

    rerender(<SkeletonTicketDetail />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeInTheDocument();

    rerender(<SkeletonReports />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(5);

    rerender(<SkeletonDashboard showCharts />);
    rerender(<SkeletonProfile />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeInTheDocument();
  });
});
