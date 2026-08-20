import type { UserRole } from "@/store/auth";

/**
 * Mirror of `backend/src/access/permissions.ts`.
 *
 * This decides what the UI *offers*; the backend decides what actually happens.
 * Keep the two in step — a button the API refuses is a bug report, and a button
 * that is missing where the API allows it is a feature nobody can reach.
 */
export type Action =
  | "ticket:read-all"
  | "ticket:read-archived"
  | "ticket:read-internal"
  | "ticket:create"
  | "ticket:update"
  | "ticket:submit"
  | "ticket:approve"
  | "ticket:assign"
  | "ticket:start"
  | "ticket:submit-testing"
  | "ticket:verify-testing"
  | "ticket:accept-delivery"
  | "ticket:close"
  | "ticket:reopen"
  | "ticket:archive"
  | "ticket:force-status"
  | "comment:create"
  | "comment:internal"
  | "comment:moderate"
  | "attachment:upload"
  | "attachment:moderate"
  | "task:manage"
  | "user:read"
  | "user:manage"
  | "user:assign-role"
  | "invitation:manage"
  | "signup:review"
  | "structure:read-all"
  | "structure:manage"
  | "structure:deactivate"
  | "report:read"
  | "report:read-team"
  | "digest:run";

const REQUESTER: Action[] = [
  "ticket:create",
  "ticket:update",
  "ticket:submit",
  "ticket:accept-delivery",
  "comment:create",
  "attachment:upload",
  "report:read",
];

const SYSTEM_OWNER: Action[] = [...REQUESTER];

const DEVELOPER: Action[] = [
  "ticket:read-internal",
  "ticket:create",
  "ticket:update",
  "ticket:submit",
  "ticket:start",
  "ticket:submit-testing",
  "comment:create",
  "comment:internal",
  "attachment:upload",
  "structure:read-all",
  "report:read",
];

const QA: Action[] = [
  "ticket:read-all",
  "ticket:read-internal",
  "ticket:create",
  "ticket:update",
  "ticket:submit",
  "ticket:verify-testing",
  "comment:create",
  "comment:internal",
  "attachment:upload",
  "structure:read-all",
  "report:read",
];

const PROJECT_MANAGER: Action[] = [
  "ticket:read-all",
  "ticket:read-archived",
  "ticket:read-internal",
  "ticket:create",
  "ticket:update",
  "ticket:submit",
  "ticket:assign",
  "ticket:verify-testing",
  "ticket:accept-delivery",
  "ticket:close",
  "ticket:reopen",
  "ticket:archive",
  "ticket:force-status",
  "comment:create",
  "comment:internal",
  "comment:moderate",
  "attachment:upload",
  "attachment:moderate",
  "task:manage",
  // No user:read / user:manage / invitation:manage / signup:review /
  // structure:manage — req.md §2 scopes the project manager to prioritising,
  // assigning and following up. The admin area is head-of-programming and
  // senior-management territory.
  "structure:read-all",
  "report:read",
  "report:read-team",
];

const PROGRAMMING_HEAD: Action[] = [
  ...PROJECT_MANAGER,
  "ticket:approve",
  "user:read",
  "user:manage",
  "user:assign-role",
  "invitation:manage",
  "signup:review",
  "structure:manage",
  "structure:deactivate",
  "digest:run",
];

const SENIOR_MANAGEMENT: Action[] = [
  "ticket:read-all",
  "ticket:read-archived",
  "ticket:read-internal",
  "ticket:create",
  "ticket:update",
  "ticket:submit",
  "ticket:archive",
  "ticket:force-status",
  "comment:create",
  "comment:internal",
  "attachment:upload",
  "task:manage",
  "user:read",
  "user:manage",
  "invitation:manage",
  "signup:review",
  "structure:read-all",
  "structure:manage",
  "structure:deactivate",
  "report:read",
  "report:read-team",
];

export const ROLE_ACTIONS: Record<UserRole, Action[]> = {
  TICKET_REQUESTER: REQUESTER,
  SYSTEM_OWNER,
  DEVELOPER,
  QA,
  PROJECT_MANAGER,
  PROGRAMMING_HEAD,
  SENIOR_MANAGEMENT,
};

const SETS: Record<string, Set<Action>> = Object.fromEntries(
  Object.entries(ROLE_ACTIONS).map(([role, actions]) => [role, new Set(actions)]),
);

export function can(role: UserRole | null | undefined, action: Action): boolean {
  if (!role) return false;
  return SETS[role]?.has(action) ?? false;
}

/**
 * Ticket-status chips on the list page. `null` means the full workflow —
 * programming leadership and senior management run the whole board.
 * Everyone else gets the statuses they actually act on, plus الكل / متأخرة
 * which the page always appends.
 */
export const ROLE_TICKET_STATUS_FILTERS: Record<UserRole, readonly string[] | null> = {
  PROGRAMMING_HEAD: null,
  PROJECT_MANAGER: null,
  SENIOR_MANAGEMENT: null,
  TICKET_REQUESTER: ["DRAFT", "AWAITING_INFO", "REJECTED", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
  SYSTEM_OWNER: ["DRAFT", "AWAITING_INFO", "IN_PROGRESS", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
  DEVELOPER: ["APPROVED", "SCHEDULED", "IN_PROGRESS", "AWAITING_TESTING", "ON_HOLD"],
  QA: ["IN_PROGRESS", "AWAITING_TESTING", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
};

/** `null` = every status. Empty = no status chips (signed out / unknown). */
export function ticketStatusFilterKeys(role: UserRole | null | undefined): readonly string[] | null {
  if (!role) return [];
  const keys = ROLE_TICKET_STATUS_FILTERS[role];
  return keys === undefined ? [] : keys;
}

/** Roles allowed to perform an action — for route guards that take a role list. */
export function rolesWith(action: Action): UserRole[] {
  return (Object.keys(ROLE_ACTIONS) as UserRole[]).filter((role) => can(role, action));
}
