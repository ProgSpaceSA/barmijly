import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HUB_LABELS, TOOL_CATEGORY_LABELS, TOOL_STATUS_LABELS, TOOL_TEAM_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
let role = "PROGRAMMING_HEAD";

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
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
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/layout/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import HubPage from "./page";

const tool = (over: Record<string, unknown> = {}) => ({
  id: "tool-1",
  name: "Postman",
  website: "https://www.postman.com",
  description: "تشغيل طلبات الـ API المحفوظة",
  gettingStarted: "ثبّت التطبيق",
  categories: ["TESTING"],
  teams: ["BACKEND", "QA"],
  status: "APPROVED",
  requestedById: "dev-1",
  requestedBy: { id: "dev-1", firstName: "خالد", lastName: "أ", role: "DEVELOPER" },
  decidedBy: { id: "head-1", firstName: "سارة", lastName: "ب", role: "PROGRAMMING_HEAD" },
  decisionNote: null,
  createdAt: new Date().toISOString(),
  ...over,
});

const feedback = (over: Record<string, unknown> = {}) => ({
  id: "fb-1",
  title: "طريقة أوضح للتواصل",
  body: "نحتاج قناة واحدة للأسئلة اليومية",
  kind: "IMPROVEMENT",
  status: "OPEN",
  proposedSolution: "قناة Slack",
  resolutionNote: null,
  createdById: "dev-1",
  createdBy: { id: "dev-1", firstName: "خالد", lastName: "أ", role: "DEVELOPER" },
  assigneeId: "head-1",
  assignee: { id: "head-1", firstName: "سارة", lastName: "ب", role: "PROGRAMMING_HEAD" },
  createdAt: new Date().toISOString(),
  ...over,
});

const payload = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  data: rows,
  total: rows.length,
  approvedCount: rows.length,
  pendingCount: 0,
  ...over,
});

const feedbackPayload = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  data: rows,
  total: rows.length,
  inboxCount: 0,
  ...over,
});

/** The catalogue call is the one without a status param. */
const catalogueParams = () => {
  const calls = mockGet.mock.calls.filter(
    ([url, cfg]) => url === "/tools" && !cfg?.params?.status,
  );
  return calls.at(-1)?.[1]?.params ?? {};
};

const feedbackParams = () => {
  const calls = mockGet.mock.calls.filter(([url]) => url === "/feedback");
  return calls.at(-1)?.[1]?.params ?? {};
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HubPage />
    </QueryClientProvider>,
  );
}

