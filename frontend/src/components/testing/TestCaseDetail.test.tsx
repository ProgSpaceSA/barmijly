import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TestCaseDetail, type TestCaseDetailData } from "./TestCaseDetail";
import { TESTING_LABELS, TEST_RESULT_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    delete: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const testCase = (over: Partial<TestCaseDetailData> = {}): TestCaseDetailData => ({
  id: "case-1",
  caseNumber: 114,
  suiteId: "suite-1",
  title: "تسجيل الدخول بكلمة مرور صحيحة",
  description: "يتحقق من المسار السعيد",
  preconditions: "حساب فعّال",
  expectedResult: "يفتح لوحة التحكم",
  actualResult: null,
  state: "ACTIVE",
  lastResult: "NOT_RUN",
  ...over,
});

const steps = [{ id: "s1", order: 0, body: "افتح صفحة الدخول" }];

function renderDetail(props: Partial<Parameters<typeof TestCaseDetail>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TestCaseDetail testCase={testCase()} {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ data: steps });
  mockPost.mockResolvedValue({ data: {} });
  mockPatch.mockResolvedValue({ data: {} });
});

describe("TestCaseDetail — the result footer", () => {
  it("offers the four verdicts a run can end in, and not NOT_RUN", () => {
    renderDetail({ canExecute: true });
    for (const result of ["PASS", "FAIL", "BLOCKED", "SKIPPED"]) {
      expect(screen.getByRole("button", { name: TEST_RESULT_LABELS[result] })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: TEST_RESULT_LABELS.NOT_RUN })).toBeNull();
  });

  it("records the picked result against the case", async () => {
    const user = userEvent.setup();
    renderDetail({ canExecute: true });

    await user.click(screen.getByRole("button", { name: TEST_RESULT_LABELS.FAIL }));

    expect(mockPost).toHaveBeenCalledWith(
      "/test-cases/case-1/result",
      expect.objectContaining({ result: "FAIL" }),
    );
  });

  it("marks the current result pressed", () => {
    renderDetail({ testCase: testCase({ lastResult: "PASS" }), canExecute: true });
    expect(screen.getByRole("button", { name: TEST_RESULT_LABELS.PASS })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides the footer from a reader who cannot execute", () => {
    renderDetail({ canExecute: false });
    expect(screen.queryByRole("button", { name: TEST_RESULT_LABELS.PASS })).toBeNull();
  });

  it("offers no result buttons on a draft — publish it first", () => {
    renderDetail({ testCase: testCase({ state: "DRAFT" }), canExecute: true, canAuthor: true });
    expect(screen.queryByRole("button", { name: TEST_RESULT_LABELS.PASS })).toBeNull();
  });

  it("drops the whole action bar on an archived case", () => {
    renderDetail({ testCase: testCase({ state: "ARCHIVED" }), canExecute: true, canAuthor: true });
    expect(screen.queryByRole("button", { name: TEST_RESULT_LABELS.PASS })).toBeNull();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.deleteCase })).toBeNull();
  });
});

describe("TestCaseDetail — publishing", () => {
  it("allows publish on a draft even with blank steps", async () => {
    mockGet.mockResolvedValue({ data: [{ id: "s1", order: 0, body: "  " }] });
    renderDetail({ testCase: testCase({ state: "DRAFT" }), canAuthor: true });

    const publish = await screen.findByRole("button", { name: TESTING_LABELS.publishCase });
    expect(publish).toBeEnabled();
    expect(publish).not.toHaveAttribute("title", TESTING_LABELS.publishNeedsStep);
  });

  it("shows no publish button on an already published case", () => {
    renderDetail({ canAuthor: true });
    expect(screen.queryByRole("button", { name: TESTING_LABELS.publishCase })).toBeNull();
  });
});

describe("TestCaseDetail — editing", () => {
  it("debounces an edited title rather than saving on blur", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail({ canAuthor: true });

    const title = screen.getByLabelText(TESTING_LABELS.caseTitle);
    await user.clear(title);
    await user.type(title, "عنوان أدق");
    expect(mockPatch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(450);
    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/test-cases/case-1", { title: "عنوان أدق" }),
    );
    vi.useRealTimers();
  });

  it("refuses to save a blanked title and keeps the empty field", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderDetail({ canAuthor: true });

    const title = screen.getByLabelText(TESTING_LABELS.caseTitle);
    await user.clear(title);
    await vi.advanceTimersByTimeAsync(450);

    expect(mockPatch).not.toHaveBeenCalled();
    expect(title).toHaveValue("");
    vi.useRealTimers();
  });

  it("renders read-only text for someone who cannot author", () => {
    renderDetail({ canAuthor: false });
    expect(screen.queryByLabelText(TESTING_LABELS.caseTitle)).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "تسجيل الدخول بكلمة مرور صحيحة",
    );
  });

  it("lets a runner write the actual result without being able to author", () => {
    renderDetail({ canAuthor: false, canExecute: true });
    expect(screen.getByLabelText(TESTING_LABELS.actualResult)).toBeInTheDocument();
    expect(screen.queryByLabelText(TESTING_LABELS.expectedResult)).toBeNull();
  });
});

