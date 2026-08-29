import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MEETING_LABELS, REQUIREMENT_STATUS_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockPush = vi.fn();
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
    const state = { user: { id: "head-1", role, firstName: "أحمد", lastName: "علي" } };
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

// The thread has its own tests; here it only has to mount without a ticket.
vi.mock("@/components/tickets/CommentThread", () => ({
  CommentThread: ({ parent }: { parent: { kind: string; id: string } }) => (
    <div data-testid="thread">{`${parent.kind}:${parent.id}`}</div>
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import RequirementDetailPage from "./page";

const requirement = (over: Record<string, unknown> = {}) => ({
  id: "req-1",
  requirementNumber: 4,
  title: "تقرير مبيعات يومي",
  description: "يريد الرئيس التنفيذي تقريراً يومياً.",
  status: "NEW",
  source: "MEETING",
  sourceNote: null,
  priority: "HIGH",
  dueDate: null,
  isArchived: false,
  companyId: "company-1",
  systemId: "system-1",
  ownerId: null,
  system: { id: "system-1", name: "نظام الفواتير" },
  company: { id: "company-1", name: "الشركة القابضة" },
  owner: null,
  requestedByName: "م. خالد",
  meetingPoint: {
    id: "point-1",
    body: "نريد تقريراً يومياً للمبيعات",
    meeting: { id: "meeting-1", title: "اجتماع الربع الثالث", meetingNumber: 7 },
  },
  tickets: [],
  attachments: [],
  comments: [],
  statusHistory: [
    {
      id: "h1",
      fromStatus: null,
      toStatus: "NEW",
      createdAt: new Date().toISOString(),
      changedBy: { firstName: "أحمد", lastName: "علي" },
    },
  ],
  ...over,
});

const params = Object.assign(Promise.resolve({ id: "req-1" }), {
  status: "fulfilled",
  value: { id: "req-1" },
}) as Promise<{ id: string }>;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <RequirementDetailPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return result;
}

describe("RequirementDetailPage", () => {
  beforeEach(() => {
    role = "PROGRAMMING_HEAD";
    mockGet.mockImplementation((url: string) => {
      if (url === "/requirements/req-1") return Promise.resolve({ data: requirement() });
      if (url.startsWith("/systems")) {
        return Promise.resolve({ data: [{ id: "system-1", name: "نظام الفواتير" }] });
      }
      if (url === "/users/developers") {
        return Promise.resolve({ data: [{ id: "dev-1", firstName: "سارة", lastName: "أحمد" }] });
      }
      return Promise.resolve({ data: [] });
    });
    mockPatch.mockResolvedValue({ data: requirement() });
    mockPost.mockResolvedValue({
      data: { requirement: requirement({ status: "CONVERTED" }), ticket: { id: "ticket-9" } },
    });
  });

  it("shows the origin strip linking back to the meeting", async () => {
    await renderPage();

    expect(await screen.findByRole("heading", { name: "تقرير مبيعات يومي" })).toBeInTheDocument();
    expect(screen.getByText("MTG-0007")).toBeInTheDocument();
    expect(screen.getByText("نريد تقريراً يومياً للمبيعات")).toBeInTheDocument();
  });

  it("hangs the comment thread off the requirement, not a ticket", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "تقرير مبيعات يومي" });

    expect(screen.getByTestId("thread")).toHaveTextContent("requirement:req-1");
  });

  it("changes status with a note and writes it through the status endpoint", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "تقرير مبيعات يومي" });

    await user.click(screen.getByLabelText(MEETING_LABELS.status));
    await user.click(
      await screen.findByRole("option", { name: REQUIREMENT_STATUS_LABELS.ACCEPTED }),
    );
    await user.type(screen.getByLabelText(MEETING_LABELS.statusNote), "موافق");
    await user.click(screen.getByRole("button", { name: MEETING_LABELS.changeStatus }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/requirements/req-1/status", {
        status: "ACCEPTED",
        note: "موافق",
      }),
    );
  });

  it("assigns an owner through triage", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "تقرير مبيعات يومي" });

    await user.click(screen.getByLabelText(MEETING_LABELS.owner));
    await user.click(await screen.findByRole("option", { name: "سارة أحمد" }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/requirements/req-1", { ownerId: "dev-1" }),
    );
  });

  it("promotes to a DRAFT ticket and navigates to it", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "تقرير مبيعات يومي" });

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.promote }));
    await user.click(await screen.findByRole("button", { name: MEETING_LABELS.promoteConfirm }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/tickets/ticket-9"));
  });

  it("disables promote while the requirement has no system", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/requirements/req-1"
        ? Promise.resolve({ data: requirement({ systemId: null, system: null }) })
        : Promise.resolve({ data: [] }),
    );
    await renderPage();
    await screen.findByRole("heading", { name: "تقرير مبيعات يومي" });

    expect(screen.getByRole("button", { name: MEETING_LABELS.promote })).toBeDisabled();
  });

  it("gives a read-only role no triage controls", async () => {
    role = "SYSTEM_OWNER";
    await renderPage();
    await screen.findByRole("heading", { name: "تقرير مبيعات يومي" });

    expect(screen.queryByLabelText(MEETING_LABELS.status)).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.promote })).toBeNull();
    // The system is still readable — it is shown as text, not as a picker.
    expect(screen.getAllByText("نظام الفواتير").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(MEETING_LABELS.system)).toBeNull();
  });
});
