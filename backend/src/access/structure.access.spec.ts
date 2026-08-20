import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { AccessService } from './access.service';
import { PrismaService } from '../prisma/prisma.service';
import { SystemsService } from '../systems/systems.service';
import { CompaniesService } from '../companies/companies.service';
import { DepartmentsService } from '../departments/departments.service';
import { TasksService } from '../tasks/tasks.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

/**
 * req.md §16: "the user only sees the systems authorised for them" and "each
 * company sees only its own tickets". These cover the list endpoints that back
 * those two sentences, plus the task and directory endpoints that used to hand
 * out everything to any signed-in caller.
 */

const asUser = (role: UserRole, id = 'actor-1') => ({ id, role, companyId: null });

/**
 * Arguments of the most recent call. AccessService resolves the caller's
 * portfolio through the same prisma mocks, so the list query under test is the
 * last call rather than the first.
 */
const lastCall = (mock: jest.Mock) => mock.mock.calls[mock.mock.calls.length - 1][0];

const SCOPED_ROLES = [UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER];
const UNSCOPED_ROLES = [
  UserRole.DEVELOPER,
  UserRole.QA,
  UserRole.PROJECT_MANAGER,
  UserRole.PROGRAMMING_HEAD,
  UserRole.SENIOR_MANAGEMENT,
];

describe('structure and directory scope', () => {
  let prisma: any;
  let systems: SystemsService;
  let companies: CompaniesService;
  let departments: DepartmentsService;
  let tasks: TasksService;
  let users: UsersService;

  beforeEach(async () => {
    prisma = {
      system: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'system-1', companyId: 'company-1', isActive: true }),
      },
      company: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }) },
      department: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      ticket: { findUnique: jest.fn(), count: jest.fn().mockResolvedValue(0) },
      ticketTask: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      userCompany: { findMany: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([{ systemId: 'system-1' }]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccessService,
        SystemsService,
        CompaniesService,
        DepartmentsService,
        TasksService,
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: NotificationsService, useValue: { notify: jest.fn(), notifyMany: jest.fn() } },
        { provide: EmailService, useValue: { sendTaskAssigned: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    systems = module.get(SystemsService);
    companies = module.get(CompaniesService);
    departments = module.get(DepartmentsService);
    tasks = module.get(TasksService);
    users = module.get(UsersService);
  });

  describe('GET /systems', () => {
    it.each(SCOPED_ROLES)('limits %s to their granted systems', async (role) => {
      await systems.findAll(asUser(role));
      expect(lastCall(prisma.system.findMany).where).toMatchObject({
        id: { in: ['system-1'] },
      });
    });

    it.each(UNSCOPED_ROLES)('limits %s to their assigned portfolio', async (role) => {
      await systems.findAll(asUser(role));
      expect(lastCall(prisma.system.findMany).where.id).toEqual({ in: ['system-1'] });
    });

    it.each(UNSCOPED_ROLES)('leaves %s org-wide when no portfolio is assigned', async (role) => {
      prisma.userCompany.findMany.mockResolvedValue([]);
      prisma.userSystem.findMany.mockResolvedValue([]);
      await systems.findAll(asUser(role));
      expect(lastCall(prisma.system.findMany).where.id).toBeUndefined();
    });

    it('refuses the detail view of an ungranted system', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-2' }]);
      await expect(
        systems.findOne('system-1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /companies', () => {
    it.each(SCOPED_ROLES)('limits %s to their own companies', async (role) => {
      await companies.findAll(asUser(role));
      expect(lastCall(prisma.company.findMany).where).toEqual({ id: { in: ['company-1'] } });
    });

    it.each(UNSCOPED_ROLES)('limits %s to their assigned portfolio', async (role) => {
      prisma.system.findMany.mockResolvedValue([{ companyId: 'company-1' }]);
      await companies.findAll(asUser(role));
      expect(lastCall(prisma.company.findMany).where).toEqual({
        id: { in: ['company-1'] },
      });
    });

    it.each(UNSCOPED_ROLES)('leaves %s org-wide when no portfolio is assigned', async (role) => {
      prisma.userCompany.findMany.mockResolvedValue([]);
      prisma.userSystem.findMany.mockResolvedValue([]);
      await companies.findAll(asUser(role));
      expect(lastCall(prisma.company.findMany).where).toEqual({});
    });

    it('refuses a company the user does not belong to', async () => {
      prisma.userCompany.findMany.mockResolvedValue([{ companyId: 'company-2' }]);
      prisma.company.findUnique.mockResolvedValue({ id: 'company-1' });

      await expect(
        companies.findOne('company-1', asUser(UserRole.SYSTEM_OWNER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /departments', () => {
    it('limits a requester to departments in their companies', async () => {
      await departments.findAll(asUser(UserRole.TICKET_REQUESTER));
      expect(lastCall(prisma.department.findMany).where).toMatchObject({
        companyId: { in: ['company-1'] },
      });
    });

    it('refuses a department in another company', async () => {
      prisma.department.findUnique.mockResolvedValue({ id: 'd1', companyId: 'company-9' });
      await expect(
        departments.findOne('d1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /tickets/:id/tasks', () => {
    it('refuses the task list for a ticket the caller cannot read', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      await expect(
        tasks.findByTicket('ticket-1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticketTask.findMany).not.toHaveBeenCalled();
    });

    it('serves it once the ticket is in scope', async () => {
      prisma.ticket.count.mockResolvedValue(1);
      await expect(
        tasks.findByTicket('ticket-1', asUser(UserRole.TICKET_REQUESTER)),
      ).resolves.toEqual([]);
    });
  });

  describe('GET /users/mentionable', () => {
    it.each(SCOPED_ROLES)('narrows the directory for %s', async (role) => {
      await users.findMentionable(asUser(role));
      const where = lastCall(prisma.user.findMany).where;

      expect(where.isActive).toBe(true);
      expect(where.OR).toEqual([
        { role: { in: [UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT] } },
        { companyId: { in: ['company-1'] } },
        { companies: { some: { companyId: { in: ['company-1'] } } } },
      ]);
    });

    it.each(UNSCOPED_ROLES)('narrows %s to their portfolio companies', async (role) => {
      prisma.system.findMany.mockResolvedValue([{ companyId: 'company-1' }]);
      await users.findMentionable(asUser(role));
      expect(lastCall(prisma.user.findMany).where.OR).toBeDefined();
    });

    it.each(UNSCOPED_ROLES)('serves the full directory to an unassigned %s', async (role) => {
      prisma.userCompany.findMany.mockResolvedValue([]);
      prisma.userSystem.findMany.mockResolvedValue([]);
      await users.findMentionable(asUser(role));
      expect(lastCall(prisma.user.findMany).where).toEqual({ isActive: true });
    });
  });
});