describe("HubPage", () => {
  beforeEach(() => {
    role = "PROGRAMMING_HEAD";
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") return Promise.resolve({ data: payload([tool()], { pendingCount: 1 }) });
      if (url === "/feedback") return Promise.resolve({ data: feedbackPayload([feedback()], { inboxCount: 1 }) });
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 1 } });
      if (url === "/users/mentionable") {
        return Promise.resolve({
          data: [
            { id: "head-1", firstName: "سارة", lastName: "ب", role: "PROGRAMMING_HEAD" },
            { id: "dev-1", firstName: "خالد", lastName: "أ", role: "DEVELOPER" },
            { id: "qa-1", firstName: "ليلى", lastName: "ج", role: "QA" },
          ],
        });
      }
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ data: tool() });
    mockPatch.mockResolvedValue({ data: feedback() });
  });

  it("lists approved tools with their status, categories, and who asked / approved", async () => {
    renderPage();

    expect(await screen.findByText("Postman")).toBeInTheDocument();
    expect(screen.getAllByText(TOOL_STATUS_LABELS.APPROVED).length).toBeGreaterThan(0);
    expect(screen.getByText("تشغيل طلبات الـ API المحفوظة")).toBeInTheDocument();
    expect(screen.getByText(new RegExp(HUB_LABELS.requestedBy))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(HUB_LABELS.decidedBy))).toBeInTheDocument();
  });

  it("keeps getting-started folded until opened", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");

    expect(screen.queryByText("ثبّت التطبيق")).toBeNull();
    await user.click(screen.getByRole("button", { name: HUB_LABELS.showSteps }));
    expect(await screen.findByText("ثبّت التطبيق")).toBeInTheDocument();
  });

  it("shows workflow guides collapsed by default on the guides tab", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") return Promise.resolve({ data: payload([tool()], { pendingCount: 1 }) });
      if (url === "/guides") {
        return Promise.resolve({
          data: [
            {
              id: "g1",
              title: "مسار التذكرة",
              summary: "من الفكرة حتى الإغلاق",
              steps: ["اكتب النتيجة", "انتظر الاعتماد"],
              sortOrder: 0,
            },
            {
              id: "g2",
              title: "قواعد عامة للمطوّرين",
              summary: "سلوك يومي متفق عليه",
              steps: ["أبلغ عند التعثّر"],
              sortOrder: 1,
            },
          ],
        });
      }
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await screen.findByText("Postman");

    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabGuides }));

    expect(await screen.findByText("مسار التذكرة")).toBeInTheDocument();
    expect(screen.queryByText("اكتب النتيجة")).toBeNull();
    expect(screen.getByText("قواعد عامة للمطوّرين")).toBeInTheDocument();
  });

  it("lets managers add a workflow section", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") return Promise.resolve({ data: payload([tool()]) });
      if (url === "/guides") return Promise.resolve({ data: [] });
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({
      data: {
        id: "g-new",
        title: "متطلبات",
        summary: "وضوح أولاً",
        steps: ["وثّق الهدف"],
      },
    });
    renderPage();
    await screen.findByText("Postman");
    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabGuides }));
    await user.click(await screen.findByRole("button", { name: new RegExp(HUB_LABELS.newGuide) }));

    await user.type(await screen.findByLabelText(HUB_LABELS.guideTitle), "متطلبات");
    await user.type(screen.getByLabelText(HUB_LABELS.guideSummary), "وضوح أولاً");
    await user.type(screen.getByLabelText(`${HUB_LABELS.guideStepN} 1`), "وثّق الهدف");
    await user.click(screen.getByRole("button", { name: HUB_LABELS.addGuideStep }));
    await user.type(screen.getByLabelText(`${HUB_LABELS.guideStepN} 2`), "اعتمد");
    await user.click(screen.getByRole("button", { name: HUB_LABELS.save }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/guides", {
        title: "متطلبات",
        summary: "وضوح أولاً",
        steps: ["وثّق الهدف", "اعتمد"],
      }),
    );
  });

  it("places add-section above the guide list, not in the page header", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") return Promise.resolve({ data: payload([tool()]) });
      if (url === "/guides") {
        return Promise.resolve({
          data: [
            {
              id: "g1",
              title: "قواعد عامة للمطوّرين",
              summary: "سلوك يومي",
              steps: ["لا ترفع الأسرار"],
              sortOrder: 0,
            },
          ],
        });
      }
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: [] });
    });
    renderPage();
    await screen.findByText("Postman");
    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabGuides }));
    expect(await screen.findByText("قواعد عامة للمطوّرين")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(HUB_LABELS.newGuide) })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: new RegExp(HUB_LABELS.newTool) })).toBeNull();
  });
  it("groups tools into newly-added and category sections", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") {
        return Promise.resolve({
          data: payload(
            [
              tool({ id: "t1", name: "Postman", categories: ["TESTING"], status: "APPROVED" }),
              tool({
                id: "t2",
                name: "Cursor",
                categories: ["AI_CODING"],
                status: "APPROVED",
                description: "AI editor",
              }),
              tool({
                id: "t3",
                name: "Linear",
                categories: ["COMMUNICATION"],
                status: "REQUESTED",
                description: "Issue tracker",
                decidedBy: null,
              }),
            ],
            { pendingCount: 1 },
          ),
        });
      }
      if (url === "/feedback") return Promise.resolve({ data: feedbackPayload([]) });
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 0 } });
      if (url === "/users/mentionable") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    renderPage();
    expect(await screen.findByText(HUB_LABELS.sectionNewlyAdded)).toBeInTheDocument();
    expect(screen.getAllByText(TOOL_CATEGORY_LABELS.TESTING).length).toBeGreaterThan(0);
    expect(screen.getAllByText(TOOL_CATEGORY_LABELS.AI_CODING).length).toBeGreaterThan(0);
    expect(screen.getByText("Linear")).toBeInTheDocument();
    expect(screen.getByText("Postman")).toBeInTheDocument();
    expect(screen.getByText("Cursor")).toBeInTheDocument();
  });

  it("limits the feedback assignee picker to head, PM, and senior management", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");
    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabFeedback }));
    await screen.findByText("طريقة أوضح للتواصل");

    await user.click(screen.getByLabelText(HUB_LABELS.filterAssignee));
    expect(await screen.findByRole("option", { name: "سارة ب" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "خالد أ" })).toBeNull();
    expect(screen.queryByRole("option", { name: "ليلى ج" })).toBeNull();
  });

  it("has no requests tab", async () => {
    renderPage();
    await screen.findByText("Postman");

    expect(screen.queryByRole("tab", { name: /الطلبات/ })).toBeNull();
    expect(screen.getByRole("tab", { name: HUB_LABELS.tabFeedback })).toBeInTheDocument();
  });

  it("filters the catalogue by category", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");

    await user.click(screen.getByLabelText(HUB_LABELS.filterCategory));
    await user.click(await screen.findByRole("option", { name: TOOL_CATEGORY_LABELS.TESTING }));

    await waitFor(() => expect(catalogueParams().category).toBe("TESTING"));
  });

  it("requests a tool with the fields the API needs", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");

    await user.click(screen.getByRole("button", { name: new RegExp(HUB_LABELS.newTool) }));
    await user.type(await screen.findByLabelText(HUB_LABELS.toolName), "Insomnia");
    await user.type(screen.getByLabelText(HUB_LABELS.toolWebsite), "https://insomnia.rest");
    await user.type(screen.getByLabelText(HUB_LABELS.toolDescription), "عميل API بديل");
    await user.type(screen.getByLabelText(HUB_LABELS.toolGettingStarted), "١. ثبّت التطبيق");
    await user.click(screen.getByRole("button", { name: TOOL_CATEGORY_LABELS.TESTING, pressed: false }));
    await user.click(screen.getByRole("button", { name: TOOL_TEAM_LABELS.BACKEND, pressed: false }));

    await user.click(screen.getByRole("button", { name: HUB_LABELS.save }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tools", {
        name: "Insomnia",
        website: "https://insomnia.rest",
        description: "عميل API بديل",
        gettingStarted: "١. ثبّت التطبيق",
        categories: ["TESTING"],
        teams: ["BACKEND"],
      }),
    );
  });

  it("keeps save disabled until every field, a category, and a team are filled", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");

    await user.click(screen.getByRole("button", { name: new RegExp(HUB_LABELS.newTool) }));
    await user.type(await screen.findByLabelText(HUB_LABELS.toolName), "Insomnia");

    expect(screen.getByRole("button", { name: HUB_LABELS.save })).toBeDisabled();
  });

  it("approves a pending request from the tools list", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") {
        return Promise.resolve({
          data: payload([tool({ status: "REQUESTED", decidedBy: null })], { pendingCount: 1 }),
        });
      }
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: [] });
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: HUB_LABELS.approve }));

    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("/tools/tool-1/approve"));
  });

  it("requires a reason before a decline is sent", async () => {
    const user = userEvent.setup();
    mockGet.mockImplementation((url: string) => {
      if (url === "/tools") {
        return Promise.resolve({
          data: payload([tool({ status: "REQUESTED", decidedBy: null })], { pendingCount: 1 }),
        });
      }
      if (url === "/feedback/inbox-count") return Promise.resolve({ data: { count: 0 } });
      return Promise.resolve({ data: [] });
    });
    renderPage();

    await user.click(await screen.findByRole("button", { name: HUB_LABELS.decline }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByRole("button", { name: HUB_LABELS.decline })).toBeDisabled();

    await user.type(dialog.getByLabelText(HUB_LABELS.declineNote), "يغطيها Swagger");
    await user.click(dialog.getByRole("button", { name: HUB_LABELS.decline }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/tools/tool-1/decline", {
        note: "يغطيها Swagger",
      }),
    );
  });

  it("hides every decision from a developer", async () => {
    role = "DEVELOPER";
    renderPage();
    await screen.findByText("Postman");

    expect(screen.queryByRole("tab", { name: /الطلبات/ })).toBeNull();
    expect(screen.queryByRole("button", { name: HUB_LABELS.approve })).toBeNull();
    expect(screen.queryByRole("button", { name: HUB_LABELS.retire })).toBeNull();
    expect(screen.queryByLabelText(HUB_LABELS.filterStatus)).toBeNull();
  });

  it("hides the tool-request button from a role that only reads the catalogue", async () => {
    role = "TICKET_REQUESTER";
    renderPage();
    await screen.findByText("Postman");

    expect(screen.queryByRole("button", { name: new RegExp(HUB_LABELS.newTool) })).toBeNull();
  });

  it("shows an empty state with no tools", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/tools"
        ? Promise.resolve({ data: payload([]) })
        : url === "/feedback/inbox-count"
          ? Promise.resolve({ data: { count: 0 } })
          : Promise.resolve({ data: [] }),
    );
    renderPage();

    expect(await screen.findByText(HUB_LABELS.noToolsHint)).toBeInTheDocument();
  });

  it("lists complaints and improvements on the feedback tab", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");

    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabFeedback }));

    expect(await screen.findByText("طريقة أوضح للتواصل")).toBeInTheDocument();
    expect(screen.getByLabelText(HUB_LABELS.filterKind)).toBeInTheDocument();
    expect(screen.getByLabelText(HUB_LABELS.filterAssignee)).toBeInTheDocument();
  });

  it("files a general improvement with an optional proposed solution", async () => {
    const user = userEvent.setup({ delay: null });
    mockPost.mockResolvedValue({ data: feedback() });
    renderPage();
    await screen.findByText("Postman");

    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabFeedback }));
    await user.click(await screen.findByRole("button", { name: new RegExp(HUB_LABELS.newFeedback) }));

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(HUB_LABELS.feedbackTitle), "نحتاج طريقة أوضح للتواصل");
    await user.type(dialog.getByLabelText(HUB_LABELS.feedbackBody), "الأسئلة تتوزع بين الإيميل والمجموعات");
    await user.type(dialog.getByLabelText(HUB_LABELS.proposedSolution), "قناة واحدة للفريق");

    await user.click(dialog.getByRole("button", { name: HUB_LABELS.save }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/feedback", {
        title: "نحتاج طريقة أوضح للتواصل",
        body: "الأسئلة تتوزع بين الإيميل والمجموعات",
        kind: "IMPROVEMENT",
        proposedSolution: "قناة واحدة للفريق",
      }),
    );
  }, 10_000);

  it("filters feedback by kind", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");
    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabFeedback }));
    await screen.findByText("طريقة أوضح للتواصل");

    await user.click(screen.getByLabelText(HUB_LABELS.filterKind));
    await user.click(await screen.findByRole("option", { name: "شكوى" }));

    await waitFor(() => expect(feedbackParams().kind).toBe("COMPLAINT"));
  });

  it("lets a requester file feedback even though they cannot request a tool", async () => {
    role = "TICKET_REQUESTER";
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Postman");

    expect(screen.queryByRole("button", { name: new RegExp(HUB_LABELS.newTool) })).toBeNull();
    await user.click(screen.getByRole("tab", { name: HUB_LABELS.tabFeedback }));
    expect(await screen.findByRole("button", { name: new RegExp(HUB_LABELS.newFeedback) })).toBeInTheDocument();
  });
});
