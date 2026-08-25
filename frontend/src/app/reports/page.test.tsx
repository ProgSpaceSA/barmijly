import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGet = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("recharts", async () => {
  const actual = await vi.importActual<typeof import("recharts")>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="trend-container">{children}</div>
    ),
  };
});

import ReportsPage from "./page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReportsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockGet.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path === "/reports/dashboard") {
      return Promise.resolve({
        data: {
          totalTickets: 4,
          openTickets: 3,
          inProgressTickets: 2,
          overdueTickets: 0,
          criticalTickets: 0,
          ticketsByStatus: [
            { status: "DRAFT", _count: 1 },
            { status: "NEW", _count: 1 },
            { status: "IN_PROGRESS", _count: 2 },
          ],
        },
      });
    }
    if (path === "/reports/trend") {
      return Promise.resolve({
        data: [
          { month: "2026-03", created: 0, closed: 0 },
          { month: "2026-04", created: 0, closed: 0 },
          { month: "2026-05", created: 1, closed: 0 },
          { month: "2026-06", created: 0, closed: 0 },
          { month: "2026-07", created: 0, closed: 0 },
          { month: "2026-08", created: 3, closed: 1 },
        ],
      });
    }
    if (path === "/reports/developers") return Promise.resolve({ data: [] });
    if (path === "/reports/overdue") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

describe("ReportsPage charts", () => {
  it("gives equal counts the same bar length and ranks the highest first", async () => {
    renderPage();

    expect(await screen.findByText("توزيع الحالات")).toBeInTheDocument();

    const inProgress = screen.getByTestId("status-bar-IN_PROGRESS");
    const draft = screen.getByTestId("status-bar-DRAFT");
    const neu = screen.getByTestId("status-bar-NEW");

    expect(inProgress).toHaveAttribute("data-bar-percent", "100");
    expect(draft).toHaveAttribute("data-bar-percent", "50");
    expect(neu).toHaveAttribute("data-bar-percent", "50");

    const bars = screen.getAllByTestId(/status-bar-/);
    expect(bars[0]).toHaveAttribute("data-testid", "status-bar-IN_PROGRESS");
    expect(bars.map((el) => el.getAttribute("data-testid"))).toEqual([
      "status-bar-IN_PROGRESS",
      "status-bar-DRAFT",
      "status-bar-NEW",
    ]);
  });

  it("renders a six-month trend with a hover hint and legend", async () => {
    renderPage();

    expect(await screen.findByText("اتجاه التذاكر الشهري")).toBeInTheDocument();
    expect(screen.getByText("آخر 6 أشهر — مرّر لعرض العدد")).toBeInTheDocument();
    expect(screen.getByTestId("trend-container")).toBeInTheDocument();
    expect(screen.getAllByText("مُنشأة").length).toBeGreaterThan(0);
    expect(screen.getAllByText("مُغلقة").length).toBeGreaterThan(0);
    expect(screen.getByTestId("trend-chart-card")).toHaveClass("h-full");
    expect(screen.getByTestId("status-chart-card")).toHaveClass("h-full");
  });
});

const developers = [
  { id: "idle", name: "Developer Idle", assigned: 0, completed: 0, overdue: 0, completionRate: 0 },
  { id: "low", name: "سارة حسن", assigned: 6, completed: 2, overdue: 3, completionRate: 33 },
  { id: "high", name: "أحمد علي", assigned: 10, completed: 8, overdue: 1, completionRate: 80 },
];

describe("ReportsPage developer performance", () => {
  beforeEach(() => {
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path === "/reports/dashboard") {
        return Promise.resolve({
          data: {
            totalTickets: 4,
            openTickets: 3,
            inProgressTickets: 2,
            overdueTickets: 0,
            criticalTickets: 0,
            ticketsByStatus: [],
          },
        });
      }
      if (path === "/reports/developers") return Promise.resolve({ data: developers });
      if (path === "/reports/trend") return Promise.resolve({ data: [] });
      if (path === "/reports/overdue") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  it("ranks by completion and hides idle developers by default", async () => {
    renderPage();

    expect(await screen.findByTestId("developer-performance-card")).toBeInTheDocument();
    expect(screen.getByText("عدد المكتملة ثم نسبة الإنجاز — مرتبة حسب الأداء")).toBeInTheDocument();

    const rows = screen.getAllByTestId(/dev-row-/);
    expect(rows.map((el) => el.getAttribute("data-testid"))).toEqual([
      "dev-row-high",
      "dev-row-low",
    ]);
    expect(screen.queryByTestId("dev-row-idle")).not.toBeInTheDocument();
    expect(screen.getByTestId("dev-bar-high")).toHaveAttribute("data-bar-percent", "80");
    expect(screen.getByTestId("dev-rate-high")).toHaveTextContent("80%");
  });

  it("shows team totals and reveals idle rows from الكل", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("متوسط الإنجاز")).toBeInTheDocument();
    expect(screen.getByText("57%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /الكل/ }));

    const idle = screen.getByTestId("dev-row-idle");
    expect(idle).toHaveAttribute("data-idle", "true");
    expect(screen.getByTestId("dev-rate-idle")).toHaveTextContent("—");
    expect(screen.getByTestId("dev-assigned-idle")).toHaveTextContent("—");
  });
});
