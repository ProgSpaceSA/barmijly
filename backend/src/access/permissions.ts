import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Every guarded capability in the system, as a flat list of action names.
 *
 * This file answers only "may this *role* ever do this?". Whether the role may
 * do it to a *particular* ticket, company, or system is scope, and scope lives
 * in `AccessService`. Keeping the two apart is what makes the matrix testable
 * without a database.
 */
export const ACTIONS = [
  // ---- Tickets: reading -------------------------------------------------
  /** Sees every ticket, not just the ones scoped to them (req.md §16). */
  'ticket:read-all',
  /** May list archived tickets. */
  'ticket:read-archived',
  /** May read INTERNAL comments — programming team only (req.md §12). */
  'ticket:read-internal',

  // ---- Tickets: lifecycle ----------------------------------------------
  'ticket:create',
  /** Edit a DRAFT / AWAITING_INFO ticket. Ownership still checked per ticket. */
  'ticket:update',
  'ticket:submit',
  /** Approve / reject / request info — head of programming only (req.md §8, §21). */
  'ticket:approve',
  /** Assign to a developer and schedule (req.md §9). */
  'ticket:assign',
  'ticket:start',
  'ticket:submit-testing',
  /** Confirm the testing step: AWAITING_TESTING to AWAITING_OWNER_APPROVAL. */
  'ticket:verify-testing',
  /** Accept delivery: AWAITING_OWNER_APPROVAL to COMPLETED. */
  'ticket:accept-delivery',
  'ticket:close',
  'ticket:reopen',
  'ticket:archive',
  /** Manual status override, bypassing the normal flow. */
  'ticket:force-status',

  // ---- Comments & attachments ------------------------------------------
  'comment:create',
  /** Post an INTERNAL comment. */
  'comment:internal',
  'attachment:upload',
  'attachment:moderate',

  // ---- Tasks ------------------------------------------------------------
  'task:manage',

  // ---- People -----------------------------------------------------------
  'user:read',
  'user:manage',
  /** Change a user's role. Split from user:manage — it is privilege escalation. */
  'user:assign-role',
  'invitation:manage',
  'signup:review',

  // ---- Org structure ----------------------------------------------------
  /** Sees every company / system / department, not only the assigned ones. */
  'structure:read-all',
  'structure:manage',
  'structure:deactivate',

  // ---- Reporting --------------------------------------------------------
  /** Personal dashboard, scoped to what the user can see. */
  'report:read',
  /** Cross-team reports: developer load, per-system and per-company stats, trend. */
  'report:read-team',
  'digest:run',
] as const;

export type Action = (typeof ACTIONS)[number];

/** Roles that work every ticket regardless of company or system (req.md §16). */
export const PROGRAMMING_TEAM: UserRole[] = [
  UserRole.PROGRAMMING_HEAD,
  UserRole.PROJECT_MANAGER,
  UserRole.DEVELOPER,
  UserRole.QA,
];

/** Programming leadership — approval, assignment, closure. */
export const LEADERSHIP: UserRole[] = [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER];

/**
 * Administrators. req.md §2 describes SENIOR_MANAGEMENT as read-only, but this
 * deployment uses it as a co-admin alongside programming leadership, so it is
 * kept here deliberately.
 */
export const ADMINS: UserRole[] = [...LEADERSHIP, UserRole.SENIOR_MANAGEMENT];

/** Business-side roles: scoped to their own work, never see internal chatter. */
export const BUSINESS_ROLES: UserRole[] = [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER];

const REQUESTER_ACTIONS: Action[] = [
  'ticket:create',
  'ticket:update',
  'ticket:submit',
  'ticket:accept-delivery',
  'comment:create',
  'attachment:upload',
  'report:read',
];

const SYSTEM_OWNER_ACTIONS: Action[] = [
  'ticket:create',
  'ticket:update',
  'ticket:submit',
  'ticket:accept-delivery',
  'comment:create',
  'attachment:upload',
  'report:read',
];

const DEVELOPER_ACTIONS: Action[] = [
  // No ticket:read-all — a developer is scoped to assigned work, their own
  // tasks, mentions, and the systems/companies they belong to (req.md §16).
  'ticket:read-internal',
  'ticket:create',
  'ticket:update',
  'ticket:submit',
  'ticket:start',
  'ticket:submit-testing',
  'comment:create',
  'comment:internal',
  'attachment:upload',
  'structure:read-all',
  'report:read',
];

