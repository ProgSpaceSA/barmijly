import { describe, it, expect } from "vitest";
import {
  TICKET_ACTION_INBOX_LABEL,
} from "@/lib/constants";
import {
  TICKET_ACTION_INBOX_KEY,
  canFilterCreatedByMe,
  statusKeyToQuery,
  statusesParamToKey,
  ticketActionInboxStatuses,
  ticketListDefaultView,
  ticketListQuery,
  ticketStatusShortcuts,
} from "./ticket-list-filters";
import type { UserRole } from "@/store/auth";

const ALL_ROLES: UserRole[] = [
  "TICKET_REQUESTER",
  "SYSTEM_OWNER",
  "DEVELOPER",
  "QA",
  "PROJECT_MANAGER",
  "PROGRAMMING_HEAD",
  "SENIOR_MANAGEMENT",
];

describe("ticket list role defaults", () => {
  it("opens a developer on تذاكري", () => {
    expect(ticketListDefaultView("DEVELOPER")).toMatchObject({ mineOnly: true, activeStatus: "" });
    expect(ticketListQuery(ticketListDefaultView("DEVELOPER"), "DEVELOPER", "dev-1")).toEqual({
      mine: "true",
    });
  });

  it("opens the programming head on the approval queue", () => {
    const view = ticketListDefaultView("PROGRAMMING_HEAD");
    expect(view.activeStatus).toBe("QUEUE:NEW,AWAITING_APPROVAL");
    expect(ticketListQuery(view, "PROGRAMMING_HEAD")).toEqual({
      statuses: "NEW,AWAITING_APPROVAL",
    });
  });

  it("opens the project manager on tickets waiting to be assigned", () => {
    expect(ticketListQuery(ticketListDefaultView("PROJECT_MANAGER"), "PROJECT_MANAGER")).toEqual({
      status: "APPROVED",
    });
  });

  it("opens QA on the testing queue", () => {
    expect(ticketListQuery(ticketListDefaultView("QA"), "QA")).toEqual({
      status: "AWAITING_TESTING",
    });
  });

  it("opens a system owner on delivery sign-off", () => {
    expect(ticketListQuery(ticketListDefaultView("SYSTEM_OWNER"), "SYSTEM_OWNER")).toEqual({
      status: "AWAITING_OWNER_APPROVAL",
    });
  });

  it("opens a requester on tickets waiting for their reply", () => {
    expect(ticketListQuery(ticketListDefaultView("TICKET_REQUESTER"), "TICKET_REQUESTER")).toEqual({
      status: "AWAITING_INFO",
    });
  });

  it("opens senior management on the full board", () => {
    expect(ticketListQuery(ticketListDefaultView("SENIOR_MANAGEMENT"), "SENIOR_MANAGEMENT")).toEqual({});
  });
});

describe("ticket status shortcuts", () => {
  it("adds تحتاج إجراء when the role has more than one action status", () => {
    const shortcuts = ticketStatusShortcuts("PROGRAMMING_HEAD");
    expect(shortcuts[0]).toEqual({
      key: TICKET_ACTION_INBOX_KEY,
      label: TICKET_ACTION_INBOX_LABEL,
      statuses: ticketActionInboxStatuses("PROGRAMMING_HEAD"),
    });
    expect(shortcuts.some((s) => s.label === "بانتظار اعتمادك" && s.statuses.join(",") === "NEW,AWAITING_APPROVAL")).toBe(true);
  });

  it("does not add a combined inbox for a single-status role", () => {
    expect(ticketStatusShortcuts("QA")).toEqual([]);
    expect(ticketStatusShortcuts("SYSTEM_OWNER")).toEqual([]);
    expect(ticketStatusShortcuts("SENIOR_MANAGEMENT")).toEqual([]);
  });

  it("maps the inbox key to a statuses query", () => {
    expect(statusKeyToQuery(TICKET_ACTION_INBOX_KEY, "PROJECT_MANAGER")).toEqual({
      statuses: ticketActionInboxStatuses("PROJECT_MANAGER").join(","),
    });
  });

  it("round-trips a statuses param to the matching pill", () => {
    expect(statusesParamToKey("NEW,AWAITING_APPROVAL", "PROGRAMMING_HEAD")).toBe("QUEUE:NEW,AWAITING_APPROVAL");
    expect(statusesParamToKey(ticketActionInboxStatuses("PROGRAMMING_HEAD").join(","), "PROGRAMMING_HEAD")).toBe(
      TICKET_ACTION_INBOX_KEY,
    );
  });
});

describe("created-by-me filter", () => {
  it.each(ALL_ROLES)("%s may use أنشأتها only when they can see other people's tickets", (role) => {
    expect(canFilterCreatedByMe(role)).toBe(role !== "TICKET_REQUESTER");
  });
});
