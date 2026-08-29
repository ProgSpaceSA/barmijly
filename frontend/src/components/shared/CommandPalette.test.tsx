import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MEETING_LABELS } from "@/lib/constants";

const mockPush = vi.fn();
let currentRole = "PROGRAMMING_HEAD";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector?: (s: { user: { id: string; role: string } }) => unknown) => {
    const state = { user: { id: "u1", role: currentRole } };
    return selector ? selector(state) : state;
  },
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/components/testing/BugEditorDialog", () => ({
  BugEditorDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="bug-dialog">
      <button type="button" onClick={onClose}>
        close-bug
      </button>
    </div>
  ),
}));

vi.mock("@/components/meetings/MeetingEditorDialog", () => ({
  MeetingEditorDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="meeting-dialog">
      <button type="button" onClick={onClose}>
        close-meeting
      </button>
    </div>
  ),
}));

vi.mock("@/components/meetings/RequirementEditorDialog", () => ({
  RequirementEditorDialog: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="requirement-dialog">
      <button type="button" onClick={onClose}>
        close-requirement
      </button>
    </div>
  ),
}));

import { CommandPalette } from "./CommandPalette";

function openPalette() {
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
}

function renderPalette(role = "PROGRAMMING_HEAD") {
  currentRole = role;
  return render(<CommandPalette />);
}

beforeEach(() => {
  vi.clearAllMocks();
  currentRole = "PROGRAMMING_HEAD";
});

describe("CommandPalette — meetings and requirements", () => {
  it("offers meetings list plus meeting and requirement create to leadership", () => {
    renderPalette("PROGRAMMING_HEAD");
    openPalette();
    expect(screen.getByRole("button", { name: MEETING_LABELS.meetingsTitle })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: MEETING_LABELS.newMeeting })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: MEETING_LABELS.newRequirement })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.requirementsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: "التذاكر" })).toBeNull();
  });

  it("hides meeting and requirement shortcuts from a developer", () => {
    renderPalette("DEVELOPER");
    openPalette();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.meetingsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.newMeeting })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.requirementsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.newRequirement })).toBeNull();
  });

  it("hides both from TICKET_REQUESTER", () => {
    renderPalette("TICKET_REQUESTER");
    openPalette();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.meetingsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.newMeeting })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.requirementsTitle })).toBeNull();
    expect(screen.queryByRole("button", { name: MEETING_LABELS.newRequirement })).toBeNull();
  });

  it("opens the meeting editor from the create shortcut", async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();
    await user.click(screen.getByRole("button", { name: MEETING_LABELS.newMeeting }));
    expect(screen.getByTestId("meeting-dialog")).toBeInTheDocument();
  });

  it("opens the requirement editor from the create shortcut", async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();
    await user.click(screen.getByRole("button", { name: MEETING_LABELS.newRequirement }));
    expect(screen.getByTestId("requirement-dialog")).toBeInTheDocument();
  });

  it("navigates to the meetings list", async () => {
    const user = userEvent.setup();
    renderPalette();
    openPalette();
    await user.click(screen.getByRole("button", { name: MEETING_LABELS.meetingsTitle }));
    expect(mockPush).toHaveBeenCalledWith("/meetings");
  });
});