describe("TestCaseDetail — the bugs section", () => {
  const bugs = [
    { id: "bug-1", bugNumber: 1, title: "لا يحفظ", severity: "MAJOR", status: "OPEN", ticketId: null },
  ];

  it("starts expanded — a failing case's bugs are the point", () => {
    renderDetail({ bugs });
    expect(screen.getByText("لا يحفظ")).toBeInTheDocument();
  });

  it("collapses and re-expands the section", async () => {
    const user = userEvent.setup();
    renderDetail({ bugs });

    const toggle = screen.getByRole("button", { name: new RegExp(TESTING_LABELS.bugs) });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("لا يحفظ")).toBeNull();

    await user.click(toggle);
    expect(screen.getByText("لا يحفظ")).toBeInTheDocument();
  });

  it("offers «إنشاء تذكرة» on a bug that has none", () => {
    renderDetail({ bugs });
    expect(screen.getByRole("button", { name: TESTING_LABELS.promote })).toBeInTheDocument();
  });

  it("links the bug title to its detail page", () => {
    renderDetail({ bugs });
    expect(screen.getByRole("link", { name: "لا يحفظ" })).toHaveAttribute("href", "/bugs/bug-1");
  });

  it("drops the promote button once the bug is promoted", () => {
    renderDetail({ bugs: [{ ...bugs[0], ticketId: "ticket-1" }] });
    expect(screen.queryByRole("button", { name: TESTING_LABELS.promote })).toBeNull();
  });

  it("opens an inline form to file a bug — not a modal", async () => {
    const user = userEvent.setup();
    renderDetail({ canExecute: true });
    await user.click(screen.getByRole("button", { name: TESTING_LABELS.newBug }));
    expect(screen.getByLabelText(TESTING_LABELS.bugTitle)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers «ربط خطأ» beside filing a new one", async () => {
    const user = userEvent.setup();
    renderDetail({ canExecute: true, systemId: "system-1" });
    expect(screen.getByRole("button", { name: TESTING_LABELS.linkExistingBug })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: TESTING_LABELS.linkExistingBug }));
    expect(screen.getByRole("dialog", { name: TESTING_LABELS.linkExistingBug })).toBeInTheDocument();
  });

  it("hides the add affordance from a reader", () => {
    renderDetail({ canExecute: false });
    expect(screen.queryByRole("button", { name: TESTING_LABELS.newBug })).toBeNull();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.linkExistingBug })).toBeNull();
  });
});

describe("TestCaseDetail — case ticket chip", () => {
  const suiteTickets = [
    { id: "ticket-1", title: "إصلاح الدخول", ticketNumber: 42 },
    { id: "ticket-2", title: "تحديث التقارير", ticketNumber: 99 },
  ];

  it("shows a link chip when the case already has a ticket", () => {
    renderDetail({
      canAuthor: true,
      suiteTickets,
      testCase: testCase({
        ticket: { id: "ticket-1", title: "إصلاح الدخول", ticketNumber: 42 },
      }),
    });
    expect(screen.getByRole("link", { name: /إصلاح الدخول/ })).toHaveAttribute(
      "href",
      "/tickets/ticket-1",
    );
    expect(screen.getByRole("button", { name: TESTING_LABELS.unlinkTicket })).toBeInTheDocument();
  });

  it("offers «ربط بتذكرة» when unlinked and the suite has tickets", async () => {
    const user = userEvent.setup();
    renderDetail({ canAuthor: true, suiteTickets });

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.linkTicket }));
    expect(screen.getByLabelText(TESTING_LABELS.searchTickets)).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /تحديث التقارير/ }));

    expect(mockPatch).toHaveBeenCalledWith("/test-cases/case-1", { ticketId: "ticket-2" });
  });

  it("confirms before clearing the ticket link", async () => {
    const user = userEvent.setup();
    renderDetail({
      canAuthor: true,
      suiteTickets,
      testCase: testCase({
        ticket: { id: "ticket-1", title: "إصلاح الدخول", ticketNumber: 42 },
      }),
    });

    await user.click(screen.getByRole("button", { name: TESTING_LABELS.unlinkTicket }));
    const dialog = screen.getByRole("dialog", { name: TESTING_LABELS.unlinkTicket });
    expect(dialog).toHaveTextContent(TESTING_LABELS.unlinkConfirm);
    await user.click(within(dialog).getByRole("button", { name: TESTING_LABELS.unlinkTicket }));

    expect(mockPatch).toHaveBeenCalledWith("/test-cases/case-1", { ticketId: null });
  });
});
