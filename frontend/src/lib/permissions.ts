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
  | "ticket:update-estimate"
  | "ticket:start"
  | "ticket:submit-testing"
  | "ticket:verify-testing"
  | "ticket:accept-delivery"
  | "ticket:close"
  | "ticket:reopen"
  | "ticket:archive"
  | "ticket:block"
  | "ticket:hold"
  | "ticket:resume"
  | "ticket:force-status"
  | "comment:create"
  | "comment:internal"
  | "attachment:upload"
  | "attachment:moderate"
  | "task:manage"
  | "task:create-own"
  | "user:read"
  | "user:read-directory"
  | "user:manage"
  | "user:manage-membership"
  | "user:assign-role"
  | "invitation:manage"
  | "signup:review"
  | "structure:read-all"
  | "structure:manage"
  | "structure:manage-roster"
  | "structure:create-system"
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
  "ticket:update-estimate",
  "ticket:start",
  "ticket:submit-testing",
  "ticket:block",
  "ticket:resume",
  "comment:create",
  "comment:internal",
  "attachment:upload",
  "task:create-own",
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
  "ticket:block",
  "comment:create",
  "comment:internal",
  "attachment:upload",
  "task:create-own",
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
  "ticket:block",
  "ticket:hold",
  "ticket:resume",
  "ticket:force-status",
  "comment:create",
  "comment:internal",
  "attachment:upload",
  "attachment:moderate",
  "task:manage",
  "user:read-directory",
  "user:manage-membership",
  "structure:read-all",
  "structure:manage-roster",
  "structure:create-system",
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
  "structure:manage-roster",
  "structure:create-system",
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
  "ticket:block",
  "ticket:hold",
  "ticket:resume",
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
  "structure:manage-roster",
  "structure:create-system",
  "structure:deactivate",
  "report:read",
  "report:read-team",
];

export function canManageStructure(role: UserRole | null | undefined): boolean {
  return can(role, "structure:manage");
}

export function canManageRoster(role: UserRole | null | undefined): boolean {
  return canManageStructure(role) || can(role, "structure:manage-roster");
}

export function canAny(role: UserRole | null | undefined, actions: Action[]): boolean {
  return actions.some((a) => can(role, a));
}

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
  DEVELOPER: ["APPROVED", "SCHEDULED", "IN_PROGRESS", "AWAITING_TESTING", "BLOCKED", "ON_HOLD"],
  QA: ["IN_PROGRESS", "AWAITING_TESTING", "BLOCKED", "AWAITING_OWNER_APPROVAL", "COMPLETED"],
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

/**
 * Whether the user may stop an in-flight ticket.
 *
 * Leadership may always pause. QA may raise a blocker without being on the roster.
 * Developers who can resume a blocker must lead the ticket to raise one — a
 * contributor who cannot clear a stop should not create one.
 */
export function canBlockTicket(role: UserRole | null | undefined, isTicketLead: boolean): boolean {
  if (!can(role, "ticket:block")) return false;
  if (can(role, "ticket:hold")) return true;
  if (!can(role, "ticket:resume")) return true;
  return isTicketLead;
}

/**
 * Whether the user may restart a stopped ticket — mirrors the backend resume gate.
 */
export function canResumeTicket(
  role: UserRole | null | undefined,
  status: string,
  isTicketLead: boolean,
): boolean {
  if (!can(role, "ticket:resume")) return false;
  if (can(role, "ticket:hold")) return true;
  if (status === "ON_HOLD") return false;
  if (status === "BLOCKED") return isTicketLead;
  return false;
}
