// The controllers pull their services in for DI metadata, and one of those
// reaches ESM-only `uuid`, which ts-jest does not transform.
jest.mock('uuid', () => ({ v4: () => 'test-token' }));

import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UsersController } from '../users/users.controller';
import { SignupRequestsController } from '../signup-requests/signup-requests.controller';
import { InvitationsController } from '../invitations/invitations.controller';
import { CompaniesController } from '../companies/companies.controller';
import { SystemsController } from '../systems/systems.controller';
import { DepartmentsController } from '../departments/departments.controller';

/**
 * The admin area — people, signup requests, invitations, org structure — is for
 * management: the head of programming and senior management. A project manager
 * is not one of them; req.md §2 scopes that role to prioritising, assigning and
 * following up. The controllers derive their `@Roles` from the action matrix,
 * so this spec reads the metadata back off the handlers and checks that nothing
 * widened by accident. Written longhand for the same reason as the matrix test.
 */
const MANAGEMENT = [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT];

const NON_MANAGEMENT = [
  UserRole.TICKET_REQUESTER,
  UserRole.SYSTEM_OWNER,
  UserRole.DEVELOPER,
  UserRole.QA,
  UserRole.PROJECT_MANAGER,
];

const reflector = new Reflector();

/** What RolesGuard would read for `Controller.method`. */
function rolesFor(controller: any, method: string): UserRole[] | undefined {
  return reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
    controller.prototype[method],
    controller,
  ]);
}

/** Every public handler on the controller, minus the constructor. */
function handlersOf(controller: any): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter((m) => m !== 'constructor');
}

function expectManagementOnly(controller: any, method: string) {
  const roles = rolesFor(controller, method);
  expect(roles).toBeDefined();
  expect([...(roles as UserRole[])].sort()).toEqual([...MANAGEMENT].sort());
}

describe('admin routes are management-only', () => {
  it('gates every user endpoint', () => {
    // Two exceptions, both pickers rather than directory access: findMentionable
    // is open to any signed-in user and scoped by the service, and getDevelopers
    // follows ticket:assign so a project manager can still fill the assign box.
    const pickers = ['findMentionable', 'getDevelopers'];
    for (const method of handlersOf(UsersController).filter((m) => !pickers.includes(m))) {
      expectManagementOnly(UsersController, method);
    }
    expect(rolesFor(UsersController, 'findMentionable')).toBeUndefined();
  });

  it('leaves the assign picker with the roles that assign tickets', () => {
    expect([...(rolesFor(UsersController, 'getDevelopers') as UserRole[])].sort()).toEqual(
      [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD].sort(),
    );
  });

  it('gates every signup-request review endpoint', () => {
    for (const method of ['findAll', 'approve', 'reject']) {
      expectManagementOnly(SignupRequestsController, method);
    }
  });

  it('leaves the public signup form open — it is how an outsider asks for access', () => {
    expect(rolesFor(SignupRequestsController, 'create')).toBeUndefined();
  });

  it('gates every invitation endpoint', () => {
    for (const method of handlersOf(InvitationsController)) {
      expectManagementOnly(InvitationsController, method);
    }
  });

  it.each([
    ['companies', CompaniesController],
    ['systems', SystemsController],
    ['departments', DepartmentsController],
  ])('gates writes to %s while leaving reads scoped by the service', (_name, controller) => {
    expectManagementOnly(controller, 'create');
    expectManagementOnly(controller, 'update');
    expect(rolesFor(controller, 'findAll')).toBeUndefined();
    expect(rolesFor(controller, 'findOne')).toBeUndefined();
  });

  it.each([
    ['companies', CompaniesController],
    ['systems', SystemsController],
    ['departments', DepartmentsController],
  ])('keeps deactivating a %s with the head and senior management', (_name, controller) => {
    expect([...(rolesFor(controller, 'deactivate') as UserRole[])].sort()).toEqual(
      [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT].sort(),
    );
  });

  it('never admits a non-management role to the admin controllers', () => {
    const controllers = [
      UsersController,
      SignupRequestsController,
      InvitationsController,
      CompaniesController,
      SystemsController,
      DepartmentsController,
    ];

    for (const controller of controllers) {
      for (const method of handlersOf(controller)) {
        if (controller === UsersController && method === 'getDevelopers') continue;
        const roles = rolesFor(controller, method);
        if (!roles) continue;
        for (const role of NON_MANAGEMENT) {
          expect(roles).not.toContain(role);
        }
      }
    }
  });
});
