// The controllers pull their services in for DI metadata, and one of those
// reaches ESM-only `uuid`, which ts-jest does not transform.
jest.mock('uuid', () => ({ v4: () => 'test-token' }));

import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { rolesWith } from './permissions';
import { UsersController } from '../users/users.controller';
import { SignupRequestsController } from '../signup-requests/signup-requests.controller';
import { InvitationsController } from '../invitations/invitations.controller';
import { CompaniesController } from '../companies/companies.controller';
import { SystemsController } from '../systems/systems.controller';
import { DepartmentsController } from '../departments/departments.controller';

const MANAGEMENT = [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT];

const reflector = new Reflector();

function rolesFor(controller: any, method: string): UserRole[] | undefined {
  return reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
    controller.prototype[method],
    controller,
  ]);
}

function handlersOf(controller: any): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter((m) => m !== 'constructor');
}

function expectManagementOnly(controller: any, method: string) {
  const roles = rolesFor(controller, method);
  expect(roles).toBeDefined();
  expect([...(roles as UserRole[])].sort()).toEqual([...MANAGEMENT].sort());
}

function uniqueSorted(...lists: UserRole[][]) {
  return [...new Set(lists.flat())].sort();
}

describe('route guards mirror the action matrix', () => {
  it('opens the user directory to PM read-only and scoped membership edits', () => {
    expect([...(rolesFor(UsersController, 'findAll') as UserRole[])].sort()).toEqual(
      uniqueSorted(rolesWith('user:read'), rolesWith('user:read-directory')),
    );
    expect([...(rolesFor(UsersController, 'update') as UserRole[])].sort()).toEqual(
      uniqueSorted(rolesWith('user:manage'), rolesWith('user:manage-membership')),
    );
    expectManagementOnly(UsersController, 'create');
    expectManagementOnly(UsersController, 'deactivate');
    expectManagementOnly(UsersController, 'activate');
    expect(rolesFor(UsersController, 'findMentionable')).toBeUndefined();
    expect(rolesFor(UsersController, 'getDevelopers')).toBeUndefined();
  });

  it('gates signup and invitation flows to management', () => {
    for (const method of ['findAll', 'approve', 'reject']) {
      expectManagementOnly(SignupRequestsController, method);
    }
    expect(rolesFor(SignupRequestsController, 'create')).toBeUndefined();
    for (const method of handlersOf(InvitationsController)) {
      expectManagementOnly(InvitationsController, method);
    }
  });

  it('leaves structure reads open while splitting writes by action', () => {
    for (const controller of [CompaniesController, SystemsController, DepartmentsController]) {
      expect(rolesFor(controller, 'findAll')).toBeUndefined();
      expect(rolesFor(controller, 'findOne')).toBeUndefined();
      expectManagementOnly(controller, 'update');
    }

    expectManagementOnly(CompaniesController, 'create');
    expectManagementOnly(DepartmentsController, 'create');

    expect([...(rolesFor(SystemsController, 'create') as UserRole[])].sort()).toEqual(
      uniqueSorted(rolesWith('structure:manage'), rolesWith('structure:create-system')),
    );
    expect([...(rolesFor(SystemsController, 'addUser') as UserRole[])].sort()).toEqual(
      uniqueSorted(rolesWith('structure:manage'), rolesWith('structure:manage-roster')),
    );
  });

  it('keeps deactivation with the head and senior management', () => {
    for (const controller of [CompaniesController, SystemsController, DepartmentsController]) {
      expect([...(rolesFor(controller, 'deactivate') as UserRole[])].sort()).toEqual(
        [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT].sort(),
      );
    }
  });
});
