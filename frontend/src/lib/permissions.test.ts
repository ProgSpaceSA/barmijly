import { describe, it, expect } from "vitest";
import type { UserRole } from "@/store/auth";
import { ROLE_ACTIONS, can, rolesWith, ticketStatusFilterKeys, type Action } from "./permissions";

/**
 * The same table as `backend/src/access/permissions.spec.ts`.
 *
 * The UI copy of the matrix has to agree with the API copy or the app shows
 * buttons that 403. Written out longhand rather than derived, so drift in either
 * direction shows up as a failure here.
 */
const EXPECTED: Record<Action, UserRole[]> = {
  "ticket:read-all": ["QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:read-archived": ["PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:read-internal": ["DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:create": ["TICKET_REQUESTER", "SYSTEM_OWNER", "DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:update": ["TICKET_REQUESTER", "SYSTEM_OWNER", "DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:submit": ["TICKET_REQUESTER", "SYSTEM_OWNER", "DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:approve": ["PROGRAMMING_HEAD"],
  "ticket:assign": ["PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "ticket:start": ["DEVELOPER"],
  "ticket:submit-testing": ["DEVELOPER"],
  "ticket:verify-testing": ["QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "ticket:accept-delivery": ["TICKET_REQUESTER", "SYSTEM_OWNER", "PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "ticket:close": ["PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "ticket:reopen": ["PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "ticket:archive": ["PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "ticket:force-status": ["PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "comment:create": ["TICKET_REQUESTER", "SYSTEM_OWNER", "DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "comment:internal": ["DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "comment:moderate": ["PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "attachment:upload": ["TICKET_REQUESTER", "SYSTEM_OWNER", "DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "attachment:moderate": ["PROJECT_MANAGER", "PROGRAMMING_HEAD"],
  "task:manage": ["PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "user:read": ["PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "user:manage": ["PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "user:assign-role": ["PROGRAMMING_HEAD"],
  "invitation:manage": ["PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "signup:review": ["PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "structure:read-all": ["DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "structure:manage": ["PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "structure:deactivate": ["PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "report:read": ["TICKET_REQUESTER", "SYSTEM_OWNER", "DEVELOPER", "QA", "PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "report:read-team": ["PROJECT_MANAGER", "PROGRAMMING_HEAD", "SENIOR_MANAGEMENT"],
  "digest:run": ["PROGRAMMING_HEAD"],
};

const ALL_ROLES = Object.keys(ROLE_ACTIONS) as UserRole[];
const ACTIONS = Object.keys(EXPECTED) as Action[];

describe("permission matrix (UI mirror of the API)", () => {
  it("covers all seven roles", () => {
    expect(ALL_ROLES).toHaveLength(7);
  });

  it.each(ACTIONS)("%s allows exactly the expected roles", (action) => {
    for (const role of ALL_ROLES) {
      expect({ role, allowed: can(role, action) }).toEqual({
        role,
        allowed: EXPECTED[action].includes(role),
      });
    }
  });

  it("matches rolesWith() to the table", () => {
    for (const action of ACTIONS) {
      expect([...rolesWith(action)].sort()).toEqual([...EXPECTED[action]].sort());
    }
  });

  it("denies everything to a signed-out user", () => {
    for (const action of ACTIONS) {
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });
});

const EXPECTED_STATUS_FILTERS: Record<UserRole, string[] | null> = {
  PROGRAMMING_HEAD: null,
  PROJECT_MANAGER: null,
  SENIOR_MANAGEMENT: null,
  TICKET_REQUESTER: ["DRAFT", "AWAITING_INFO", "REJECTED", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
  SYSTEM_OWNER: ["DRAFT", "AWAITING_INFO", "IN_PROGRESS", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
  DEVELOPER: ["APPROVED", "SCHEDULED", "IN_PROGRESS", "AWAITING_TESTING", "ON_HOLD"],
  QA: ["IN_PROGRESS", "AWAITING_TESTING", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
};

describe("ticket status filter chips by role", () => {
  it.each(ALL_ROLES)("%s offers the statuses that role needs", (role) => {
    expect(ticketStatusFilterKeys(role)).toEqual(EXPECTED_STATUS_FILTERS[role]);
  });

  it("offers no status chips when signed out", () => {
    expect(ticketStatusFilterKeys(null)).toEqual([]);
    expect(ticketStatusFilterKeys(undefined)).toEqual([]);
  });
});
