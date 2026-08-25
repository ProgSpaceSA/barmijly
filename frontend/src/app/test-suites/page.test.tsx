import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TESTING_LABELS, TEST_STATE_LABELS } from "@/lib/constants";

const mockGet = vi.fn();

vi.mock("@/lib/api", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: { user: { id: string; role: string } }) => unknown) => {
    const state = { user: { id: "qa-1", role: "QA" } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

import TestSuitesPage from "./page";

const suite = {
  id: "suite-1",
  suiteNumber: 7,
  title: "مجموعة تسجيل الدخول",
  state: "ACTIVE",
  owner: { id: "qa-1", firstName: "سارة", lastName: "أحمد" },
  system: { id: "system-1", name: "نظام الفواتير" },
  company: { id: "company-1", name: "شركة أ" },
  _count: { cases: 12 },
  rollup: { total: 12, pass: 10, fail: 0, blocked: 0, skipped: 0, notRun: 2, passRate: 83, openBugs: 0 },
};

const page = (data: unknown[]) => ({
  data,
  total: data.length,
  page: 1,
  limit: 20,
  totalPages: 1,
});

/** The last params object the suites list was queried with. */
const lastSuiteParams = () => {
  const calls = mockGet.mock.calls.filter(([url]) => url === "/test-suites");
  return calls.at(-1)?.[1]?.params ?? {};
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TestSuitesPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockImplementation((url: string) => {
    if (url === "/test-suites") return Promise.resolve({ data: page([suite]) });
    if (url === "/companies") return Promise.resolve({ data: [{ id: "company-1", name: "شركة أ" }] });
    return Promise.resolve({ data: [] });
  });
});

describe("/test-suites", () => {
  it("shows a skeleton while the list is loading", () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("status", { name: "جارٍ التحميل" })).toBeInTheDocument();
  });

  it("renders a card per suite once loaded", async () => {
    renderPage();
    expect(await screen.findByText("مجموعة تسجيل الدخول")).toBeInTheDocument();
    expect(screen.getByText("TS-0007")).toBeInTheDocument();
  });

  it("shows an empty state rather than a bare page", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: url === "/test-suites" ? page([]) : [] }),
    );
    renderPage();
    expect(await screen.findByText("list test-suites")).toBeInTheDocument();
  });

  it("offers «مجموعة جديدة» to an author", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: new RegExp(TESTING_LABELS.newSuite) }),
    ).toBeInTheDocument();
  });

  it("puts the search term into the query", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("مجموعة تسجيل الدخول");

    await user.type(screen.getByLabelText(TESTING_LABELS.searchSuites), "دخول");

    await waitFor(() => expect(lastSuiteParams().search).toBe("دخول"));
  });

  it("puts a health filter into the query", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("مجموعة تسجيل الدخول");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterHealth }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.healthFailing }));

    await waitFor(() => expect(lastSuiteParams().health).toBe("failing"));
  });

  it("asks for the archive as its own list, not as a state", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("مجموعة تسجيل الدخول");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterState }));
    await user.click(await screen.findByRole("option", { name: TEST_STATE_LABELS.ARCHIVED }));

    await waitFor(() => expect(lastSuiteParams().isArchived).toBe("true"));
    expect(lastSuiteParams().state).toBeUndefined();
  });

  it("sends `state` for a live filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("مجموعة تسجيل الدخول");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterState }));
    await user.click(await screen.findByRole("option", { name: TEST_STATE_LABELS.DRAFT }));

    await waitFor(() => expect(lastSuiteParams().state).toBe("DRAFT"));
    expect(lastSuiteParams().isArchived).toBeUndefined();
  });

  it("sends `mine=true` for «المُسندة إليّ»", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("مجموعة تسجيل الدخول");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterOwner }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.mine }));

    await waitFor(() => expect(lastSuiteParams().mine).toBe("true"));
  });

  it("resets to page 1 when a filter changes", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("مجموعة تسجيل الدخول");

    await user.click(screen.getByRole("combobox", { name: TESTING_LABELS.filterHealth }));
    await user.click(await screen.findByRole("option", { name: TESTING_LABELS.healthNotRun }));

    await waitFor(() => expect(lastSuiteParams().page).toBe("1"));
  });

  it("shows the total, not the page size", async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        data: url === "/test-suites" ? { ...page([suite]), total: 42 } : [],
      }),
    );
    renderPage();
    expect(await screen.findByText("42")).toBeInTheDocument();
  });
});
