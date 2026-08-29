import { Suspense } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MEETING_LABELS, POINT_KIND_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();
const mockPush = vi.fn();
let role = "PROGRAMMING_HEAD";

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
    put: vi.fn(),
    delete: (...args: unknown[]) => mockDelete(...args),
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

import MeetingDetailPage from "./page";

const meeting = (over: Record<string, unknown> = {}) => ({
  id: "meeting-1",
  meetingNumber: 7,
  title: "اجتماع الربع الثالث",
  description: "استعراض الأداء",
  type: "CEO_REVIEW",
  status: "SCHEDULED",
  heldAt: null,
  durationMins: 60,
  location: "المقر الرئيسي",
  companyId: "company-1",
  isArchived: false,
  organizer: { id: "head-1", firstName: "أحمد", lastName: "علي" },
  company: { id: "company-1", name: "الشركة القابضة" },
  systems: [{ system: { id: "system-1", name: "نظام الفواتير" } }],
  attendees: [
    {
      id: "att-1",
      userId: "head-1",
      user: { id: "head-1", firstName: "أحمد", lastName: "علي", role: "PROGRAMMING_HEAD" },
    },
    { id: "att-2", userId: null, name: "م. خالد", jobTitle: "الرئيس التنفيذي" },
  ],
  points: [
    {
      id: "point-1",
      order: 0,
      kind: "REQUEST",
      body: "نريد تقريراً يومياً للمبيعات",
      raisedByName: "م. خالد",
      requirements: [],
    },
    {
      id: "point-2",
      order: 1,
      kind: "NOTE",
      body: "استعرض الفريق الأداء",
      requirements: [{ id: "req-1", requirementNumber: 4, title: "تقرير", status: "NEW" }],
    },
  ],
  attachments: [],
  ...over,
});

/** `use(params)` suspends, so the promise is pre-resolved and wrapped. */
const params = Object.assign(Promise.resolve({ id: "meeting-1" }), {
  status: "fulfilled",
  value: { id: "meeting-1" },
}) as Promise<{ id: string }>;

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <Suspense fallback={null}>
        <MeetingDetailPage params={params} />
      </Suspense>
    </QueryClientProvider>,
  );
  await act(async () => {});
  return result;
}

describe("MeetingDetailPage", () => {
  beforeEach(() => {
    role = "PROGRAMMING_HEAD";
    mockGet.mockImplementation((url: string) => {
      if (url === "/meetings/meeting-1") return Promise.resolve({ data: meeting() });
      return Promise.resolve({ data: [] });
    });
    mockPost.mockResolvedValue({ data: { id: "meeting-1" } });
    mockPatch.mockResolvedValue({ data: { id: "meeting-1" } });
    mockDelete.mockResolvedValue({ data: {} });
  });

  it("renders the header, attendees, systems and numbered minutes", async () => {
    await renderPage();

    expect(await screen.findByRole("heading", { name: "اجتماع الربع الثالث" })).toBeInTheDocument();
    expect(screen.getByText("MTG-0007")).toBeInTheDocument();
    expect(screen.getByText("م. خالد")).toBeInTheDocument();
    expect(screen.getByText("نظام الفواتير")).toBeInTheDocument();
    expect(
      screen.getByLabelText(`${MEETING_LABELS.pointLine} 1`),
    ).toHaveValue("نريد تقريراً يومياً للمبيعات");
  });

  it("shows the requirement chip on a line that was already captured", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    expect(screen.getByText("REQ-0004")).toBeInTheDocument();
  });

  it("appends an empty minutes line for the taker to fill in", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.addPoint }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith("/meetings/meeting-1/points", {}),
    );
  });

  it("asks before deleting a line, then deletes it", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    await user.click(screen.getByLabelText(`${MEETING_LABELS.deletePoint} 1`));
    expect(await screen.findByText(MEETING_LABELS.deletePointConfirm)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.confirm }));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/meetings/meeting-1/points/point-1"),
    );
  });

  it("captures a line into a requirement", async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    await user.click(screen.getByLabelText(`${MEETING_LABELS.capture} 1`));
    expect(await screen.findByText(MEETING_LABELS.captureTitle)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.captureConfirm }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/meetings/meeting-1/points/point-1/capture",
        expect.objectContaining({ title: "نريد تقريراً يومياً للمبيعات" }),
      ),
    );
  });

  it("offers hold and cancel on a scheduled meeting", async () => {
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    expect(screen.getByRole("button", { name: MEETING_LABELS.markHeld })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: MEETING_LABELS.cancelMeeting }),
    ).toBeInTheDocument();
  });

  it("locks the minutes once the meeting is cancelled", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/meetings/meeting-1"
        ? Promise.resolve({ data: meeting({ status: "CANCELLED" }) })
        : Promise.resolve({ data: [] }),
    );
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    expect(screen.queryByRole("button", { name: MEETING_LABELS.addPoint })).toBeNull();
    expect(screen.getByText("نريد تقريراً يومياً للمبيعات")).toBeInTheDocument();
    expect(screen.getAllByText(POINT_KIND_LABELS.REQUEST).length).toBeGreaterThan(0);
  });

  it("hides every write control from a role that only reads requirements", async () => {
    role = "DEVELOPER";
    await renderPage();
    await screen.findByRole("heading", { name: "اجتماع الربع الثالث" });

    expect(screen.queryByRole("button", { name: MEETING_LABELS.addPoint })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.markHeld })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.addAttendee })).toBeNull();
  });
});
