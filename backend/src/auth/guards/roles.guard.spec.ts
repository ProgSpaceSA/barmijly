import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function contextFor(user: any): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  describe('routes without @Roles metadata', () => {
    it('allows through when no roles are declared', () => {
      reflector.getAllAndOverride.mockReturnValue(undefined);

      expect(guard.canActivate(contextFor({ role: UserRole.TICKET_REQUESTER }))).toBe(true);
    });

    it('allows through when the declared role list is empty', () => {
      reflector.getAllAndOverride.mockReturnValue([]);

      expect(guard.canActivate(contextFor({ role: UserRole.TICKET_REQUESTER }))).toBe(true);
    });
  });

  describe('routes with @Roles metadata', () => {
    it('admits a user holding a required role', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER]);

      expect(guard.canActivate(contextFor({ role: UserRole.PROJECT_MANAGER }))).toBe(true);
    });

    it('rejects a user holding an unlisted role', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER]);

      expect(guard.canActivate(contextFor({ role: UserRole.DEVELOPER }))).toBe(false);
    });

    it('rejects an unauthenticated request', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.PROGRAMMING_HEAD]);

      expect(guard.canActivate(contextFor(undefined))).toBe(false);
    });

    it('rejects a user with no role attached', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.PROGRAMMING_HEAD]);

      expect(guard.canActivate(contextFor({ id: 'user-1' }))).toBe(false);
    });

    it('reads metadata from both handler and class', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.QA]);

      guard.canActivate(contextFor({ role: UserRole.QA }));

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [expect.anything(), expect.anything()]);
    });

    it('does not treat one privileged role as implying another', () => {
      reflector.getAllAndOverride.mockReturnValue([UserRole.PROGRAMMING_HEAD]);

      // SENIOR_MANAGEMENT is senior but not listed — the guard is an exact membership check, not a hierarchy.
      expect(guard.canActivate(contextFor({ role: UserRole.SENIOR_MANAGEMENT }))).toBe(false);
    });
  });
});