const QA_ACTIONS: Action[] = [
  'ticket:read-all',
  'ticket:read-internal',
  'ticket:create',
  'ticket:update',
  'ticket:submit',
  'ticket:verify-testing',
  'comment:create',
  'comment:internal',
  'attachment:upload',
  'structure:read-all',
  'report:read',
];

const PROJECT_MANAGER_ACTIONS: Action[] = [
  'ticket:read-all',
  'ticket:read-archived',
  'ticket:read-internal',
  'ticket:create',
  'ticket:update',
  'ticket:submit',
  'ticket:assign',
  'ticket:verify-testing',
  'ticket:accept-delivery',
  'ticket:close',
  'ticket:reopen',
  'ticket:archive',
  'ticket:force-status',
  'comment:create',
  'comment:internal',
  'attachment:upload',
  'attachment:moderate',
  'task:manage',
  // No user:read / user:manage / invitation:manage / signup:review /
  // structure:manage — req.md §2 scopes the project manager to "ترتيب
  // الأولويات، الإسناد، المتابعة". Administering accounts and the org chart
  // belongs to the head of programming and senior management.
  'structure:read-all',
  'report:read',
  'report:read-team',
];

const PROGRAMMING_HEAD_ACTIONS: Action[] = [
  ...PROJECT_MANAGER_ACTIONS,
  // Only the head approves — req.md §8 and §21: nothing enters development
  // without the head of programming.
  'ticket:approve',
  // The admin area the project manager does not get.
  'user:read',
  'user:manage',
  // Role changes are privilege escalation, so they stop at the head.
  'user:assign-role',
  'invitation:manage',
  'signup:review',
  'structure:manage',
  'structure:deactivate',
  'digest:run',
];

const SENIOR_MANAGEMENT_ACTIONS: Action[] = [
  'ticket:read-all',
  'ticket:read-archived',
  'ticket:read-internal',
  'ticket:create',
  'ticket:update',
  'ticket:submit',
  'ticket:archive',
  'ticket:force-status',
  'comment:create',
  'comment:internal',
  'attachment:upload',
  'task:manage',
  'user:read',
  'user:manage',
  'invitation:manage',
  'signup:review',
  'structure:read-all',
  'structure:manage',
  'structure:deactivate',
  'report:read',
  'report:read-team',
];

/** The permission matrix. Single source of truth for every role gate. */
export const ROLE_ACTIONS: Record<UserRole, readonly Action[]> = {
  [UserRole.TICKET_REQUESTER]: REQUESTER_ACTIONS,
  [UserRole.SYSTEM_OWNER]: SYSTEM_OWNER_ACTIONS,
  [UserRole.DEVELOPER]: DEVELOPER_ACTIONS,
  [UserRole.QA]: QA_ACTIONS,
  [UserRole.PROJECT_MANAGER]: PROJECT_MANAGER_ACTIONS,
  [UserRole.PROGRAMMING_HEAD]: PROGRAMMING_HEAD_ACTIONS,
  [UserRole.SENIOR_MANAGEMENT]: SENIOR_MANAGEMENT_ACTIONS,
};

const ROLE_ACTION_SETS = Object.fromEntries(
  Object.entries(ROLE_ACTIONS).map(([role, actions]) => [role, new Set(actions)]),
) as unknown as Record<UserRole, ReadonlySet<Action>>;

export interface Actor {
  id: string;
  role: UserRole;
}

export function can(role: UserRole | undefined, action: Action): boolean {
  if (!role) return false;
  return ROLE_ACTION_SETS[role]?.has(action) ?? false;
}

/** Throws 403 unless the role holds the action. */
export function assertCan(user: Actor | undefined, action: Action): void {
  if (!can(user?.role, action)) {
    throw new ForbiddenException(`Role ${user?.role ?? 'anonymous'} cannot perform "${action}"`);
  }
}

/** Roles allowed to perform an action — handy for Prisma `role: { in: [...] }`. */
export function rolesWith(action: Action): UserRole[] {
  return (Object.keys(ROLE_ACTIONS) as UserRole[]).filter((role) => can(role, action));
}
