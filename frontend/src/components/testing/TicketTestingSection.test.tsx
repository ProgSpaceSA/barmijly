import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TicketTestingSection } from "./TicketTestingSection";
import { TESTING_LABELS } from "@/lib/constants";

const mockGet = vi.fn();

vi.mock("@/lib/api", () => ({
  default: { get: (...args: unknown[]) => mockGet(...args), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/components/shared/AttachmentImage", () => ({
  AttachmentImage: ({ alt, className }: { alt: string; className?: string }) => (
    <img alt={alt} className={className} />
  ),
}));

const payload = {
  suites: [
    {
      id: "suite-1",
      suiteNumber: 7,
      title: "مجموعة الدخول",
      state: "ACTIVE",
      rollup: { total: 4, pass: 3, fail: 1, blocked: 0, skipped: 0, notRun: 0, passRate: 75, openBugs: 1 },
    },
  ],
  cases: [
    {
      id: "case-1",
      caseNumber: 114,
      title: "دخول ناجح",
      state: "ACTIVE",
      lastResult: "FAIL",
      suite: { id: "suite-1", title: "مجموعة الدخول" },
      steps: [{ id: "s1", order: 0, body: "افتح صفحة الدخول" }],
    },
  ],
  bugs: [
    { id: "bug-1", bugNumber: 9, title: "زر الحفظ لا يستجيب", severity: "MAJOR", status: "OPEN" },
  ],
};

function renderSection(props: Partial<Parameters<typeof TicketTestingSection>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TicketTestingSection ticketId="ticket-1" {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ data: payload });
});

