import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BUG_SEVERITY_LABELS, TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPush = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: { user: { id: string; role: string } }) => unknown) => {
    const state = { user: { id: "qa-1", role: "QA" } };
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

import BugsPage from "./page";

const bug = (over: Record<string, unknown> = {}) => ({
  id: "bug-1",
  bugNumber: 114,
  title: "زر الحفظ لا يستجيب",
  severity: "MAJOR",
  status: "OPEN",
  createdAt: new Date().toISOString(),
  ticketId: null,
  reportedBy: { id: "qa-1", firstName: "سارة", lastName: "أحمد" },
  system: { id: "system-1", name: "نظام الفواتير" },
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

const lastBugParams = () => {
  const calls = mockGet.mock.calls.filter(([url]) => url === "/bugs");
  return calls.at(-1)?.[1]?.params ?? {};
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BugsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    if (url === "/bugs") {
      return Promise.resolve({ data: listPayload([bug(), bug({ id: "bug-2", title: "الفلتر لا يعمل", severity: "BLOCKER" })], { openCount: 5 }) });
    }
    return Promise.resolve({ data: [] });
  });
  mockPost.mockResolvedValue({ data: { bug: {}, ticket: { id: "ticket-new" } } });
});

describe("/bugs — stat tiles", () => {
  it("shows four tiles above the list", async () => {
    renderPage();
    expect(await screen.findByText(TESTING_LABELS.total)).toBeInTheDocument();
    expect(screen.getByText(TESTING_LABELS.openBugs)).toBeInTheDocument();
    expect(screen.getByText(TESTING_LABELS.blockers)).toBeInTheDocument();
    expect(screen.getByText(TESTING_LABELS.unpromoted)).toBeInTheDocument();
  });

  it("takes the open count from the API, not from the page of rows", async () => {
    renderPage();
    await screen.findByText(TESTING_LABELS.openBugs);
    const tile = screen.getByText(TESTING_LABELS.openBugs).parentElement;
    expect(tile).toHaveTextContent("5");
  });

  it("flags the blockers tile when there is one", async () => {
    renderPage();
    await screen.findByText(TESTING_LABELS.blockers);
    const tile = screen.getByText(TESTING_LABELS.blockers).closest(".brm-stat");
    expect(tile).toHaveAttribute("data-alert", "true");
  });

  it("leaves the blockers tile calm when there are none", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === "/bugs" ? listPayload([bug()]) : [] }),
    );
    renderPage();
    await screen.findByText(TESTING_LABELS.blockers);
    expect(screen.getByText(TESTING_LABELS.blockers).closest(".brm-stat")).not.toHaveAttribute(
      "data-alert",
    );
  });

  it("shows skeletons instead of zeros while loading", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.queryByText(TESTING_LABELS.blockers)).toBeNull();
  });
});

describe("/bugs — filters", () => {
  it("sends hasTicket=false for «بلا تذكرة»", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterLink }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.noTicket }));

    await waitFor(() => expect(lastBugParams().hasTicket).toBe("false"));
  });

  it("sends hasTicket=true for «لها تذكرة»", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterLink }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.hasTicket }));

    await waitFor(() => expect(lastBugParams().hasTicket).toBe("true"));
  });

  it("clears the link filter via the placeholder", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterLink }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.noTicket }));
    await waitFor(() => expect(lastBugParams().hasTicket).toBe("false"));

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterLink }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.filterLink }));

    await waitFor(() => expect(lastBugParams().hasTicket).toBeUndefined());
  });

  it("sends a severity filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterSeverity }));
    await user.click(await screen.findByRole("option", { name: BUG_SEVERITY_LABELS.BLOCKER }));

    await waitFor(() => expect(lastBugParams().severity).toBe("BLOCKER"));
  });

  it("sends open=true for «تحتاج متابعة»", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterStatus }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.filterOpenBugs }));

    await waitFor(() => expect(lastBugParams().open).toBe("true"));
    expect(lastBugParams().status).toBeUndefined();
  });

  it("sends mine=true for «أخطائي»", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("زر الحفظ لا يستجيب");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterAssignee }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.minePlain }));

    await waitFor(() => expect(lastBugParams().mine).toBe("true"));
  });
});

describe("/bugs — the list", () => {
  it("carries an inline «إنشاء تذكرة» on a bug with no ticket", async () => {
    renderPage();
    expect(
      (await screen.findAllByRole("button", { name: TESTING_LABELS.promote })).length,
    ).toBeGreaterThan(0);
  });

  it("opens the promote dialog, then creates the ticket", async () => {
    const user = userEvent.setup();
    renderPage();

    const [promote] = await screen.findAllByRole("button", { name: TESTING_LABELS.promote });
    await user.click(promote);

    expect(await screen.findByRole("dialog", { name: TESTING_LABELS.promoteTitle })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: TESTING_LABELS.promoteConfirm }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/bugs/bug-1/promote",
        expect.objectContaining({ title: expect.stringContaining("زر الحفظ لا يستجيب") }),
      ),
    );
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/tickets/ticket-new"));
  });

  it("shows an empty state rather than a bare page", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === "/bugs" ? listPayload([]) : [] }),
    );
    renderPage();
    expect(await screen.findByText("list bugs --status open")).toBeInTheDocument();
  });

  it("opens the bug page from a title", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "زر الحفظ لا يستجيب" }));

    expect(mockPush).toHaveBeenCalledWith("/bugs/bug-1");
  });
});
