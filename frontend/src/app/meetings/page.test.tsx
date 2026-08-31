import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MEETING_LABELS, MEETING_STATUS_LABELS } from "@/lib/constants";

const mockGet = vi.fn();
const mockPush = vi.fn();
let role = "PROGRAMMING_HEAD";

vi.mock("@/lib/api", () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn(),
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

import MeetingsPage from "./page";

const meeting = (over: Record<string, unknown> = {}) => ({
  id: "meeting-1",
  meetingNumber: 7,
  title: "اجتماع الربع الثالث",
  type: "CEO_REVIEW",
  status: "HELD",
  heldAt: new Date("2026-08-20T09:00:00.000Z").toISOString(),
  location: "المقر الرئيسي",
  organizer: { id: "head-1", firstName: "أحمد", lastName: "علي" },
  company: { id: "company-1", name: "الشركة القابضة" },
  systems: [{ system: { id: "system-1", name: "نظام الفواتير" } }],
  _count: { points: 4, attendees: 3 },
  ...over,
});

const listPayload = (rows: unknown[], over: Record<string, unknown> = {}) => ({
  data: rows,
  total: rows.length,
  page: 1,
  limit: 20,
  totalPages: 1,
  ...over,
});

const lastMeetingParams = () => {
  const calls = mockGet.mock.calls.filter(([url]) => url === "/meetings");
  return calls.at(-1)?.[1]?.params ?? {};
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MeetingsPage />
    </QueryClientProvider>,
  );
}

describe("MeetingsPage", () => {
  beforeEach(() => {
    role = "PROGRAMMING_HEAD";
    mockGet.mockImplementation((url: string) => {
      if (url === "/meetings") return Promise.resolve({ data: listPayload([meeting()]) });
      if (url === "/companies") {
        return Promise.resolve({ data: [{ id: "company-1", name: "الشركة القابضة" }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  it("lists meetings with their code, type and status", async () => {
    renderPage();

    expect(await screen.findByText("اجتماع الربع الثالث")).toBeInTheDocument();
    expect(screen.getByText("MTG-0007")).toBeInTheDocument();
    expect(screen.getAllByText(MEETING_STATUS_LABELS.HELD).length).toBeGreaterThan(0);
  });

  it("opens a meeting when its title is clicked", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("اجتماع الربع الثالث"));
    expect(mockPush).toHaveBeenCalledWith("/meetings/meeting-1");
  });

  it("sends the search term to the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    await user.type(screen.getByLabelText(MEETING_LABELS.searchMeetings), "الربع");

    await waitFor(() => expect(lastMeetingParams().search).toBe("الربع"));
    const searches = mockGet.mock.calls
      .filter(([url]) => url === "/meetings")
      .map(([, opts]) => (opts as { params?: { search?: string } } | undefined)?.params?.search)
      .filter((term): term is string => Boolean(term));
    expect(searches).toEqual(["الربع"]);
  });

  it("labels the custom date range as from/to around the first field", async () => {
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    expect(screen.getByLabelText(MEETING_LABELS.dateFrom)).toHaveAttribute(
      "id",
      "meeting-date-from",
    );
    expect(screen.getByLabelText(MEETING_LABELS.dateTo)).toHaveAttribute("id", "meeting-date-to");
  });

  /**
   * Five Arabic presets are wider than a 360px phone. They scroll as one strip
   * rather than clip, and the custom range drops to a label/field grid.
   */
  it("keeps the date filters reachable on a phone", async () => {
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    const tabs = screen.getByRole("group", { name: MEETING_LABELS.filterDate });
    expect(tabs.className).toContain("brm-seg-rail");

    const range = screen.getByLabelText(MEETING_LABELS.dateFrom).parentElement as HTMLElement;
    expect(range.className).toContain("grid-cols-[auto_minmax(0,1fr)]");
    expect(range.className).toContain("sm:flex");
  });

  it("sends a date preset to the API", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.dateToday }));

    await waitFor(() => {
      expect(lastMeetingParams().heldFrom).toBeTruthy();
      expect(lastMeetingParams().heldTo).toBeTruthy();
    });
  });

  it("sends this month and this year through the end of the period", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.dateMonth }));
    await waitFor(() => {
      const to = new Date(lastMeetingParams().heldTo);
      expect(to.getDate()).toBe(new Date(to.getFullYear(), to.getMonth() + 1, 0).getDate());
    });

    await user.click(screen.getByRole("button", { name: MEETING_LABELS.dateYear }));
    await waitFor(() => {
      const to = new Date(lastMeetingParams().heldTo);
      expect(to.getMonth()).toBe(11);
      expect(to.getDate()).toBe(31);
    });
  });

  it("shows an empty state with no meetings", async () => {
    mockGet.mockImplementation((url: string) =>
      url === "/meetings"
        ? Promise.resolve({ data: listPayload([]) })
        : Promise.resolve({ data: [] }),
    );
    renderPage();

    expect(await screen.findByText(MEETING_LABELS.noMeetingsHint)).toBeInTheDocument();
  });

  it("offers «اجتماع جديد» to leadership", async () => {
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    expect(
      screen.getAllByRole("button", { name: new RegExp(MEETING_LABELS.newMeeting) }).length,
    ).toBeGreaterThan(0);
  });

  it("hides «اجتماع جديد» from a role that cannot manage meetings", async () => {
    role = "DEVELOPER";
    renderPage();
    await screen.findByText("اجتماع الربع الثالث");

    expect(
      screen.queryByRole("button", { name: new RegExp(MEETING_LABELS.newMeeting) }),
    ).toBeNull();
  });
});
