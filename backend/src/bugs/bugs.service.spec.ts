import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  BugSeverity,
  BugStatus,
  NotificationType,
  TestState,
  TicketDependencyType,
  TicketStatus,
  TicketType,
  UserRole,
} from '@prisma/client';
import { BugsService } from './bugs.service';
import { TestingAccessService } from '../testing/testing.access';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';

const BUG = 'bug-1';
const CASE = 'case-1';
const SUITE = 'suite-1';
const SYSTEM = 'system-1';
const COMPANY = 'company-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: COMPANY,
});

const bugRow = (over: Record<string, any> = {}) => ({
  id: BUG,
  bugNumber: 114,
  title: 'زر الحفظ لا يستجيب',
  description: 'لا شيء يحدث.',
  expectedBehavior: null,
  actualBehavior: null,
  environment: null,
  severity: BugSeverity.MAJOR,
  priority: null,
  status: BugStatus.OPEN,
  systemId: SYSTEM,
  companyId: COMPANY,
  suiteId: SUITE,
  testCaseId: CASE,
  ticketId: null,
  reportedById: 'qa-1',
  assignedToId: null,
  isArchived: false,
  steps: [],
  ...over,
});

const caseRow = {
  id: CASE,
  suiteId: SUITE,
  ticketId: null,
  state: TestState.ACTIVE,
  suite: { id: SUITE, systemId: SYSTEM, companyId: COMPANY, state: TestState.ACTIVE, isArchived: false },
};

