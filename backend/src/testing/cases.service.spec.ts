import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { NotificationType, TestResult, TestState, UserRole } from '@prisma/client';
import { CasesService, moveTo } from './cases.service';
import { TestingAccessService } from './testing.access';
import { TestRollupService } from './test-rollup.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const SUITE = 'suite-1';
const CASE = 'case-1';
const SYSTEM = 'system-1';
const COMPANY = 'company-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: COMPANY,
});

const caseRow = (over: Record<string, any> = {}) => ({
  id: CASE,
  caseNumber: 114,
  suiteId: SUITE,
  ticketId: null,
  assignedToId: null,
  title: 'تسجيل الدخول بكلمة مرور صحيحة',
  expectedResult: 'يفتح لوحة التحكم',
  state: TestState.ACTIVE,
  lastResult: TestResult.NOT_RUN,
  order: 0,
  _count: { steps: 1 },
  suite: {
    id: SUITE,
    systemId: SYSTEM,
    companyId: COMPANY,
    state: TestState.ACTIVE,
    isArchived: false,
  },
  ...over,
});

describe('CasesService', () => {
  let service: CasesService;
  let prisma: any;
  let rollup: { recompute: jest.Mock };
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      testSuite: {
        findUnique: jest.fn().mockResolvedValue({
          id: SUITE,
          systemId: SYSTEM,
          companyId: COMPANY,
          state: TestState.ACTIVE,
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      testCase: {
        findUnique: jest.fn().mockResolvedValue(caseRow()),
        findFirst: jest.fn().mockResolvedValue({ order: 2 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: CASE, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...caseRow(), ...data })),
        delete: jest.fn().mockResolvedValue(caseRow()),
        aggregate: jest.fn().mockResolvedValue({ _max: { lastRunAt: null } }),
      },
      testStep: { findMany: jest.fn().mockResolvedValue([{ body: 'افتح الصفحة' }]) },
      testCaseResultHistory: { create: jest.fn().mockResolvedValue({}) },
      testSuiteTicket: { findMany: jest.fn().mockResolvedValue([]) },
      ticketAssignment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      ticket: { count: jest.fn().mockResolvedValue(1) },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'qa-2', isActive: true }) },
      system: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    rollup = { recompute: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CasesService,
        TestingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: TestRollupService, useValue: rollup },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(CasesService);
  });

  describe('create — authoring only', () => {
    const dto = { title: 'حالة', expectedResult: 'نتيجة' };

    it.each([UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.DEVELOPER])(
      'lets %s add a case',
      async (role) => {
        await expect(service.create(SUITE, dto, asUser(role))).resolves.toBeDefined();
      },
    );

    it.each([UserRole.TICKET_REQUESTER, UserRole.SENIOR_MANAGEMENT])(
      'refuses %s',
      async (role) => {
        await expect(service.create(SUITE, dto, asUser(role))).rejects.toThrow(ForbiddenException);
      },
    );

    it('appends after the last case in the suite', async () => {
      await service.create(SUITE, dto, asUser(UserRole.QA));
      expect(prisma.testCase.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ order: 3 }) }),
      );
    });

    it('starts a new case as a DRAFT that has never run', async () => {
      const created = await service.create(SUITE, dto, asUser(UserRole.QA));
      // Neither state nor lastResult is written — the schema defaults own them.
      expect(prisma.testCase.create.mock.calls[0][0].data.state).toBeUndefined();
      expect(created).toBeDefined();
    });

    it('stores an empty expectedResult on a draft case', async () => {
      await service.create(SUITE, { title: 'حالة', expectedResult: '' }, asUser(UserRole.QA));
      expect(prisma.testCase.create.mock.calls[0][0].data.expectedResult).toBe('');
    });

    it('refuses adding to an archived suite', async () => {
      prisma.testSuite.findUnique.mockResolvedValue({
        id: SUITE,
        systemId: SYSTEM,
        companyId: COMPANY,
        state: TestState.ARCHIVED,
      });
      await expect(service.create(SUITE, dto, asUser(UserRole.QA))).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('publish — DRAFT → ACTIVE', () => {
    it('publishes a draft with no steps', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.DRAFT }));
      prisma.testStep.findMany.mockResolvedValue([]);
      await service.publish(CASE, asUser(UserRole.QA));
      expect(prisma.testCase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: TestState.ACTIVE } }),
      );
    });

    it('publishes a draft whose only step is still blank', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.DRAFT }));
      prisma.testStep.findMany.mockResolvedValue([{ body: '   ' }]);
      await service.publish(CASE, asUser(UserRole.QA));
      expect(prisma.testCase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: TestState.ACTIVE } }),
      );
    });

    it('publishes a draft that has a filled step', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.DRAFT }));
      await service.publish(CASE, asUser(UserRole.QA));
      expect(prisma.testCase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: TestState.ACTIVE } }),
      );
    });

    it('refreshes the rollup, because publishing changes what is counted', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.DRAFT }));
      await service.publish(CASE, asUser(UserRole.QA));
      expect(rollup.recompute).toHaveBeenCalledWith(SUITE, prisma);
    });

    it('refuses a case that is already published', async () => {
      await expect(service.publish(CASE, asUser(UserRole.QA))).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordResult', () => {
    it('writes exactly one history row, with the previous result on it', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ lastResult: TestResult.PASS }));

      await service.recordResult(CASE, { result: TestResult.FAIL, note: 'حقل فارغ' }, asUser(UserRole.QA));

      expect(prisma.testCaseResultHistory.create).toHaveBeenCalledTimes(1);
      expect(prisma.testCaseResultHistory.create).toHaveBeenCalledWith({
        data: {
          testCaseId: CASE,
          fromResult: TestResult.PASS,
          toResult: TestResult.FAIL,
          changedById: 'actor-1',
          note: 'حقل فارغ',
        },
      });
    });

    it('stamps who ran it and when, and refreshes the rollup', async () => {
      await service.recordResult(CASE, { result: TestResult.PASS }, asUser(UserRole.QA, 'qa-7'));

      expect(prisma.testCase.update.mock.calls[0][0].data).toMatchObject({
        lastResult: TestResult.PASS,
        lastRunById: 'qa-7',
        lastRunAt: expect.any(Date),
      });
      expect(rollup.recompute).toHaveBeenCalledWith(SUITE, prisma);
    });

    it('refuses to run a case that is still a draft', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.DRAFT }));
      await expect(
        service.recordResult(CASE, { result: TestResult.PASS }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.SENIOR_MANAGEMENT])(
      'refuses %s — reading a suite is not running it',
      async (role) => {
        await expect(
          service.recordResult(CASE, { result: TestResult.PASS }, asUser(role)),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it('refuses a developer who is not on any linked ticket', async () => {
      await expect(
        service.recordResult(CASE, { result: TestResult.PASS }, asUser(UserRole.DEVELOPER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets a developer on the linked ticket record one', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });

      await expect(
        service.recordResult(CASE, { result: TestResult.PASS }, asUser(UserRole.DEVELOPER)),
      ).resolves.toBeDefined();
    });

    describe('notifications', () => {
      beforeEach(() => {
        prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);
        prisma.ticketAssignment.findMany.mockResolvedValue([
          { developerId: 'dev-lead', ticketId: 'ticket-1' },
        ]);
      });

      it('tells the lead developer when a case fails', async () => {
        await service.recordResult(CASE, { result: TestResult.FAIL }, asUser(UserRole.QA));

        expect(notifications.notifyMany).toHaveBeenCalledWith(
          ['dev-lead'],
          expect.objectContaining({ type: NotificationType.TEST_CASE_FAILED }),
          'actor-1',
        );
        expect(prisma.ticketAssignment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ isActive: true, isLead: true }),
          }),
        );
      });

      it.each([TestResult.PASS, TestResult.BLOCKED, TestResult.SKIPPED])(
        'stays quiet on %s',
        async (result) => {
          await service.recordResult(CASE, { result }, asUser(UserRole.QA));
          expect(notifications.notifyMany).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('remove — drafts go, records archive', () => {
    it('deletes a draft outright', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.DRAFT }));
      await service.remove(CASE, asUser(UserRole.QA));
      expect(prisma.testCase.delete).toHaveBeenCalledWith({ where: { id: CASE } });
    });

    it('archives a published case instead of deleting it', async () => {
      await service.remove(CASE, asUser(UserRole.QA));
      expect(prisma.testCase.delete).not.toHaveBeenCalled();
      expect(prisma.testCase.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { state: TestState.ARCHIVED } }),
      );
      expect(rollup.recompute).toHaveBeenCalled();
    });

    it('lets a developer archive a case', async () => {
      await expect(service.remove(CASE, asUser(UserRole.DEVELOPER))).resolves.toBeDefined();
    });
  });

  describe('reorder — contiguous positions, no gaps', () => {
    it('rewrites every sibling to its new index', async () => {
      prisma.testCase.findMany.mockResolvedValue([{ id: 'a' }, { id: CASE }, { id: 'c' }]);

      await service.reorder(CASE, 0, asUser(UserRole.QA));

      const updates = prisma.testCase.update.mock.calls.map(([arg]: any) => [
        arg.where.id,
        arg.data.order,
      ]);
      expect(updates).toEqual([
        [CASE, 0],
        ['a', 1],
        ['c', 2],
      ]);
    });
  });

  describe('moveTo', () => {
    it('moves an item down and closes the gap behind it', () => {
      expect(moveTo(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    });

    it('moves an item up', () => {
      expect(moveTo(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    });

    it('clamps a target past the end rather than leaving a hole', () => {
      expect(moveTo(['a', 'b'], 'a', 99)).toEqual(['b', 'a']);
    });

    it('leaves the list alone when the id is not in it', () => {
      expect(moveTo(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
    });
  });
});
