import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ACTIONS, Action, ROLE_ACTIONS, assertCan, can, rolesWith } from './permissions';

/**
 * The role × action matrix, written out longhand.
 *
 * This is deliberately a duplicate of `ROLE_ACTIONS` rather than a loop over it:
 * a test that derives its expectations from the code under test would pass no
 * matter what the code said. Widening a role now takes two edits, one of which
 * is this table, which is the point.
 */
const EXPECTED: Record<Action, UserRole[]> = {
  // ---- reading ----------------------------------------------------------
  'ticket:read-all': [UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:read-archived': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:read-internal': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],

  // ---- lifecycle --------------------------------------------------------
  'ticket:create': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:update': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:submit': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:approve': [UserRole.PROGRAMMING_HEAD],
  'ticket:assign': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'ticket:update-estimate': [UserRole.DEVELOPER],
  'ticket:start': [UserRole.DEVELOPER],
  'ticket:submit-testing': [UserRole.DEVELOPER],
  'ticket:verify-testing': [UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'ticket:accept-delivery': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'ticket:close': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'ticket:reopen': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'ticket:archive': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:block': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:hold': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:resume': [UserRole.DEVELOPER, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'ticket:force-status': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],

  // ---- comments & attachments -------------------------------------------
  'comment:create': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'comment:internal': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'attachment:upload': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'attachment:moderate': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],

  // ---- tasks ------------------------------------------------------------
  'task:manage': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'task:create-own': [UserRole.DEVELOPER, UserRole.QA],

  // ---- testing & bugs ---------------------------------------------------
  'test:read': [UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'test:author': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'test:execute': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'bug:create': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'bug:assign': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'bug:promote': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],

  // ---- people -----------------------------------------------------------
  'user:read': [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'user:read-directory': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'user:manage': [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'user:manage-membership': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD],
  'user:assign-role': [UserRole.PROGRAMMING_HEAD],
  'invitation:manage': [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'signup:review': [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],

  // ---- structure --------------------------------------------------------
  'structure:read-all': [UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'structure:manage': [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'structure:manage-roster': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'structure:create-system': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'structure:deactivate': [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],

  // ---- reporting --------------------------------------------------------
  'report:read': [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'report:read-team': [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT],
  'digest:run': [UserRole.PROGRAMMING_HEAD],
};

const ALL_ROLES = Object.values(UserRole);

describe('permission matrix', () => {
  it('covers every declared action', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  it('gives every role an entry', () => {
    expect(Object.keys(ROLE_ACTIONS).sort()).toEqual([...ALL_ROLES].sort());
  });

  describe.each(ACTIONS)('%s', (action) => {
    const allowed = EXPECTED[action];

    it.each(ALL_ROLES)('%s', (role) => {
      expect(can(role, action)).toBe(allowed.includes(role));
    });
  });

  it('matches rolesWith() to the table', () => {
    for (const action of ACTIONS) {
      expect(rolesWith(action).sort()).toEqual([...EXPECTED[action]].sort());
    }
  });
});

describe('req.md non-negotiables', () => {
  it('§8/§21 — only the head of programming approves a ticket', () => {
    expect(rolesWith('ticket:approve')).toEqual([UserRole.PROGRAMMING_HEAD]);
  });

  it('§12 — internal comments never reach the business-side roles', () => {
    expect(can(UserRole.TICKET_REQUESTER, 'ticket:read-internal')).toBe(false);
    expect(can(UserRole.SYSTEM_OWNER, 'ticket:read-internal')).toBe(false);
    expect(can(UserRole.TICKET_REQUESTER, 'comment:internal')).toBe(false);
    expect(can(UserRole.SYSTEM_OWNER, 'comment:internal')).toBe(false);
  });

  it('§16 — requester, owner and developer never read every ticket', () => {
    expect(can(UserRole.TICKET_REQUESTER, 'ticket:read-all')).toBe(false);
    expect(can(UserRole.SYSTEM_OWNER, 'ticket:read-all')).toBe(false);
    expect(can(UserRole.DEVELOPER, 'ticket:read-all')).toBe(false);
  });

  it('a developer can neither test nor accept their own delivery', () => {
    expect(can(UserRole.DEVELOPER, 'ticket:verify-testing')).toBe(false);
    expect(can(UserRole.DEVELOPER, 'ticket:accept-delivery')).toBe(false);
  });

  it('role changes are limited to the head of programming', () => {
    expect(rolesWith('user:assign-role')).toEqual([UserRole.PROGRAMMING_HEAD]);
  });
});

describe('assertCan', () => {
  it('passes when the role holds the action', () => {
    expect(() =>
      assertCan({ id: 'u1', role: UserRole.PROGRAMMING_HEAD }, 'ticket:approve'),
    ).not.toThrow();
  });

  it('throws 403 when it does not', () => {
    expect(() =>
      assertCan({ id: 'u1', role: UserRole.PROJECT_MANAGER }, 'ticket:approve'),
    ).toThrow(ForbiddenException);
  });

  it('throws for a missing actor', () => {
    expect(() => assertCan(undefined, 'ticket:create')).toThrow(ForbiddenException);
  });

  it('rejects an unknown role rather than defaulting open', () => {
    expect(can('ROOT' as UserRole, 'ticket:approve')).toBe(false);
  });
});