describe('BugsService', () => {
  let service: BugsService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  let email: { sendBugFiled: jest.Mock };

  beforeEach(async () => {
    prisma = {
      bug: {
        findUnique: jest.fn().mockResolvedValue(bugRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            ...bugRow(),
            ...data,
            id: BUG,
            system: { id: SYSTEM, name: 'نظام 1' },
            company: { id: COMPANY, name: 'شركة 1' },
          }),
        ),
        update: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ ...bugRow(), ...data }),
        ),
      },
      bugStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      testCase: { findUnique: jest.fn().mockResolvedValue(caseRow) },
      testSuiteTicket: { findMany: jest.fn().mockResolvedValue([]) },
      ticketAssignment: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
      ticket: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({
          id: 'ticket-1',
          systemId: SYSTEM,
          companyId: COMPANY,
        }),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'ticket-new', ...data }),
        ),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketDependency: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findUnique: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({
            id: where.id,
            isActive: true,
            email: `${where.id}@test.local`,
            firstName: 'م',
          }),
        ),
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          const ids: string[] = where?.id?.in ?? [];
          if (!ids.length) return Promise.resolve([]);
          return Promise.resolve(
            ids.map((id) => ({
              id,
              email: `${id}@test.local`,
              firstName: 'م',
            })),
          );
        }),
      },
      system: {
        findUnique: jest.fn().mockResolvedValue({ id: SYSTEM, companyId: COMPANY, isActive: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((arg: any) =>
        typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
      ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };
    email = { sendBugFiled: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BugsService,
        TestingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: email },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') } },
      ],
    }).compile();

    service = module.get(BugsService);
  });

  describe('create — from a case', () => {
    const dto = { title: 'خطأ', description: 'وصف', severity: BugSeverity.MAJOR, testCaseId: CASE };

    it.each([UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD])(
      'lets %s file one',
      async (role) => {
        await expect(service.create(dto, asUser(role))).resolves.toBeDefined();
      },
    );

    it('inherits system, company and suite from the case', async () => {
      await service.create(dto, asUser(UserRole.QA));
      expect(prisma.bug.create.mock.calls[0][0].data).toMatchObject({
        systemId: SYSTEM,
        companyId: COMPANY,
        suiteId: SUITE,
        testCaseId: CASE,
      });
    });

    it('opens the status history so the story starts at OPEN', async () => {
      await service.create(dto, asUser(UserRole.QA, 'qa-7'));
      expect(prisma.bugStatusHistory.create).toHaveBeenCalledWith({
        data: { bugId: BUG, fromStatus: null, toStatus: BugStatus.OPEN, changedById: 'qa-7' },
      });
    });

    it('refuses a developer who is not on a linked ticket', async () => {
      await expect(service.create(dto, asUser(UserRole.DEVELOPER))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets a developer on the linked ticket file one', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      await expect(service.create(dto, asUser(UserRole.DEVELOPER))).resolves.toBeDefined();
    });

    it.each([UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER, UserRole.SENIOR_MANAGEMENT])(
      'refuses %s',
      async (role) => {
        await expect(service.create(dto, asUser(role))).rejects.toThrow(ForbiddenException);
      },
    );
  });

  describe('create — standalone', () => {
    const dto = {
      title: 'خطأ',
      description: 'وصف',
      severity: BugSeverity.MAJOR,
      systemId: SYSTEM,
      companyId: COMPANY,
    };

    it('accepts a system and company instead of a case', async () => {
      await expect(service.create(dto, asUser(UserRole.QA))).resolves.toBeDefined();
      expect(prisma.bug.create.mock.calls[0][0].data.testCaseId).toBeUndefined();
    });

    it('refuses a bug with neither a case nor a system', async () => {
      await expect(
        service.create(
          { title: 'خطأ', description: 'وصف', severity: BugSeverity.MAJOR },
          asUser(UserRole.QA),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses a system outside the reporter’s scope', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-9' }]);
      await expect(service.create(dto, asUser(UserRole.DEVELOPER))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('notifies system developers and emails assignee when filing standalone without roster', async () => {
      await service.create({ ...dto, assignedToId: 'dev-1' }, asUser(UserRole.QA, 'qa-7'));
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-1'],
        expect.objectContaining({
          type: NotificationType.BUG_ASSIGNED,
          title: 'خطأ جديد على مشروعك',
        }),
        'qa-7',
      );
      expect(email.sendBugFiled).toHaveBeenCalledWith(
        'dev-1@test.local',
        'م',
        dto.title,
        114,
        'http://localhost:3000/bugs/bug-1',
        'أ ب',
        { companyName: 'شركة 1', systemName: 'نظام 1' },
      );
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('notifies and emails every developer on the system roster', async () => {
      prisma.userSystem.findMany.mockImplementation((args: { where?: { userId?: string; systemId?: string } }) => {
        if (args?.where?.userId) return Promise.resolve([]);
        if (args?.where?.systemId) {
          return Promise.resolve([
            { user: { id: 'dev-1', email: 'dev1@test.local', firstName: 'د1' } },
            { user: { id: 'dev-2', email: 'dev2@test.local', firstName: 'د2' } },
          ]);
        }
        return Promise.resolve([]);
      });
      await service.create(dto, asUser(UserRole.QA, 'qa-7'));
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-1', 'dev-2'],
        expect.objectContaining({
          type: NotificationType.BUG_ASSIGNED,
          title: 'خطأ جديد على مشروعك',
          body: expect.stringContaining('شركة 1 · نظام 1'),
        }),
        'qa-7',
      );
      expect(email.sendBugFiled).toHaveBeenCalledTimes(2);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('notifies and emails every active ticket developer when the bug is linked to a ticket', async () => {
      prisma.ticketAssignment.findMany.mockResolvedValue([
        { developerId: 'dev-1' },
        { developerId: 'dev-2' },
      ]);
      await service.create({ ...dto, ticketId: 'ticket-1' }, asUser(UserRole.QA, 'qa-7'));
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-1', 'dev-2'],
        expect.objectContaining({
          type: NotificationType.BUG_ASSIGNED,
          ticketId: 'ticket-1',
          title: 'خطأ جديد على تذكرتك',
        }),
        'qa-7',
      );
      expect(email.sendBugFiled).toHaveBeenCalledTimes(2);
      expect(email.sendBugFiled).toHaveBeenCalledWith(
        'dev-1@test.local',
        'م',
        dto.title,
        114,
        'http://localhost:3000/bugs/bug-1',
        'أ ب',
        { companyName: 'شركة 1', systemName: 'نظام 1' },
      );
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('includes a personal assignee when notifying and emailing ticket developers', async () => {
      prisma.ticketAssignment.findMany.mockResolvedValue([{ developerId: 'dev-1' }]);
      await service.create(
        { ...dto, ticketId: 'ticket-1', assignedToId: 'dev-extra' },
        asUser(UserRole.QA, 'qa-7'),
      );
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-1', 'dev-extra'],
        expect.objectContaining({ type: NotificationType.BUG_ASSIGNED, ticketId: 'ticket-1' }),
        'qa-7',
      );
      expect(email.sendBugFiled).toHaveBeenCalledTimes(2);
    });

    it('emails company developers when the system UserSystem roster is empty', async () => {
      prisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where?.id?.in) {
          return Promise.resolve(
            where.id.in.map((id: string) => ({
              id,
              email: `${id}@test.local`,
              firstName: 'م',
            })),
          );
        }
        return Promise.resolve([
          { id: 'dev-co-1', email: 'c1@test.local', firstName: 'ش1' },
          { id: 'dev-co-2', email: 'c2@test.local', firstName: 'ش2' },
        ]);
      });
      await service.create(dto, asUser(UserRole.QA, 'qa-7'));
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-co-1', 'dev-co-2'],
        expect.objectContaining({ title: 'خطأ جديد على مشروعك' }),
        'qa-7',
      );
      expect(email.sendBugFiled).toHaveBeenCalledTimes(2);
      expect(email.sendBugFiled).toHaveBeenCalledWith(
        'c1@test.local',
        'ش1',
        dto.title,
        114,
        'http://localhost:3000/bugs/bug-1',
        'أ ب',
        { companyName: 'شركة 1', systemName: 'نظام 1' },
      );
    });

    it('lets a developer assign at filing time', async () => {
      prisma.testSuiteTicket.findMany.mockResolvedValue([{ ticketId: 'ticket-1' }]);
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      await expect(
        service.create({ ...dto, assignedToId: 'dev-1' }, asUser(UserRole.DEVELOPER)),
      ).resolves.toBeDefined();
    });

    it('links an existing ticket when ticketId is set — without promoting', async () => {
      await service.create({ ...dto, ticketId: 'ticket-1' }, asUser(UserRole.QA));
      expect(prisma.bug.create.mock.calls[0][0].data).toMatchObject({
        ticketId: 'ticket-1',
        systemId: SYSTEM,
        companyId: COMPANY,
      });
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('refuses a ticket outside the bug’s system/company', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-9',
        systemId: 'system-9',
        companyId: COMPANY,
      });
      await expect(
        service.create({ ...dto, ticketId: 'ticket-9' }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('create — from a case with a ticket link', () => {
    const dto = {
      title: 'خطأ',
      description: 'وصف',
      severity: BugSeverity.MAJOR,
      testCaseId: CASE,
      ticketId: 'ticket-1',
    };

    it('allows both testCaseId and ticketId together', async () => {
      await service.create(dto, asUser(UserRole.QA));
      expect(prisma.bug.create.mock.calls[0][0].data).toMatchObject({
        testCaseId: CASE,
        ticketId: 'ticket-1',
        suiteId: SUITE,
      });
    });
  });

  describe('findAll', () => {
    it('scopes the list to the caller’s systems', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: SYSTEM }]);
      await service.findAll(asUser(UserRole.DEVELOPER), {});
      expect(prisma.bug.findMany.mock.calls[0][0].where).toEqual({
        AND: [expect.objectContaining({ isArchived: false }), { systemId: { in: [SYSTEM] } }],
      });
    });

    it('surfaces un-promoted bugs on hasTicket=false', async () => {
      await service.findAll(asUser(UserRole.QA), { hasTicket: false });
      expect(prisma.bug.findMany.mock.calls[0][0].where).toMatchObject({ ticketId: null });
    });

    it('surfaces promoted bugs on hasTicket=true', async () => {
      await service.findAll(asUser(UserRole.QA), { hasTicket: true });
      expect(prisma.bug.findMany.mock.calls[0][0].where).toMatchObject({ ticketId: { not: null } });
    });

    it('filters open bugs — OPEN, IN_PROGRESS, and FIXED', async () => {
      await service.findAll(asUser(UserRole.QA), { open: true });
      expect(prisma.bug.findMany.mock.calls[0][0].where).toMatchObject({
        status: { in: [BugStatus.OPEN, BugStatus.IN_PROGRESS, BugStatus.FIXED] },
      });
    });

    it('leaves the filter off when hasTicket is not asked for', async () => {
      await service.findAll(asUser(UserRole.QA), {});
      expect(prisma.bug.findMany.mock.calls[0][0].where.ticketId).toBeUndefined();
    });

    it('matches a bug code as well as its text', async () => {
      await service.findAll(asUser(UserRole.QA), { search: 'BUG-0114' });
      expect(prisma.bug.findMany.mock.calls[0][0].where.OR).toContainEqual({ bugNumber: 114 });
    });

    it('returns the standard envelope plus the open count the badge uses', async () => {
      prisma.bug.count.mockResolvedValue(3);
      const page = await service.findAll(asUser(UserRole.QA), { limit: '10' });
      expect(page).toMatchObject({ total: 3, page: 1, limit: 10, totalPages: 1, openCount: 3 });
    });

    it('refuses TICKET_REQUESTER', async () => {
      await expect(service.findAll(asUser(UserRole.TICKET_REQUESTER), {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('changeStatus', () => {
    it('writes a history row with both ends of the move', async () => {
      await service.changeStatus(
        BUG,
        { status: BugStatus.FIXED, note: 'تم الإصلاح' },
        asUser(UserRole.QA, 'qa-7'),
      );

      expect(prisma.bugStatusHistory.create).toHaveBeenCalledWith({
        data: {
          bugId: BUG,
          fromStatus: BugStatus.OPEN,
          toStatus: BugStatus.FIXED,
          changedById: 'qa-7',
          note: 'تم الإصلاح',
        },
      });
    });

    it('stamps resolvedAt on a settled status', async () => {
      await service.changeStatus(BUG, { status: BugStatus.CLOSED }, asUser(UserRole.QA));
      expect(prisma.bug.update.mock.calls[0][0].data.resolvedAt).toBeInstanceOf(Date);
    });

    it('clears resolvedAt when a bug is reopened', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ status: BugStatus.CLOSED }));
      await service.changeStatus(BUG, { status: BugStatus.OPEN }, asUser(UserRole.QA));
      expect(prisma.bug.update.mock.calls[0][0].data.resolvedAt).toBeNull();
    });

    it('does nothing when the status has not moved', async () => {
      await service.changeStatus(BUG, { status: BugStatus.OPEN }, asUser(UserRole.QA));
      expect(prisma.bugStatusHistory.create).not.toHaveBeenCalled();
    });

    it('refuses a requester who did not report it', async () => {
      await expect(
        service.changeStatus(BUG, { status: BugStatus.FIXED }, asUser(UserRole.TICKET_REQUESTER, 'req-2')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('lets the reporter correct their own filing', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ reportedById: 'dev-1' }));
      await expect(
        service.update(BUG, { title: 'عنوان أدق' }, asUser(UserRole.DEVELOPER, 'dev-1')),
      ).resolves.toBeDefined();
    });

    it('refuses a reassignment by somebody who cannot assign', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ reportedById: 'req-1' }));
      await expect(
        service.update(BUG, { assignedToId: 'dev-2' }, asUser(UserRole.TICKET_REQUESTER, 'req-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('notifies the new assignee on reassignment', async () => {
      await service.update(BUG, { assignedToId: 'dev-1' }, asUser(UserRole.QA, 'qa-7'));
      expect(notifications.notify).toHaveBeenCalledWith(
        'dev-1',
        expect.objectContaining({ type: NotificationType.BUG_ASSIGNED }),
        'qa-7',
      );
    });

    it('notifies and emails ticket developers when a bug is newly linked to a ticket', async () => {
      prisma.ticketAssignment.findMany.mockResolvedValue([
        { developerId: 'dev-1' },
        { developerId: 'dev-2' },
      ]);
      await service.update(BUG, { ticketId: 'ticket-1' }, asUser(UserRole.QA, 'qa-7'));
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-1', 'dev-2'],
        expect.objectContaining({
          type: NotificationType.BUG_ASSIGNED,
          ticketId: 'ticket-1',
          title: 'خطأ جديد على تذكرتك',
        }),
        'qa-7',
      );
      expect(email.sendBugFiled).toHaveBeenCalledTimes(2);
    });

    it('stays quiet when the assignee has not changed', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ assignedToId: 'dev-1' }));
      await service.update(BUG, { assignedToId: 'dev-1' }, asUser(UserRole.QA));
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('refuses an edit on an archived bug', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ isArchived: true }));
      await expect(service.update(BUG, { title: 'x' }, asUser(UserRole.QA))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('links a visible case and inherits its suite', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ testCaseId: null, suiteId: null }));
      prisma.testCase.findUnique.mockResolvedValue(caseRow);
      await service.update(BUG, { testCaseId: CASE }, asUser(UserRole.QA));
      expect(prisma.bug.update.mock.calls[0][0].data).toMatchObject({
        testCaseId: CASE,
        suiteId: SUITE,
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BUG_UPDATE',
          oldValues: expect.objectContaining({ testCaseId: null }),
          newValues: expect.objectContaining({ testCaseId: CASE }),
        }),
      );
    });

    it('clears the case link without wiping suiteId', async () => {
      await service.update(BUG, { testCaseId: null }, asUser(UserRole.QA));
      expect(prisma.bug.update.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ testCaseId: null }),
      );
      expect(prisma.bug.update.mock.calls[0][0].data.suiteId).toBeUndefined();
    });

    it('refuses a case from another company', async () => {
      prisma.testCase.findUnique.mockResolvedValue({
        ...caseRow,
        suite: { ...caseRow.suite, companyId: 'company-9' },
      });
      await expect(
        service.update(BUG, { testCaseId: CASE }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
    });

    it('links an existing ticket in the same system/company', async () => {
      await service.update(BUG, { ticketId: 'ticket-1' }, asUser(UserRole.QA));
      expect(prisma.bug.update.mock.calls[0][0].data).toMatchObject({ ticketId: 'ticket-1' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BUG_UPDATE',
          newValues: expect.objectContaining({ ticketId: 'ticket-1' }),
        }),
      );
    });

    it('unlinks a ticket', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ ticketId: 'ticket-1' }));
      await service.update(BUG, { ticketId: null }, asUser(UserRole.QA));
      expect(prisma.bug.update.mock.calls[0][0].data).toMatchObject({ ticketId: null });
    });

    it('refuses a ticket outside the bug’s system/company', async () => {
      prisma.ticket.findUnique.mockResolvedValue({
        id: 'ticket-9',
        systemId: 'system-9',
        companyId: COMPANY,
      });
      await expect(
        service.update(BUG, { ticketId: 'ticket-9' }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('promote — the one touch on the ticket workflow', () => {
    it.each([UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.DEVELOPER])(
      'lets %s promote',
      async (role) => {
        await expect(service.promote(BUG, asUser(role))).resolves.toBeDefined();
      },
    );

    it.each([UserRole.SENIOR_MANAGEMENT, UserRole.TICKET_REQUESTER])(
      'refuses %s',
      async (role) => {
        await expect(service.promote(BUG, asUser(role))).rejects.toThrow(ForbiddenException);
      },
    );

    it('creates the ticket at DRAFT as a BUG_FIX — approval is still required', async () => {
      await service.promote(BUG, asUser(UserRole.QA));
      expect(prisma.ticket.create.mock.calls[0][0].data).toMatchObject({
        status: TicketStatus.DRAFT,
        type: TicketType.BUG_FIX,
      });
    });

    it('uses a title override when one is provided', async () => {
      await service.promote(BUG, asUser(UserRole.QA), { title: 'عنوان مخصص' });
      expect(prisma.ticket.create.mock.calls[0][0].data.title).toBe('عنوان مخصص');
    });

    it('defaults the ticket title to (BUG-NNNN) when no override is given', async () => {
      await service.promote(BUG, asUser(UserRole.QA));
      expect(prisma.ticket.create.mock.calls[0][0].data.title).toBe(
        '(BUG-0114) زر الحفظ لا يستجيب',
      );
    });

    it('links the ticket back onto the bug', async () => {
      await service.promote(BUG, asUser(UserRole.QA));
      expect(prisma.bug.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { ticketId: 'ticket-new' } }),
      );
    });

    it('refuses a bug that already has a ticket', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ ticketId: 'ticket-old' }));
      await expect(service.promote(BUG, asUser(UserRole.QA))).rejects.toThrow(BadRequestException);
      expect(prisma.ticket.create).not.toHaveBeenCalled();
    });

    it('refuses an archived bug', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ isArchived: true }));
      await expect(service.promote(BUG, asUser(UserRole.QA))).rejects.toThrow(BadRequestException);
    });

    it('audits both ends, so the link reads from either side', async () => {
      await service.promote(BUG, asUser(UserRole.QA));
      const actions = audit.log.mock.calls.map(([p]: any) => p.action);
      expect(actions).toEqual(expect.arrayContaining(['BUG_PROMOTE', 'TICKET_CREATED']));
    });

    it('opens the ticket’s own status history', async () => {
      await service.promote(BUG, asUser(UserRole.QA));
      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromStatus: null, toStatus: TicketStatus.DRAFT }),
        }),
      );
    });

    it('soft-links related suite/case tickets with RELATES_TO (never BLOCKS)', async () => {
      prisma.testCase.findUnique.mockResolvedValue({
        ticketId: 'ticket-case',
        suiteId: SUITE,
      });
      prisma.testSuiteTicket.findMany.mockResolvedValue([
        { ticketId: 'ticket-suite' },
        { ticketId: 'ticket-case' },
      ]);

      await service.promote(BUG, asUser(UserRole.QA));

      expect(prisma.ticketDependency.create).toHaveBeenCalledTimes(2);
      for (const call of prisma.ticketDependency.create.mock.calls) {
        expect(call[0].data).toMatchObject({
          blockingTicketId: 'ticket-new',
          type: TicketDependencyType.RELATES_TO,
        });
        expect(call[0].data.type).not.toBe(TicketDependencyType.BLOCKS);
      }
      const related = prisma.ticketDependency.create.mock.calls.map(
        ([args]: any) => args.data.blockedTicketId,
      );
      expect(related.sort()).toEqual(['ticket-case', 'ticket-suite']);
    });
  });

  describe('archive — never a hard delete', () => {
    it('flags the bug rather than removing the row', async () => {
      await service.archive(BUG, asUser(UserRole.QA));
      expect(prisma.bug.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isArchived: true } }),
      );
      expect((prisma.bug as any).delete).toBeUndefined();
    });

    it('is idempotent on an already archived bug', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ isArchived: true }));
      await service.archive(BUG, asUser(UserRole.QA));
      expect(prisma.bug.update).not.toHaveBeenCalled();
    });
  });

  describe('unarchive — restore a soft-archived bug', () => {
    it('clears the archived flag', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ isArchived: true }));
      await service.unarchive(BUG, asUser(UserRole.QA));
      expect(prisma.bug.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isArchived: false } }),
      );
    });

    it('is a no-op when the bug is already live', async () => {
      prisma.bug.findUnique.mockResolvedValue(bugRow({ isArchived: false }));
      await service.unarchive(BUG, asUser(UserRole.QA));
      expect(prisma.bug.update).not.toHaveBeenCalled();
    });
  });
});
