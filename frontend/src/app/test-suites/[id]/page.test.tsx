import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();

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

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: nav.replace }),
  useSearchParams: () => nav.search,
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

import SuiteWorkspacePage from "./page";

const cases = [
  { id: "case-1", caseNumber: 1, suiteId: "suite-1", title: "دخول ناجح", state: "ACTIVE", lastResult: "PASS", expectedResult: "لوحة التحكم" },
  { id: "case-2", caseNumber: 2, suiteId: "suite-1", title: "دخول خاطئ", state: "ACTIVE", lastResult: "FAIL", expectedResult: "رسالة خطأ" },
];

const suite = {
  id: "suite-1",
  suiteNumber: 7,
  title: "مجموعة تسجيل الدخول",
  description: "المسارات الأساسية للدخول",
  state: "ACTIVE",
  systemId: "system-1",
  companyId: "company-1",
  system: { id: "system-1", name: "نظام الفواتير" },
  cases,
  ticketLinks: [
    { ticketId: "ticket-1", ticket: { id: "ticket-1", title: "تعديل الدخول", ticketNumber: 142 } },
  ],
  rollup: { total: 2, pass: 1, fail: 1, blocked: 0, skipped: 0, notRun: 0, passRate: 50, openBugs: 0 },
};

/** The workspace picks its layout off the viewport, so tests set one. */
function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
}

/**
 * `use(params)` suspends, so the test supplies the boundary Next.js would, and
 * pre-settles the promise the way the framework hands it over.
 */
const params = Object.assign(Promise.resolve({ id: "suite-1" }), {
  status: "fulfilled",
  value: { id: "suite-1" },
}) as Promise<{ id: string }>;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <SuiteWorkspacePage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  nav.search = new URLSearchParams();
  setViewport(1280);
  mockGet.mockImplementation((url: string) => {
    if (url === "/test-suites/suite-1") return Promise.resolve({ data: suite });
    if (url === "/test-cases/case-1") return Promise.resolve({ data: { ...cases[0], bugs: [] } });
    if (url === "/test-cases/case-2") return Promise.resolve({ data: { ...cases[1], bugs: [] } });
    if (url.endsWith("/steps")) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  mockPost.mockResolvedValue({ data: { id: "case-new" } });
});

describe("/test-suites/[id] — the suite header", () => {
  it("names the suite, its code and its system", async () => {
    await renderPage();
    expect(await screen.findByRole("heading", { name: suite.title })).toBeInTheDocument();
    expect(screen.getByText("TS-0007")).toBeInTheDocument();
    expect(screen.getByText("نظام الفواتير")).toBeInTheDocument();
  });

  it("shows the pass rate over its published cases", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: suite.title });
    const bars = screen.getAllByRole("progressbar", { name: TESTING_LABELS.passRate });
    expect(bars[0]).toHaveAttribute("aria-valuenow", "50");
  });

  it("lists the linked tickets", async () => {
    await renderPage();
    expect(await screen.findByText("BRM-0142")).toBeInTheDocument();
  });

  it("offers publish only on a draft", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: suite.title });
    expect(screen.queryByRole("button", { name: TESTING_LABELS.publishSuite })).toBeNull();

    mockGet.mockImplementation((url: string) =>
      url === "/test-suites/suite-1"
        ? Promise.resolve({ data: { ...suite, state: "DRAFT" } })
        : Promise.resolve({ data: [] }),
    );
    await renderPage();
    expect(
      await screen.findByRole("button", { name: TESTING_LABELS.publishSuite }),
    ).toBeInTheDocument();
  });
});

describe("/test-suites/[id] — desktop", () => {
  it("shows the case panel and the detail pane at once", async () => {
    await renderPage();
    // Panel: the case rows. Detail: the selected case's own fields.
    expect(await screen.findByRole("button", { name: /دخول ناجح/ })).toBeInTheDocument();
    expect(await screen.findByLabelText(TESTING_LABELS.caseTitle)).toBeInTheDocument();
  });

  it("opens on the first case rather than an empty pane", async () => {
    await renderPage();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/test-cases/case-1"));
  });

  it("writes ?caseId= when the first case is auto-selected", async () => {
    await renderPage();
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith("/test-suites/suite-1?caseId=case-1", {
        scroll: false,
      }),
    );
  });

  it("honours ?caseId= when it matches a case", async () => {
    nav.search = new URLSearchParams("caseId=case-2");
    await renderPage();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/test-cases/case-2"));
  });

  it("switches the detail pane when another case is picked", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("button", { name: /دخول خاطئ/ });

    await user.click(screen.getByRole("button", { name: /دخول خاطئ/ }));

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("/test-cases/case-2"));
    expect(nav.replace).toHaveBeenCalledWith("/test-suites/suite-1?caseId=case-2", {
      scroll: false,
    });
  });

  it("offers no mobile back chevron", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: suite.title });
    const back = screen.queryByRole("button", { name: TESTING_LABELS.cases });
    expect(back === null || back.className.includes("lg:hidden")).toBe(true);
  });
});

describe("/test-suites/[id] — mobile", () => {
  beforeEach(() => setViewport(360));

  it("opens on the case panel, with no case pre-selected", async () => {
    await renderPage();
    await screen.findByRole("button", { name: /دخول ناجح/ });
    expect(mockGet).not.toHaveBeenCalledWith("/test-cases/case-1");
    expect(screen.getByText(TESTING_LABELS.selectCase)).toBeInTheDocument();
  });

  it("opens a case full-screen with a way back to the list", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: /دخول ناجح/ }));

    expect(await screen.findByLabelText(TESTING_LABELS.caseTitle)).toBeInTheDocument();
    const back = screen.getByRole("button", { name: TESTING_LABELS.cases });
    expect(back.className).toContain("lg:hidden");
  });

  it("goes back to the panel from the chevron", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: /دخول ناجح/ }));
    await screen.findByLabelText(TESTING_LABELS.caseTitle);
    await user.click(screen.getByRole("button", { name: TESTING_LABELS.cases }));

    expect(screen.queryByLabelText(TESTING_LABELS.caseTitle)).toBeNull();
    expect(screen.getByRole("button", { name: /دخول ناجح/ })).toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith("/test-suites/suite-1", { scroll: false });
  });
});

describe("/test-suites/[id] — adding a case", () => {
  it("creates the case and selects it", async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(await screen.findByRole("button", { name: TESTING_LABELS.addCase }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/test-suites/suite-1/cases", expect.any(Object)),
    );
  });
});
