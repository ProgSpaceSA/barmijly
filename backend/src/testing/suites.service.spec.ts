import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TestState, UserRole } from '@prisma/client';
import { SuitesService } from './suites.service';
import { TestingAccessService } from './testing.access';
import { TestRollupService } from './test-rollup.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';

const SUITE = 'suite-1';
const SYSTEM = 'system-1';
const COMPANY = 'company-1';
const TICKET = 'ticket-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: COMPANY,
});

const suiteRow = (over: Record<string, any> = {}) => ({
  id: SUITE,
  suiteNumber: 7,
  title: 'مجموعة تسجيل الدخول',
  description: null,
  systemId: SYSTEM,
  companyId: COMPANY,
  ownerId: 'qa-1',
  state: TestState.DRAFT,
  isArchived: false,
  ...over,
});

describe('SuitesService', () => {
  let service: SuitesService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let rollup: { recompute: jest.Mock; forSuite: jest.Mock; forSuites: jest.Mock };

  beforeEach(async () => {
    prisma = {
      testSuite: {
        findUnique: jest.fn().mockResolvedValue(suiteRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: SUITE, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...suiteRow(), ...data })),
      },
      testCase: { findMany: jest.fn().mockResolvedValue([]) },
      testSuiteTicket: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      bug: { findMany: jest.fn().mockResolvedValue([]) },
      ticket: { count: jest.fn().mockResolvedValue(1) },
      system: {
        findUnique: jest.fn().mockResolvedValue({ id: SYSTEM, companyId: COMPANY, isActive: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    rollup = {
      recompute: jest.fn().mockResolvedValue(undefined),
      forSuite: jest.fn().mockResolvedValue({ total: 0, passRate: 0 }),
      forSuites: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuitesService,
        TestingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TestRollupService, useValue: rollup },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(SuitesService);
  });

  describe('create — who writes a suite', () => {
    const dto = { title: 'مجموعة', systemId: SYSTEM, companyId: COMPANY };

    it.each([UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.DEVELOPER])(
      'lets %s create one',
      async (role) => {
        await expect(service.create(dto, asUser(role))).resolves.toMatchObject({ title: 'مجموعة' });
      },
    );

    it.each([
      UserRole.TICKET_REQUESTER,
      UserRole.SYSTEM_OWNER,
      UserRole.SENIOR_MANAGEMENT,
    ])('refuses %s', async (role) => {
      await expect(service.create(dto, asUser(role))).rejects.toThrow(ForbiddenException);
      expect(prisma.testSuite.create).not.toHaveBeenCalled();
    });

    it('starts a new suite as a DRAFT owned by its author', async () => {
      await service.create(dto, asUser(UserRole.QA, 'qa-7'));
      expect(prisma.testSuite.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ ownerId: 'qa-7' }) }),
      );
    });

    it('refuses a system that does not belong to the stated company', async () => {
      prisma.system.findUnique.mockResolvedValue({
        id: SYSTEM,
        companyId: 'other-company',
        isActive: true,
      });
      await expect(service.create(dto, asUser(UserRole.QA))).rejects.toThrow(ForbiddenException);
    });

    it('refuses a deactivated system', async () => {
      prisma.system.findUnique.mockResolvedValue({ id: SYSTEM, companyId: COMPANY, isActive: false });
      await expect(service.create(dto, asUser(UserRole.QA))).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findAll — scope and filters', () => {
    it('gives a user outside the system nothing, whatever they ask for', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-9' }]);

      await service.findAll(asUser(UserRole.DEVELOPER), { systemId: SYSTEM });

      const { where } = prisma.testSuite.findMany.mock.calls[0][0];
      expect(where).toEqual({
        AND: [expect.objectContaining({ systemId: SYSTEM }), { systemId: { in: ['system-9'] } }],
      });
    });

    it('hides archived suites unless they are asked for', async () => {
      await service.findAll(asUser(UserRole.QA), {});
      expect(prisma.testSuite.findMany.mock.calls[0][0].where).toMatchObject({ isArchived: false });
    });

    it('reads «mine» as owned-or-assigned, off the authenticated user', async () => {
      await service.findAll(asUser(UserRole.QA, 'qa-7'), { mine: true });
      expect(prisma.testSuite.findMany.mock.calls[0][0].where).toMatchObject({
        OR: [{ ownerId: 'qa-7' }, { cases: { some: { assignedToId: 'qa-7' } } }],
      });
    });

    it('matches a suite code as well as its text', async () => {
      await service.findAll(asUser(UserRole.QA), { search: 'TS-0007' });
      expect(prisma.testSuite.findMany.mock.calls[0][0].where.OR).toContainEqual({ suiteNumber: 7 });
    });

    it('filters health=failing on published failing cases only', async () => {
      await service.findAll(asUser(UserRole.QA), { health: 'failing' });
      expect(prisma.testSuite.findMany.mock.calls[0][0].where).toMatchObject({
        cases: { some: { state: TestState.ACTIVE, lastResult: 'FAIL' } },
      });
    });

    it('returns the standard envelope with a rollup per row', async () => {
      prisma.testSuite.findMany.mockResolvedValue([suiteRow()]);
      prisma.testSuite.count.mockResolvedValue(1);
      rollup.forSuites.mockResolvedValue(new Map([[SUITE, { total: 3, passRate: 66 }]]));

      const page = await service.findAll(asUser(UserRole.QA), { limit: '10' });

      expect(page).toMatchObject({ total: 1, page: 1, limit: 10, totalPages: 1 });
      expect(page.data[0].rollup).toEqual({ total: 3, passRate: 66 });
    });

    it('refuses TICKET_REQUESTER before it ever queries', async () => {
      await expect(service.findAll(asUser(UserRole.TICKET_REQUESTER), {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('publish — DRAFT only', () => {
    it('moves a draft to ACTIVE', async () => {
      await service.publish(SUITE, asUser(UserRole.QA));
      expect(prisma.testSuite.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: TestState.ACTIVE } }),
      );
    });

    it.each([TestState.ACTIVE, TestState.ARCHIVED])('refuses a %s suite', async (state) => {
      prisma.testSuite.findUnique.mockResolvedValue(suiteRow({ state }));
      await expect(service.publish(SUITE, asUser(UserRole.QA))).rejects.toThrow(BadRequestException);
    });

    it('lets a developer publish', async () => {
      await expect(service.publish(SUITE, asUser(UserRole.DEVELOPER))).resolves.toBeDefined();
    });
  });

  describe('archive — never a hard delete', () => {
    it('flags the suite instead of removing the row', async () => {
      await service.archive(SUITE, asUser(UserRole.QA));
      expect(prisma.testSuite.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: TestState.ARCHIVED, isArchived: true } }),
      );
      expect((prisma.testSuite as any).delete).toBeUndefined();
    });

    it('is idempotent on an already archived suite', async () => {
      prisma.testSuite.findUnique.mockResolvedValue(suiteRow({ state: TestState.ARCHIVED }));
      await service.archive(SUITE, asUser(UserRole.QA));
      expect(prisma.testSuite.update).not.toHaveBeenCalled();
    });
  });

  describe('update — archived suites are read-only', () => {
    it('refuses an edit on an archived suite', async () => {
      prisma.testSuite.findUnique.mockResolvedValue(suiteRow({ state: TestState.ARCHIVED }));
      await expect(
        service.update(SUITE, { title: 'جديد' }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses handing the suite to somebody who cannot author one', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'req-1',
        role: UserRole.TICKET_REQUESTER,
        isActive: true,
      });
      await expect(
        service.update(SUITE, { ownerId: 'req-1' }, asUser(UserRole.QA)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('accepts a developer as owner', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'dev-1',
        role: UserRole.DEVELOPER,
        isActive: true,
      });
      await expect(
        service.update(SUITE, { ownerId: 'dev-1' }, asUser(UserRole.QA)),
      ).resolves.toBeDefined();
    });

    it('accepts a new owner who can author', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'qa-2', role: UserRole.QA, isActive: true });
      await expect(
        service.update(SUITE, { ownerId: 'qa-2' }, asUser(UserRole.QA)),
      ).resolves.toBeDefined();
    });
  });

  describe('ticket links', () => {
    it('records who linked it', async () => {
      await service.linkTicket(SUITE, TICKET, asUser(UserRole.QA, 'qa-7'));
      expect(prisma.testSuiteTicket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { suiteId: SUITE, ticketId: TICKET, linkedById: 'qa-7' },
        }),
      );
    });

    it('refuses a ticket the author cannot open', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: SYSTEM }]);
      await expect(service.linkTicket(SUITE, TICKET, asUser(UserRole.QA))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a duplicate link', async () => {
      prisma.testSuiteTicket.findUnique.mockResolvedValue({ suiteId: SUITE, ticketId: TICKET });
      await expect(service.linkTicket(SUITE, TICKET, asUser(UserRole.QA))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('404s unlinking something that was never linked', async () => {
      await expect(service.unlinkTicket(SUITE, TICKET, asUser(UserRole.QA))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows unlinking a ticket from an archived suite', async () => {
      prisma.testSuite.findUnique.mockResolvedValue(suiteRow({ state: TestState.ARCHIVED }));
      prisma.testSuiteTicket.findUnique.mockResolvedValue({ suiteId: SUITE, ticketId: TICKET });
      await expect(service.unlinkTicket(SUITE, TICKET, asUser(UserRole.QA))).resolves.toEqual({
        suiteId: SUITE,
        ticketId: TICKET,
      });
      expect(prisma.testSuiteTicket.delete).toHaveBeenCalled();
    });

    it('lets a developer link a ticket', async () => {
      await expect(service.linkTicket(SUITE, TICKET, asUser(UserRole.DEVELOPER))).resolves.toBeDefined();
    });
  });

  describe('findForTicket — the ticket page section', () => {
    it('returns the three groups the section renders', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ suiteId: SUITE, suite: suiteRow() }]);

      const result = await service.findForTicket(TICKET, asUser(UserRole.QA));

      expect(result).toEqual({ suites: expect.any(Array), cases: [], bugs: [] });
      expect(result.suites[0]).toMatchObject({ id: SUITE });
    });

    it('refuses TICKET_REQUESTER', async () => {
      await expect(
        service.findForTicket(TICKET, asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a ticket the caller cannot see', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: SYSTEM }]);
      await expect(service.findForTicket(TICKET, asUser(UserRole.DEVELOPER))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