describe("TicketTestingSection", () => {
  it("reads the ticket's own testing endpoint", async () => {
    renderSection();
    await screen.findByText(TESTING_LABELS.linkedSuites);
    expect(mockGet).toHaveBeenCalledWith("/tickets/ticket-1/testing");
  });

  it("renders all three groups", async () => {
    renderSection();
    expect(await screen.findByText(TESTING_LABELS.linkedSuites)).toBeInTheDocument();
    expect(screen.getByText(TESTING_LABELS.coveringCases)).toBeInTheDocument();
    expect(screen.getByText(TESTING_LABELS.filedBugs)).toBeInTheDocument();
  });

  it("shows a suite's pass rate beside it", async () => {
    renderSection();
    await screen.findByText("مجموعة الدخول");
    expect(screen.getByRole("progressbar", { name: TESTING_LABELS.passRate })).toHaveAttribute(
      "aria-valuenow",
      "75",
    );
  });

  it("links a suite row to its workspace", async () => {
    renderSection();
    expect(await screen.findByRole("link", { name: /مجموعة الدخول/ })).toHaveAttribute(
      "href",
      "/test-suites/suite-1",
    );
  });

  it("deep-links a case title into the suite workspace", async () => {
    renderSection();
    expect(await screen.findByRole("link", { name: /دخول ناجح/ })).toHaveAttribute(
      "href",
      "/test-suites/suite-1?caseId=case-1",
    );
  });

  it("keeps the case steps collapsed until asked for", async () => {
    renderSection();
    await screen.findByText("دخول ناجح");
    expect(screen.queryByText("افتح صفحة الدخول")).toBeNull();
  });

  it("expands a case to read-only steps — the workspace is where they are edited", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(await screen.findByRole("button", { name: TESTING_LABELS.steps }));

    expect(screen.getByText("افتح صفحة الدخول")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.addStep })).toBeNull();
    expect(screen.queryByRole("button", { name: TESTING_LABELS.dragStep })).toBeNull();
  });

  it("offers unlink controls to an author", async () => {
    renderSection({ canAuthor: true, canUnlink: true, onUnlinkSuite: vi.fn(), onUnlinkCase: vi.fn(), onUnlinkBug: vi.fn() });
    expect(await screen.findByRole("button", { name: TESTING_LABELS.unlinkSuite })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TESTING_LABELS.unlinkCase })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: TESTING_LABELS.unlinkBug })).toBeInTheDocument();
  });

  it("hands unlink clicks to the parent", async () => {
    const onUnlinkSuite = vi.fn();
    const onUnlinkCase = vi.fn();
    const onUnlinkBug = vi.fn();
    const user = userEvent.setup();
    renderSection({
      canAuthor: true,
      canUnlink: true,
      onUnlinkSuite,
      onUnlinkCase,
      onUnlinkBug,
    });

    await user.click(await screen.findByRole("button", { name: TESTING_LABELS.unlinkSuite }));
    await user.click(screen.getByRole("button", { name: TESTING_LABELS.unlinkCase }));
    await user.click(screen.getByRole("button", { name: TESTING_LABELS.unlinkBug }));

    expect(onUnlinkSuite).toHaveBeenCalledWith("suite-1");
    expect(onUnlinkCase).toHaveBeenCalledWith("case-1");
    expect(onUnlinkBug).toHaveBeenCalledWith("bug-1");
  });

  it("drops the empty groups rather than showing three empty headings", async () => {
    mockGet.mockResolvedValue({ data: { suites: [], cases: payload.cases, bugs: [] } });
    renderSection();

    expect(await screen.findByText(TESTING_LABELS.coveringCases)).toBeInTheDocument();
    expect(screen.queryByText(TESTING_LABELS.linkedSuites)).toBeNull();
    expect(screen.queryByText(TESTING_LABELS.filedBugs)).toBeNull();
  });

  it("says so when the ticket has no testing at all", async () => {
    mockGet.mockResolvedValue({ data: { suites: [], cases: [], bugs: [] } });
    renderSection();
    expect(await screen.findByText(TESTING_LABELS.ticketSectionEmpty)).toBeInTheDocument();
  });

  it("links each filed bug to its detail page", async () => {
    renderSection();
    expect(await screen.findByRole("link", { name: /زر الحفظ لا يستجيب/ })).toHaveAttribute(
      "href",
      "/bugs/bug-1",
    );
  });

  it("offers «تسجيل خطأ» only to somebody who may file one", async () => {
    const { rerender } = renderSection({ canFileBug: true });
    expect(await screen.findByRole("button", { name: TESTING_LABELS.newBug })).toBeInTheDocument();

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <TicketTestingSection ticketId="ticket-1" canFileBug={false} />
      </QueryClientProvider>,
    );
    expect(screen.queryByRole("button", { name: TESTING_LABELS.newBug })).toBeNull();
  });

  it("offers «ربط بمجموعة» only to an author", async () => {
    renderSection({ canAuthor: true });
    expect(
      await screen.findByRole("button", { name: TESTING_LABELS.linkSuiteFromTicket }),
    ).toBeInTheDocument();
  });

  it("offers «ربط خطأ» when canLinkBug is set", async () => {
    renderSection({ canLinkBug: true, systemId: "sys-1" });
    expect(
      await screen.findByRole("button", { name: TESTING_LABELS.linkBugToTicket }),
    ).toBeInTheDocument();
  });

  it("flags open bugs and failing cases that need attention", async () => {
    renderSection();
    expect(await screen.findByText("دخول ناجح")).toBeInTheDocument();
    expect(screen.getByText("دخول ناجح").closest("[data-attention]")).toHaveAttribute(
      "data-attention",
      "FAIL",
    );
    expect(screen.getByText("زر الحفظ لا يستجيب").closest("[data-attention]")).toHaveAttribute(
      "data-attention",
      "OPEN",
    );
  });

  it("hands the file-bug click to the parent, which owns the dialog", async () => {
    const onFileBug = vi.fn();
    const user = userEvent.setup();
    renderSection({ canFileBug: true, onFileBug });

    await user.click(await screen.findByRole("button", { name: TESTING_LABELS.newBug }));
    expect(onFileBug).toHaveBeenCalledOnce();
  });
});
