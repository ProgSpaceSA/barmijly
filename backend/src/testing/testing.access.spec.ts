import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TestingAccessService } from './testing.access';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';

const SUITE = 'suite-1';
const SYSTEM = 'system-1';
const OTHER_SYSTEM = 'system-9';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: 'company-1',
});

const suiteRow = { id: SUITE, systemId: SYSTEM, companyId: 'company-1', ownerId: 'qa-1' };

describe('TestingAccessService', () => {
  let service: TestingAccessService;
  let prisma: any;

  /** Pins the caller's system grants. `null`-equivalent = org-wide. */
  const grantSystems = (systemIds: string[]) => {
    prisma.userSystem.findMany.mockResolvedValue(systemIds.map((systemId) => ({ systemId })));
  };

  beforeEach(async () => {
    prisma = {
      testSuite: { findUnique: jest.fn().mockResolvedValue(suiteRow) },
      testCase: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'case-1',
          suiteId: SUITE,
          ticketId: null,
          suite: { id: SUITE, systemId: SYSTEM, companyId: 'company-1', state: 'ACTIVE', isArchived: false },
        }),
      },
      bug: { findUnique: jest.fn().mockResolvedValue({ id: 'bug-1', systemId: SYSTEM }) },
      testSuiteTicket: { findMany: jest.fn().mockResolvedValue([]) },
      ticketAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      system: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TestingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TestingAccessService);
  });

  describe('the QA surface is closed to the requester', () => {
    it.each([
      ['suiteScope', (u: any) => service.suiteScope(u)],
      ['bugScope', (u: any) => service.bugScope(u)],
      ['loadVisibleSuite', (u: any) => service.loadVisibleSuite(SUITE, u)],
      ['loadVisibleCase', (u: any) => service.loadVisibleCase('case-1', u)],
      ['loadVisibleBug', (u: any) => service.loadVisibleBug('bug-1', u)],
    ])('refuses TICKET_REQUESTER on %s', async (_name, call) => {
      await expect(call(asUser(UserRole.TICKET_REQUESTER))).rejects.toThrow(ForbiddenException);
    });

    it.each([
      UserRole.QA,
      UserRole.PROGRAMMING_HEAD,
      UserRole.PROJECT_MANAGER,
      UserRole.DEVELOPER,
      UserRole.SYSTEM_OWNER,
      UserRole.SENIOR_MANAGEMENT,
    ])('lets %s read', async (role) => {
      await expect(service.suiteScope(asUser(role))).resolves.toBeDefined();
    });
  });

  describe('scope — suites and bugs follow the systems the user already has', () => {
    it('narrows a scoped user to their own systems', async () => {
      grantSystems([SYSTEM]);
      await expect(service.suiteScope(asUser(UserRole.DEVELOPER))).resolves.toEqual({
        systemId: { in: [SYSTEM] },
      });
      await expect(service.bugScope(asUser(UserRole.DEVELOPER))).resolves.toEqual({
        systemId: { in: [SYSTEM] },
      });
    });

    it('leaves an unportfolioed lead org-wide', async () => {
      await expect(service.suiteScope(asUser(UserRole.PROGRAMMING_HEAD))).resolves.toEqual({});
    });

    it('gives a user with no membership at all an empty list rather than everything', async () => {
      await expect(service.suiteScope(asUser(UserRole.SYSTEM_OWNER))).resolves.toEqual({
        systemId: { in: [] },
      });
    });
  });

  describe('loads — 404 for missing, 403 for out of scope', () => {
    it('404s a suite that does not exist', async () => {
      prisma.testSuite.findUnique.mockResolvedValue(null);
      await expect(service.loadVisibleSuite(SUITE, asUser(UserRole.QA))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('403s a suite in someone else’s system', async () => {
      grantSystems([OTHER_SYSTEM]);
      await expect(service.loadVisibleSuite(SUITE, asUser(UserRole.QA))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('always loads the case’s suite, because that is where the scope answer lives', async () => {
      await service.loadVisibleCase('case-1', asUser(UserRole.QA));
      expect(prisma.testCase.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({ suite: expect.anything() }),
        }),
      );
    });

    it('403s a bug outside the caller’s systems', async () => {
      grantSystems([OTHER_SYSTEM]);
      await expect(service.loadVisibleBug('bug-1', asUser(UserRole.QA))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('assertCanAuthor — writing the tests', () => {
    it.each([
      UserRole.DEVELOPER,
      UserRole.QA,
      UserRole.PROJECT_MANAGER,
      UserRole.PROGRAMMING_HEAD,
    ])('allows %s', (role) => {
      expect(() => service.assertCanAuthor(asUser(role))).not.toThrow();
    });

    it.each([UserRole.SYSTEM_OWNER, UserRole.SENIOR_MANAGEMENT, UserRole.TICKET_REQUESTER])(
      'refuses %s — reading a suite is not writing one',
      (role) => {
        expect(() => service.assertCanAuthor(asUser(role))).toThrow(ForbiddenException);
      },
    );
  });

  describe('assertCanExecute — the developer row check', () => {
    it.each([UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD])(
      'lets %s run any case they can see, with no assignment needed',
      async (role) => {
        await expect(
          service.assertCanExecute({ suiteId: SUITE, ticketId: null }, asUser(role)),
        ).resolves.toBeUndefined();
        expect(prisma.ticketAssignment.findFirst).not.toHaveBeenCalled();
      },
    );

    it('lets a developer run a case on a ticket they hold', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });

      await expect(
        service.assertCanExecute({ suiteId: SUITE, ticketId: null }, asUser(UserRole.DEVELOPER)),
      ).resolves.toBeUndefined();
    });

    it('checks the case’s own ticket alongside the suite’s links', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });

      await service.assertCanExecute(
        { suiteId: SUITE, ticketId: 'ticket-2' },
        asUser(UserRole.DEVELOPER, 'dev-1'),
      );

      expect(prisma.ticketAssignment.findFirst).toHaveBeenCalledWith({
        where: {
          ticketId: { in: ['ticket-1', 'ticket-2'] },
          developerId: 'dev-1',
          isActive: true,
        },
        select: { id: true },
      });
    });

    it('refuses a developer who holds none of the linked tickets', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);

      await expect(
        service.assertCanExecute({ suiteId: SUITE, ticketId: null }, asUser(UserRole.DEVELOPER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a developer when no ticket is linked at all — there is nothing to be on', async () => {
      await expect(
        service.assertCanExecute({ suiteId: SUITE, ticketId: null }, asUser(UserRole.DEVELOPER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it.each([UserRole.SYSTEM_OWNER, UserRole.SENIOR_MANAGEMENT, UserRole.TICKET_REQUESTER])(
      'refuses %s outright — read-only roles never record a result',
      async (role) => {
        await expect(
          service.assertCanExecute({ suiteId: SUITE, ticketId: null }, asUser(role)),
        ).rejects.toThrow(ForbiddenException);
      },
    );
  });
});
