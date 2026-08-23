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
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeInTheDocument();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/\bw-64\b/);
  });

  it("renders compact rows for notification-shaped lists", () => {
    render(<SkeletonList count={4} variant="rows" />);
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeInTheDocument();
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
