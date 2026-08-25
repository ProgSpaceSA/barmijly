import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TestState, UserRole } from '@prisma/client';
import * as fs from 'fs';

// `fs` properties are non-configurable on modern Node, so the module is mocked
// rather than spied on.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
}));
import { StepsService } from './steps.service';
import { TestingAccessService } from './testing.access';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';

const CASE = 'case-1';
const BUG = 'bug-1';
const STEP = 'step-2';
const SYSTEM = 'system-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: 'company-1',
});

const caseRow = (over: Record<string, any> = {}) => ({
  id: CASE,
  suiteId: 'suite-1',
  ticketId: null,
  state: TestState.DRAFT,
  suite: { id: 'suite-1', systemId: SYSTEM, companyId: 'company-1', state: TestState.DRAFT, isArchived: false },
  ...over,
});

const bugRow = (over: Record<string, any> = {}) => ({
  id: BUG,
  systemId: SYSTEM,
  companyId: 'company-1',
  reportedById: 'qa-1',
  isArchived: false,
  ...over,
});

describe('StepsService', () => {
  let service: StepsService;
  let prisma: any;

  beforeEach(async () => {
    (fs.unlinkSync as unknown as jest.Mock).mockClear();
    prisma = {
      testCase: { findUnique: jest.fn().mockResolvedValue(caseRow()) },
      bug: { findUnique: jest.fn().mockResolvedValue(bugRow()) },
      testStep: {
        findUnique: jest.fn().mockResolvedValue({ id: STEP, testCaseId: CASE, bugId: null, order: 1 }),
        findFirst: jest.fn().mockResolvedValue({ order: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: STEP, ...data })),
        delete: jest.fn().mockResolvedValue({ id: STEP }),
      },
      ticketAttachment: { findMany: jest.fn().mockResolvedValue([]) },
      system: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StepsService,
        TestingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
      ],
    }).compile();

    service = module.get(StepsService);
  });

  describe('adding a step', () => {
    it('appends to the end of a case', async () => {
      await service.addToCase(CASE, { body: 'اضغط دخول' }, asUser(UserRole.QA));
      expect(prisma.testStep.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { testCaseId: CASE, body: 'اضغط دخول', order: 2 } }),
      );
    });

    it('starts at 0 on an empty list', async () => {
      prisma.testStep.findFirst.mockResolvedValue(null);
      await service.addToCase(CASE, { body: 'خطوة' }, asUser(UserRole.QA));
      expect(prisma.testStep.create.mock.calls[0][0].data.order).toBe(0);
    });

    it('lets a developer author a case step', async () => {
      await expect(
        service.addToCase(CASE, { body: 'خطوة' }, asUser(UserRole.DEVELOPER)),
      ).resolves.toBeDefined();
    });

    it('refuses a step on an archived case', async () => {
      prisma.testCase.findUnique.mockResolvedValue(caseRow({ state: TestState.ARCHIVED }));
      await expect(
        service.addToCase(CASE, { body: 'خطوة' }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
    });

    it('lets the reporter add a repro step to their own bug', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ reportedById: 'dev-1' }));
      prisma.testStep.findFirst.mockResolvedValue(null);

      await service.addToBug(BUG, { body: 'افتح الصفحة' }, asUser(UserRole.DEVELOPER, 'dev-1'));

      expect(prisma.testStep.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { bugId: BUG, body: 'افتح الصفحة', order: 0 } }),
      );
    });

    it('refuses a requester editing somebody else’s bug', async () => {
      await expect(
        service.addToBug(BUG, { body: 'خطوة' }, asUser(UserRole.TICKET_REQUESTER, 'req-2')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('reorder — rebalances to contiguous positions', () => {
    it('rewrites every sibling so order matches the number on screen', async () => {
      prisma.testStep.findMany.mockResolvedValue([{ id: 'a' }, { id: STEP }, { id: 'c' }]);

      await service.reorder(STEP, 2, asUser(UserRole.QA));

      const updates = prisma.testStep.update.mock.calls
        .filter(([arg]: any) => arg.data.order !== undefined)
        .map(([arg]: any) => [arg.where.id, arg.data.order]);
      expect(updates).toEqual([
        ['a', 0],
        ['c', 1],
        [STEP, 2],
      ]);
    });

    it('reorders inside the owning bug, not across every step in the table', async () => {
      prisma.testStep.findUnique.mockResolvedValue({ id: STEP, testCaseId: null, bugId: BUG });
      prisma.testStep.findMany.mockResolvedValue([{ id: STEP }]);

      await service.reorder(STEP, 0, asUser(UserRole.QA));

      expect(prisma.testStep.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { bugId: BUG } }),
      );
    });

    it('404s an unknown step', async () => {
      prisma.testStep.findUnique.mockResolvedValue(null);
      await expect(service.reorder(STEP, 0, asUser(UserRole.QA))).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete — takes the screenshot with it', () => {
    it('removes the file on disk before dropping the row', async () => {
      prisma.ticketAttachment.findMany.mockResolvedValue([{ url: '/uploads/shot.png' }]);
      const unlink = fs.unlinkSync as unknown as jest.Mock;

      await service.remove(STEP, asUser(UserRole.QA));

      expect(unlink).toHaveBeenCalledWith(expect.stringContaining('shot.png'));
      expect(prisma.testStep.delete).toHaveBeenCalledWith({ where: { id: STEP } });
    });

    it('renumbers what is left so no gap survives', async () => {
      prisma.testStep.findMany.mockResolvedValue([{ id: 'a' }, { id: 'c' }]);

      await service.remove(STEP, asUser(UserRole.QA));

      const updates = prisma.testStep.update.mock.calls.map(([arg]: any) => [
        arg.where.id,
        arg.data.order,
      ]);
      expect(updates).toEqual([
        ['a', 0],
        ['c', 1],
      ]);
    });

    it('lets a developer delete a case step', async () => {
      await expect(service.remove(STEP, asUser(UserRole.DEVELOPER))).resolves.toBeDefined();
    });
  });

  describe('scope', () => {
    it('refuses TICKET_REQUESTER everywhere', async () => {
      await expect(service.findForCase(CASE, asUser(UserRole.TICKET_REQUESTER))).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.findForBug(BUG, asUser(UserRole.TICKET_REQUESTER))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a step whose case sits outside the caller’s systems', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-9' }]);
      await expect(service.findForCase(CASE, asUser(UserRole.QA))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
