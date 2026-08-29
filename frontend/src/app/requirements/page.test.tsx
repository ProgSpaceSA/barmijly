import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MEETING_LABELS, REQUIREMENT_STATUS_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPush = vi.fn();
let role = "PROGRAMMING_HEAD";

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: { user: { id: string; role: string } }) => unknown) => {
    const state = { user: { id: "head-1", role } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn() }),
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RequirementsPage from "./page";

const requirement = (over: Record<string, unknown> = {}) => ({
  id: "req-1",
  requirementNumber: 4,
  title: "تقرير مبيعات يومي",
  status: "NEW",
  source: "MEETING",
  priority: "HIGH",
  createdAt: new Date().toISOString(),
  systemId: "system-1",
  system: { id: "system-1", name: "نظام الفواتير" },
  company: { id: "company-1", name: "الشركة القابضة" },
  owner: null,
  requestedByName: "م. خالد",
  tickets: [],
  ...over,
});

const listPayload = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  data: rows,
  total: rows.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  openCount: rows.length,
  ...over,
});

const lastParams = () => {
  const calls = mockGet.mock.calls.filter(([url]) => url === "/requirements");
  return calls.at(-1)?.[1]?.params ?? {};
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RequirementsPage />
    </QueryClientProvider>,
  );
}

describe("RequirementsPage", () => {
  beforeEach(() => {
    role = "PROGRAMMING_HEAD";
    mockGet.mockImplementation((url: string) => {
      if (url === "/requirements") return Promise.resolve({ data: listPayload([requirement()]) });
      if (url === "/companies") {
        return Promise.resolve({ data: [{ id: "company-1", name: "الشركة القابضة" }] });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({
      data: { requirement: { id: "req-1" }, ticket: { id: "ticket-9" } },
    });
  });

  it("lists requirements with code, status and source", async () => {
    renderPage();

    expect(await screen.findByText("تقرير مبيعات يومي")).toBeInTheDocument();
    expect(screen.getByText("REQ-0004")).toBeInTheDocument();
    expect(screen.getAllByText(REQUIREMENT_STATUS_LABELS.NEW).length).toBeGreaterThan(0);
  });

  it("flags a requirement with no system yet", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/requirements"
        ? Promise.resolve({
            data: listPayload([requirement({ systemId: null, system: null })]),
          })
        : Promise.resolve({ data: [] }),
    );
    renderPage();

    expect(await screen.findAllByText(MEETING_LABELS.unpinned)).not.toHaveLength(0);
  });

  it("maps «تحتاج متابعة» to the open filter rather than a single status", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("تقرير مبيعات يومي");

    await user.click(screen.getByLabelText(MEETING_LABELS.filterStatus));
    await user.click(await screen.findByRole("option", { name: MEETING_LABELS.filterOpen }));

    await waitFor(() => expect(lastParams().open).toBe("true"));
    expect(lastParams().status).toBeUndefined();
  });

  it("promotes from the list and lands on the new ticket", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("تقرير مبيعات يومي");

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.promote }));
    await user.click(await screen.findByRole("button", { name: MEETING_LABELS.promoteConfirm }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/requirements/req-1/promote",
        expect.objectContaining({ type: "NEW_FEATURE" }),
      ),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/tickets/ticket-9"));
  });

  it("refuses to promote a requirement with no system", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/requirements"
        ? Promise.resolve({
            data: listPayload([requirement({ systemId: null, system: null })]),
          })
        : Promise.resolve({ data: [] }),
    );
    renderPage();
    await screen.findByText("تقرير مبيعات يومي");

    expect(screen.getByRole("button", { name: MEETING_LABELS.promote })).toBeDisabled();
  });

  it("hides create and promote from a role that only reads", async () => {
    role = "SYSTEM_OWNER";
    renderPage();
    await screen.findByText("تقرير مبيعات يومي");

    expect(
      screen.queryByRole("button", { name: new RegExp(MEETING_LABELS.newRequirement) }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.promote })).toBeNull();
  });

  it("shows an empty state with no requirements", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/requirements"
        ? Promise.resolve({ data: listPayload([]) })
        : Promise.resolve({ data: [] }),
    );
    renderPage();

    expect(await screen.findByText(MEETING_LABELS.noRequirementsHint)).toBeInTheDocument();
  });
});
