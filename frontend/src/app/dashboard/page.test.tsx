import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockGet = vi.fn();
const mockPatch = vi.fn();
const authState = vi.hoisted(() => ({
  user: { id: "head-1", role: "SENIOR_MANAGEMENT", firstName: "هاني", email: "head@company.com" } as {
    id: string;
    role: string;
    firstName: string;
    email?: string;
  },
}));

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

vi.mock("@/store/auth", () => ({
  // Honours the selector form, which usePermissions relies on to read the role.
  useAuthStore: (selector?: (s: any) => any) => {
    const state = { user: authState.user };
    return selector ? selector(state) : state;
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

import DashboardPage from "./page";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  authState.user = { id: "head-1", role: "SENIOR_MANAGEMENT", firstName: "هاني", email: "head@company.com" };
  mockPatch.mockReset();
  mockPatch.mockResolvedValue({ data: { count: 0 } });
  mockGet.mockImplementation((url: unknown) => {
    const path = String(url);
    if (path === "/reports/dashboard") {
      return Promise.resolve({
        data: { totalTickets: 4, openTickets: 3, inProgressTickets: 1, overdueTickets: 2 },
      });
    }
    if (path === "/reports/overdue") {
      return Promise.resolve({
        data: [{
          id: "t1",
          title: "تعديل قالب الفاتورة",
          status: "SCHEDULED",
          finalPriority: "CRITICAL",
          system: { name: "POS" },
          company: { name: "Retail Co" },
        }],
      });
    }
    if (path === "/reports/developers") return Promise.resolve({ data: [] });
    if (path === "/reports/trend") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
});

describe("Dashboard overdue card", () => {
  it("keeps عرض الكل on the header and opens the overdue ticket filter", async () => {
    renderPage();

    expect(await screen.findByText(/التذاكر المتأخرة/)).toBeInTheDocument();
    const viewAll = screen.getByRole("link", { name: "عرض الكل" });
    expect(viewAll).toHaveAttribute("href", "/tickets?overdue=true");
    expect(viewAll.parentElement).toHaveAttribute("data-slot", "card-action");
  });
});

describe("Dashboard greeting", () => {
  it("uses the manager compliment for the live mailbox", async () => {
    authState.user = {
      id: "mgr-1",
      role: "DEVELOPER",
      firstName: "أحمد",
      email: "a.aldughairi@sanam-holding.com",
    };
    renderPage();

    expect(await screen.findByText("لأنك مختلف، أنت تقود.")).toBeInTheDocument();
    expect(screen.queryByText("هل ثمة كود يريد حلاً؟")).not.toBeInTheDocument();
  });
});

describe("Dashboard developer performance", () => {
  it("lists every developer in scope and scrolls inside the card", async () => {
    const developers = Array.from({ length: 8 }, (_, i) => ({
      id: `dev-${i}`,
      name: `مطور ${i + 1}`,
      assigned: i === 0 ? 0 : 4 + i,
      completed: i === 0 ? 0 : i,
      overdue: 0,
      completionRate: i === 0 ? 0 : Math.round((i / (4 + i)) * 100),
    }));

    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path === "/reports/dashboard") {
        return Promise.resolve({
          data: { totalTickets: 4, openTickets: 3, inProgressTickets: 1, overdueTickets: 0 },
        });
      }
      if (path === "/reports/developers") return Promise.resolve({ data: developers });
      if (path === "/reports/trend") return Promise.resolve({ data: [] });
      if (path === "/reports/overdue") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText("أداء المطورين (8)")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "أداء المطورين" });
    expect(list).toHaveClass("brm-panel-scroll");
    expect(list).toHaveClass("max-h-[200px]");
    expect(screen.getAllByTestId(/dev-row-/)).toHaveLength(8);
    expect(screen.getByTestId("dev-row-dev-0")).toBeInTheDocument();
  });
});

describe("Dashboard activity", () => {
  it("scrolls active rows inside a half-viewport panel", async () => {
    authState.user = { id: "req-1", role: "TICKET_REQUESTER", firstName: "راشد" };
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path === "/reports/dashboard") {
        return Promise.resolve({
          data: { totalTickets: 1, openTickets: 1, inProgressTickets: 0, overdueTickets: 0 },
        });
      }
      if (path.includes("/tickets/my-created")) {
        return Promise.resolve({
          data: [{
            id: "t1",
            title: "تعديل قالب الفاتورة",
            status: "NEW",
            ticketNumber: 22,
            updatedAt: "2026-08-20T00:00:00.000Z",
            company: { name: "Company1" },
          }],
        });
      }
      if (path.includes("/tasks/my")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText("$ brmctl activity --user:me --active")).toBeInTheDocument();
    expect(await screen.findByText("تعديل قالب الفاتورة")).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "النشاط الحالي" });
    expect(list).toHaveClass("brm-term-body");
    expect(list).toHaveTextContent("تعديل قالب الفاتورة");
  });

  it("clears unread updates when the ticket row is opened", async () => {
    const user = userEvent.setup();
    authState.user = { id: "req-1", role: "TICKET_REQUESTER", firstName: "راشد" };
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path === "/reports/dashboard") {
        return Promise.resolve({
          data: { totalTickets: 1, openTickets: 1, inProgressTickets: 0, overdueTickets: 0 },
        });
      }
      if (path.includes("/tickets/my-created")) {
        return Promise.resolve({
          data: [{
            id: "t1",
            title: "تعديل قالب الفاتورة",
            status: "NEW",
            ticketNumber: 22,
            updatedAt: "2026-08-20T00:00:00.000Z",
            company: { name: "Company1" },
            hasUpdates: true,
            unreadCount: 2,
          }],
        });
      }
      if (path.includes("/tasks/my")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    await user.click(await screen.findByText("تعديل قالب الفاتورة"));

    await waitFor(() => {
      expect(mockPatch).toHaveBeenCalledWith("/notifications/ticket/t1/read");
    });
  });

  it("lists approved tickets a project manager must assign", async () => {
    authState.user = { id: "pm-1", role: "PROJECT_MANAGER", firstName: "ProjectManagerC1" };
    mockGet.mockImplementation((url: unknown) => {
      const path = String(url);
      if (path === "/reports/dashboard") {
        return Promise.resolve({
          data: { totalTickets: 33, openTickets: 23, inProgressTickets: 2, overdueTickets: 4 },
        });
      }
      if (path.includes("/tickets/my-created")) {
        return Promise.resolve({
          data: [{
            id: "t5",
            title: "[APPROVED][C1/P1] تحسين سرعة شاشة الأصناف",
            status: "APPROVED",
            ticketNumber: 5,
            updatedAt: "2026-08-20T00:00:00.000Z",
            company: { name: "Company1" },
          }],
        });
      }
      if (path.includes("/tasks/my")) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();

    expect(await screen.findByText("[APPROVED][C1/P1] تحسين سرعة شاشة الأصناف")).toBeInTheDocument();
    expect(screen.getByText("معتمدة")).toBeInTheDocument();
    expect(screen.queryByText("no active items")).not.toBeInTheDocument();
  });
});
