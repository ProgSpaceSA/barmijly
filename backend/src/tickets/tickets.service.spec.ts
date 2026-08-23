import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatus, TicketStatus, UserRole } from '@prisma/client';
import { TicketsService } from './tickets.service';
import { AssignmentSyncService } from './assignment-sync.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { ApprovalDecision } from './dto/approve-ticket.dto';

const TICKET_ID = 'ticket-1';
const CREATOR_ID = 'creator-1';

const asUser = (role: UserRole, id = 'actor-1') => ({ id, role, firstName: 'ف', lastName: 'ل' });

const ticketAt = (status: TicketStatus, overrides: Record<string, any> = {}) => ({
  id: TICKET_ID,
  title: 'تعديل شاشة الفواتير',
  status,
  creatorId: CREATOR_ID,
  companyId: 'company-1',
  statusHistory: [],
  _count: { tasks: 0 },
  ...overrides,
});

const approvedTicket = () => ticketAt(TicketStatus.APPROVED, { estimatedDeadline: new Date('2026-12-01') });

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: any;
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  let audit: { log: jest.Mock };
  let email: { sendStatusUpdate: jest.Mock; sendTicketAssigned: jest.Mock };

  /** Points findUnique at a ticket in the given state. */
  const currentTicket = (t: any) => {
    prisma.ticket.findUnique.mockImplementation(({ where }: any) =>
      Promise.resolve(where.id === TICKET_ID ? t : null),
    );
  };

  beforeEach(async () => {
    prisma = {
      ticket: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        // 1 = "in scope". AccessService.canViewTicket counts the ticket under
        // the caller's scope; the scope rules themselves are covered in
        // access.service.spec.ts, so here the ticket is simply reachable.
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: TICKET_ID, ...data })),
        create: jest.fn().mockResolvedValue({ id: 'ticket-new' }),
      },
      ticketStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      ticketApproval: { create: jest.fn().mockResolvedValue({}) },
      // No prerequisites by default; the dependency gate has its own cases.
      ticketDependency: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'dep-1' }),
        update: jest.fn().mockResolvedValue({ id: 'dep-1' }),
        upsert: jest.fn().mockResolvedValue({ id: 'dep-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'dep-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      ticketComment: { create: jest.fn().mockResolvedValue({}) },
      ticketAssignment: {
        create: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ id: 'assignment-1', isActive: true, isLead: false }),
        // Truthy = the caller leads this ticket. Tests that need the opposite
        // point it at null.
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1', isLead: true }),
      },
      ticketTask: {
        create: jest.fn().mockResolvedValue({ id: 'task-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: { difficultyLevel: null }, _count: { difficultyLevel: 0 } }),
        // 0 open tasks by default: the gate only bites when a test says so.
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ email: 'creator@company.com', firstName: 'م', role: UserRole.DEVELOPER, isActive: true }),
        // The assign guard checks the developer can reach the ticket, which
        // reads their system/company links off this query.
        findMany: jest.fn().mockResolvedValue([{
          id: 'dev-1',
          role: UserRole.DEVELOPER,
          companyId: 'company-1',
          systems: [{ systemId: 'system-1' }],
          companies: [{ companyId: 'company-1' }],
          assignments: [],
          tasksAssigned: [],
          _count: { systems: 1, companies: 1 },
        }]),
      },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { groupBy: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
      company: { findUnique: jest.fn().mockResolvedValue({ id: 'company-1', name: 'شركة الاختبار' }) },
      system: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'system-1',
          companyId: 'company-1',
          isActive: true,
          name: 'نظام الاختبار',
        }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    email = { sendStatusUpdate: jest.fn(), sendTicketAssigned: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        AssignmentSyncService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: email },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://barmijly.ai') } },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  describe('approve — programming-head gate', () => {
    const approval = { decision: ApprovalDecision.APPROVED };

    it.each([
      UserRole.PROJECT_MANAGER,
      UserRole.SENIOR_MANAGEMENT,
      UserRole.DEVELOPER,
      UserRole.QA,
      UserRole.SYSTEM_OWNER,
      UserRole.TICKET_REQUESTER,
    ])('refuses approval by %s', async (role) => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await expect(service.approve(TICKET_ID, approval, asUser(role))).rejects.toThrow(ForbiddenException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it('lets PROGRAMMING_HEAD approve a NEW ticket', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await service.approve(TICKET_ID, approval, asUser(UserRole.PROGRAMMING_HEAD));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { status: TicketStatus.APPROVED },
      });
    });

    it.each([
      [ApprovalDecision.APPROVED, TicketStatus.APPROVED],
      [ApprovalDecision.REJECTED, TicketStatus.REJECTED],
      [ApprovalDecision.NEEDS_INFO, TicketStatus.AWAITING_INFO],
      [ApprovalDecision.CONVERT_TO_PROJECT, TicketStatus.ON_HOLD],
    ])('maps decision %s to status %s', async (decision, expected) => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await service.approve(TICKET_ID, { decision }, asUser(UserRole.PROGRAMMING_HEAD));

      expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: TICKET_ID }, data: { status: expected } });
    });

    it.each([
      TicketStatus.DRAFT,
      TicketStatus.APPROVED,
      TicketStatus.IN_PROGRESS,
      TicketStatus.COMPLETED,
      TicketStatus.CLOSED,
    ])('refuses to approve a ticket in %s', async (status) => {
      currentTicket(ticketAt(status));

      await expect(service.approve(TICKET_ID, approval, asUser(UserRole.PROGRAMMING_HEAD)))
        .rejects.toThrow(BadRequestException);
    });

    it('records the approval decision for audit', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_APPROVAL));

      await service.approve(
        TICKET_ID,
        { decision: ApprovalDecision.APPROVED, notes: 'موافق', conditions: 'خلال أسبوع' },
        asUser(UserRole.PROGRAMMING_HEAD, 'head-1'),
      );

      expect(prisma.ticketApproval.create).toHaveBeenCalledWith({
        data: {
          ticketId: TICKET_ID,
          approverId: 'head-1',
          decision: ApprovalDecision.APPROVED,
          notes: 'موافق',
          conditions: 'خلال أسبوع',
        },
      });
    });

    it('posts approval notes as a public comment', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await service.approve(
        TICKET_ID,
        { decision: ApprovalDecision.APPROVED, notes: '  موافق  ' },
        asUser(UserRole.PROGRAMMING_HEAD, 'head-1'),
      );

      expect(prisma.ticketComment.create).toHaveBeenCalledWith({
        data: { ticketId: TICKET_ID, authorId: 'head-1', content: 'موافق', visibility: 'PUBLIC', mentions: [] },
      });
    });

    it('posts no comment when notes are blank', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await service.approve(
        TICKET_ID,
        { decision: ApprovalDecision.APPROVED, notes: '   ' },
        asUser(UserRole.PROGRAMMING_HEAD),
      );

      expect(prisma.ticketComment.create).not.toHaveBeenCalled();
    });

    it('notifies the creator of the outcome', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await service.approve(TICKET_ID, { decision: ApprovalDecision.REJECTED }, asUser(UserRole.PROGRAMMING_HEAD));

      expect(notifications.notify).toHaveBeenCalledWith(CREATOR_ID, expect.objectContaining({
        ticketId: TICKET_ID,
        title: 'تم رفض التذكرة',
      }), 'actor-1');
    });
  });

  describe('assign — no development before approval', () => {
    const assignment = { developerIds: ['dev-1'] } as any;

    it.each([
      UserRole.DEVELOPER,
      UserRole.QA,
      UserRole.TICKET_REQUESTER,
      UserRole.SYSTEM_OWNER,
      UserRole.SENIOR_MANAGEMENT,
    ])('refuses assignment by %s', async (role) => {
      currentTicket(approvedTicket());

      await expect(service.assign(TICKET_ID, assignment, asUser(role))).rejects.toThrow(ForbiddenException);
    });

    it.each([
      TicketStatus.NEW,
      TicketStatus.DRAFT,
      TicketStatus.AWAITING_APPROVAL,
      TicketStatus.REJECTED,
    ])('refuses to assign a ticket in %s', async (status) => {
      currentTicket(ticketAt(status));

      await expect(service.assign(TICKET_ID, assignment, asUser(UserRole.PROJECT_MANAGER)))
        .rejects.toThrow(BadRequestException);
      expect(prisma.ticketAssignment.create).not.toHaveBeenCalled();
    });

    it('moves an approved ticket to SCHEDULED and deactivates prior assignments', async () => {
      currentTicket(approvedTicket());

      await service.assign(TICKET_ID, assignment, asUser(UserRole.PROJECT_MANAGER));

      // Anyone not named in this assignment comes off the roster; the named
      // developers are upserted so a re-assignment does not duplicate a row.
      expect(prisma.ticketAssignment.updateMany).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, isActive: true, developerId: { notIn: ['dev-1'] } },
        data: { isActive: false, isLead: false },
      });
      expect(prisma.ticketAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId_developerId: { ticketId: TICKET_ID, developerId: 'dev-1' } },
        }),
      );
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.SCHEDULED }),
      });
      // A lone assignee is also the lead, so they get the lead wording.
      expect(notifications.notify).toHaveBeenCalledWith('dev-1', expect.objectContaining({
        ticketId: TICKET_ID,
        title: 'أُسندت إليك تذكرة كقائد عمل',
      }), 'actor-1');
    });

    it('does not mirror the ticket as a task', async () => {
      // Assignment used to auto-create a task titled after the ticket, deduped
      // by title match. Assignees are first-class rows now, so the mirror has no
      // job left and its title-based dedupe was fragile.
      currentTicket(approvedTicket());

      await service.assign(TICKET_ID, assignment, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketTask.create).not.toHaveBeenCalled();
    });

    it('puts several developers on one ticket and marks the named lead', async () => {
      currentTicket(approvedTicket());

      await service.assign(
        TICKET_ID,
        { developerIds: ['dev-1', 'dev-2', 'dev-3'], leadDeveloperId: 'dev-2' } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      const rostered = prisma.ticketAssignment.upsert.mock.calls
        .map((c: any) => c[0].where.ticketId_developerId.developerId);
      expect(rostered).toEqual(expect.arrayContaining(['dev-1', 'dev-2', 'dev-3']));

      // setLead demotes before it promotes — the partial unique index that
      // guarantees one lead per ticket fires the other way round.
      expect(prisma.ticketAssignment.updateMany).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, isLead: true, developerId: { not: 'dev-2' } },
        data: { isLead: false },
      });
      expect(prisma.ticketAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId_developerId: { ticketId: TICKET_ID, developerId: 'dev-2' } },
          update: expect.objectContaining({ isLead: true }),
        }),
      );
    });

    it('notifies every developer on the roster', async () => {
      currentTicket(approvedTicket());

      await service.assign(
        TICKET_ID,
        { developerIds: ['dev-1', 'dev-2'] } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(notifications.notify).toHaveBeenCalledWith('dev-1', expect.anything(), 'actor-1');
      expect(notifications.notify).toHaveBeenCalledWith('dev-2', expect.anything(), 'actor-1');
    });

    it('refuses a lead who is not on the roster', async () => {
      currentTicket(approvedTicket());

      await expect(
        service.assign(
          TICKET_ID,
          { developerIds: ['dev-1'], leadDeveloperId: 'dev-9' } as any,
          asUser(UserRole.PROJECT_MANAGER),
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('developer transitions', () => {
    it('refuses startWork for a developer who is not assigned', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect(service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER))).rejects.toThrow(ForbiddenException);
    });

    it.each([
      ['startWork', (u: any) => service.startWork(TICKET_ID, u), TicketStatus.SCHEDULED],
      ['submitForTesting', (u: any) => service.submitForTesting(TICKET_ID, u), TicketStatus.IN_PROGRESS],
    ])('refuses %s for a contributor who is not the lead', async (_name, act, from) => {
      // Several developers work one ticket now. Contributors work their tasks;
      // moving the ticket itself is the lead's call, so two people cannot race
      // the same transition.
      currentTicket(ticketAt(from as TicketStatus));
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect((act as any)(asUser(UserRole.DEVELOPER, 'contributor-1')))
        .rejects.toThrow(ForbiddenException);
    });

    it('refuses submit-for-testing while tasks are still open', async () => {
      // AWAITING_TESTING claims the work is done; open tasks say otherwise.
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketTask.count.mockResolvedValue(2);

      await expect(service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(BadRequestException);
      await expect(service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(/2/);
    });

    it('allows submit-for-testing once every task is complete', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketTask.count.mockResolvedValue(0);

      await service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.AWAITING_TESTING }),
      });
    });

    it('counts live task rows rather than the ticket rollup', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketTask.count.mockResolvedValue(0);

      await service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER));

      expect(prisma.ticketTask.count).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, status: { in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS] } },
      });
    });

    it('still lets leadership force the ticket past open tasks', async () => {
      // force-status is the audited bypass, and stays one.
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketTask.count.mockResolvedValue(3);

      await service.forceStatus(
        TICKET_ID,
        { status: TicketStatus.AWAITING_TESTING, reason: 'الباقي يُتابع لاحقاً' } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.AWAITING_TESTING }),
      });
    });

    it('checks the lead flag, not just membership', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));

      await service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER, 'lead-1'));

      expect(prisma.ticketAssignment.findFirst).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, developerId: 'lead-1', isActive: true, isLead: true },
      });
    });

    it('refuses startWork on a ticket that is not SCHEDULED', async () => {
      currentTicket(ticketAt(TicketStatus.APPROVED));

      await expect(service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER))).rejects.toThrow(BadRequestException);
    });

    it('moves a scheduled ticket to IN_PROGRESS', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));

      await service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({
          status: TicketStatus.IN_PROGRESS,
          startedAt: expect.any(Date),
        }),
      });
      expect(email.sendStatusUpdate).toHaveBeenCalled();
    });

    it('refuses submitForTesting unless the ticket is IN_PROGRESS', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));

      await expect(service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER))).rejects.toThrow(BadRequestException);
    });

    it('moves an in-progress ticket to AWAITING_TESTING and notifies the creator', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { status: TicketStatus.AWAITING_TESTING },
      });
      expect(notifications.notify).toHaveBeenCalledWith(CREATOR_ID, expect.objectContaining({
        ticketId: TICKET_ID,
        title: 'التذكرة جاهزة للاختبار',
      }), 'actor-1');
    });
  });

  describe('approveCompletion — testing and owner sign-off', () => {
    it('sends a QA sign-off to AWAITING_OWNER_APPROVAL', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_TESTING));

      await service.approveCompletion(TICKET_ID, asUser(UserRole.QA));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { status: TicketStatus.AWAITING_OWNER_APPROVAL },
      });
    });

    it('lets a manager close out owner approval as COMPLETED', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL));

      await service.approveCompletion(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({
          status: TicketStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      });
    });

    it('refuses a requester signing off on a ticket they do not own', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL));

      await expect(service.approveCompletion(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, 'someone-else')))
        .rejects.toThrow(ForbiddenException);
    });

    it('lets the creator sign off on their own ticket', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL));

      await service.approveCompletion(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({
          status: TicketStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      });
    });

    it('lets a system owner in the company sign off even if they did not file the ticket', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL, { systemOwnerId: 'named-owner' }));

      await service.approveCompletion(TICKET_ID, asUser(UserRole.SYSTEM_OWNER, 'owner-all'));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({
          status: TicketStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      });
    });

    it('refuses a system owner who cannot see the ticket', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL));
      prisma.ticket.count.mockResolvedValue(0);

      await expect(service.approveCompletion(TICKET_ID, asUser(UserRole.SYSTEM_OWNER, 'owner-other')))
        .rejects.toThrow(ForbiddenException);
      expect(prisma.ticket.update).not.toHaveBeenCalled();
    });

    it.each([
      TicketStatus.NEW,
      TicketStatus.IN_PROGRESS,
      TicketStatus.CLOSED,
    ])('refuses sign-off while the ticket is %s', async (status) => {
      currentTicket(ticketAt(status));

      await expect(service.approveCompletion(TICKET_ID, asUser(UserRole.QA))).rejects.toThrow(BadRequestException);
    });
  });

  describe('close and reopen', () => {
    it('refuses to close a ticket that is not COMPLETED', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_TESTING));

      await expect(service.close(TICKET_ID, { closureNotes: 'تم' } as any, asUser(UserRole.PROJECT_MANAGER)))
        .rejects.toThrow(BadRequestException);
    });

    it('closes a completed ticket with closure notes', async () => {
      currentTicket(ticketAt(TicketStatus.COMPLETED));

      await service.close(TICKET_ID, { closureNotes: 'تم التنفيذ' } as any, asUser(UserRole.PROGRAMMING_HEAD));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({
          status: TicketStatus.CLOSED,
          closureNotes: 'تم التنفيذ',
          completedAt: expect.any(Date),
        }),
      });
    });

    it.each([TicketStatus.CLOSED, TicketStatus.REJECTED])('reopens a %s ticket back to NEW', async (status) => {
      currentTicket(ticketAt(status));

      await service.reopen(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.NEW }),
      });
    });

    it('refuses to reopen a ticket that is still in flight', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await expect(service.reopen(TICKET_ID, asUser(UserRole.PROJECT_MANAGER))).rejects.toThrow(BadRequestException);
    });
  });

  describe('prerequisites', () => {
    /** Both ends of the edge have to resolve — addDependency loads each one. */
    const bothTicketsExist = () => {
      prisma.ticket.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === TICKET_ID ? ticketAt(TicketStatus.NEW) : ticketAt(TicketStatus.NEW, { id: where.id }),
        ),
      );
    };

    it('refuses submit-for-testing while a required ticket is unfinished', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketDependency.findMany.mockResolvedValue([
        { blockingTicket: { ticketNumber: 124 } },
      ]);

      await expect(service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(BadRequestException);
    });

    it('refuses to start while a required ticket is unfinished', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));
      prisma.ticketDependency.findMany.mockResolvedValue([
        { blockingTicket: { ticketNumber: 12 } },
      ]);

      await expect(service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(BadRequestException);
    });

    it('starts once the prerequisites are complete', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));
      prisma.ticketDependency.findMany.mockResolvedValue([]);

      await service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.IN_PROGRESS }),
      });
    });

    it('refuses a dependency on itself', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await expect(
        service.addDependency(TICKET_ID, { otherTicketId: TICKET_ID }, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses an edge that would close a cycle', async () => {
      bothTicketsExist();
      // 'other' already waits on this ticket.
      prisma.ticketDependency.findMany.mockResolvedValue([
        { blockedTicketId: 'other', blockingTicketId: TICKET_ID },
      ]);

      await expect(
        service.addDependency(TICKET_ID, { otherTicketId: 'other' }, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([UserRole.DEVELOPER, UserRole.QA, UserRole.TICKET_REQUESTER])(
      'refuses %s adding a prerequisite',
      async (role) => {
        currentTicket(ticketAt(TicketStatus.NEW));

        await expect(
          service.addDependency(TICKET_ID, { otherTicketId: 'other' }, asUser(role)),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it('records the edge and audits it', async () => {
      bothTicketsExist();

      await service.addDependency(TICKET_ID, { otherTicketId: 'other' }, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketDependency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            blockedTicketId: TICKET_ID,
            blockingTicketId: 'other',
            type: 'BLOCKS',
            createdById: 'actor-1',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DEPENDENCY_ADD' }),
      );
    });

    it('refuses the same relation twice', async () => {
      bothTicketsExist();
      prisma.ticketDependency.findUnique.mockResolvedValue({
        id: 'dep-1',
        blockedTicketId: TICKET_ID,
        blockingTicketId: 'other',
        type: 'BLOCKS',
      });

      await expect(
        service.addDependency(TICKET_ID, { otherTicketId: 'other' }, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow('هذه العلاقة مضافة مسبقاً');

      expect(prisma.ticketDependency.create).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('records the relation the other way round when this ticket blocks', async () => {
      // Same endpoint, both directions — the row is always stored blocking→blocked.
      bothTicketsExist();

      await service.addDependency(
        TICKET_ID,
        { otherTicketId: 'other', direction: 'blocks' } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticketDependency.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ blockingTicketId: TICKET_ID, blockedTicketId: 'other' }),
        }),
      );
    });

    it('skips the cycle check for a relation that does not block', async () => {
      // Two tickets can reference each other; only a blocking edge can deadlock.
      bothTicketsExist();
      prisma.ticketDependency.findMany.mockResolvedValue([
        { blockedTicketId: 'other', blockingTicketId: TICKET_ID },
      ]);

      await expect(
        service.addDependency(
          TICKET_ID,
          { otherTicketId: 'other', type: 'RELATES_TO' } as any,
          asUser(UserRole.PROJECT_MANAGER),
        ),
      ).resolves.toBeDefined();
    });

    it('removes a relation named from either end', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));
      prisma.ticketDependency.findFirst.mockResolvedValue({ id: 'dep-1' });

      await service.removeDependency(TICKET_ID, 'other', asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketDependency.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockedTicketId: TICKET_ID, blockingTicketId: 'other' },
            { blockedTicketId: 'other', blockingTicketId: TICKET_ID },
          ],
        },
      });
      expect(prisma.ticketDependency.delete).toHaveBeenCalledWith({ where: { id: 'dep-1' } });
    });

    it('404s when removing an edge that is not there', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));
      prisma.ticketDependency.findFirst.mockResolvedValue(null);

      await expect(service.removeDependency(TICKET_ID, 'other', asUser(UserRole.PROJECT_MANAGER)))
        .rejects.toThrow(NotFoundException);
    });

    it('tells the waiting lead when the last prerequisite lands', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL));
      prisma.ticketDependency.findMany.mockResolvedValue([{ blockedTicketId: 'blocked-1' }]);
      prisma.ticketDependency.count.mockResolvedValue(0);
      prisma.ticket.findUnique.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id === TICKET_ID
            ? ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL)
            : { title: 'التذكرة المحجوبة' },
        ),
      );
      prisma.ticketAssignment.findFirst.mockResolvedValue({ developerId: 'lead-2', isLead: true });

      await service.approveCompletion(TICKET_ID, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

      expect(notifications.notify).toHaveBeenCalledWith(
        'lead-2',
        expect.objectContaining({ ticketId: 'blocked-1' }),
        'pm-1',
      );
    });

    it('stays quiet while other prerequisites are still open', async () => {
      // Saying "the way is clear" while two others are outstanding is worse
      // than saying nothing.
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL));
      prisma.ticketDependency.findMany.mockResolvedValue([{ blockedTicketId: 'blocked-1' }]);
      prisma.ticketDependency.count.mockResolvedValue(2);

      await service.approveCompletion(TICKET_ID, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

      expect(notifications.notify).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ ticketId: 'blocked-1' }),
        expect.anything(),
      );
    });
  });

  describe('timeline — everything that happened, not only status', () => {
    it('reads the ticket audit log oldest first', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.timeline(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId: TICKET_ID },
          orderBy: { createdAt: 'asc' },
        }),
      );
    });

    it('carries the actor and the before/after of each entry', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a-1',
          action: 'STATUS_CHANGE',
          entity: 'Ticket',
          createdAt: new Date('2026-08-20T10:00:00Z'),
          user: { id: 'pm-1', firstName: 'ريم', lastName: 'العتيبي', role: UserRole.PROJECT_MANAGER },
          oldValues: { status: TicketStatus.SCHEDULED },
          newValues: { status: TicketStatus.IN_PROGRESS },
        },
      ]);

      const [entry] = await service.timeline(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(entry).toMatchObject({
        action: 'STATUS_CHANGE',
        actor: { firstName: 'ريم' },
        from: { status: TicketStatus.SCHEDULED },
        to: { status: TicketStatus.IN_PROGRESS },
        subjects: [],
      });
    });

    it('resolves the affected developer on an assignment entry', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a-2',
          action: 'ASSIGNEE_ADD',
          entity: 'Ticket',
          createdAt: new Date('2026-08-20T11:00:00Z'),
          user: { id: 'pm-1', firstName: 'ريم', lastName: 'العتيبي', role: UserRole.PROJECT_MANAGER },
          oldValues: null,
          newValues: { developerId: 'dev-1' },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'dev-1', firstName: 'محمد', lastName: 'علي', role: UserRole.DEVELOPER },
      ]);

      const [entry] = await service.timeline(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['dev-1'] } } }),
      );
      expect(entry.subjects).toEqual([{ id: 'dev-1', firstName: 'محمد', lastName: 'علي', role: UserRole.DEVELOPER }]);
    });

    it('fills in the task title on a status change when the audit row omitted it', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 'a-3',
          action: 'TASK_STATUS_CHANGE',
          entity: 'TicketTask',
          entityId: 'task-1',
          createdAt: new Date('2026-08-20T12:00:00Z'),
          user: { id: 'pm-1', firstName: 'ريم', lastName: 'العتيبي', role: UserRole.PROJECT_MANAGER },
          oldValues: { status: TaskStatus.NEW, assignedToId: 'dev-1' },
          newValues: { status: TaskStatus.IN_PROGRESS },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'dev-1', firstName: 'محمد', lastName: 'علي', role: UserRole.DEVELOPER },
      ]);
      prisma.ticketTask.findMany.mockResolvedValue([{ id: 'task-1', title: 'ربط الـ API' }]);

      const [entry] = await service.timeline(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['task-1'] } } }),
      );
      expect(entry.from).toMatchObject({ title: 'ربط الـ API', status: TaskStatus.NEW });
      expect(entry.to).toMatchObject({ title: 'ربط الـ API', status: TaskStatus.IN_PROGRESS });
    });

    it('refuses a ticket the caller cannot see', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticket.count.mockResolvedValue(0);

      await expect(service.timeline(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, 'stranger')))
        .rejects.toThrow(ForbiddenException);
    });

    it('stamps the ticket on a status change so it reaches the timeline', async () => {
      // The entry used to carry only entityId, which the per-ticket query
      // does not look at.
      currentTicket(ticketAt(TicketStatus.SCHEDULED));

      await service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER));

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATUS_CHANGE', ticketId: TICKET_ID }),
      );
    });
  });

  describe('block, hold and resume', () => {
    const reason = 'بانتظار بيانات من المورّد';

    it('blocks an in-progress ticket and records the reason', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.block(TICKET_ID, { reason } as any, asUser(UserRole.DEVELOPER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.BLOCKED, pauseReason: reason }),
      });
    });

    it.each([TicketStatus.DRAFT, TicketStatus.NEW, TicketStatus.COMPLETED, TicketStatus.CLOSED])(
      'refuses to block a ticket in %s',
      async (status) => {
        // Blocking says "work has stopped"; work that never started cannot stop.
        currentTicket(ticketAt(status));

        await expect(service.block(TICKET_ID, { reason } as any, asUser(UserRole.PROJECT_MANAGER)))
          .rejects.toThrow(BadRequestException);
      },
    );

    it('lets the lead raise a blocker but not park a ticket', async () => {
      // Reporting that work is stuck is the lead's call; shelving the ticket is
      // a prioritisation decision for leadership.
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.block(TICKET_ID, { reason } as any, asUser(UserRole.DEVELOPER));
      await expect(service.hold(TICKET_ID, { reason } as any, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(ForbiddenException);
    });

    it('refuses a contributor who does not lead the ticket from blocking', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect(service.block(TICKET_ID, { reason } as any, asUser(UserRole.DEVELOPER, 'contributor-1')))
        .rejects.toThrow(ForbiddenException);
    });

    it.each([UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER])('refuses %s blocking', async (role) => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await expect(service.block(TICKET_ID, { reason } as any, asUser(role)))
        .rejects.toThrow(ForbiddenException);
    });

    it('holds a ticket at any live status', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await service.hold(TICKET_ID, { reason: 'مؤجلة للربع القادم' } as any, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.ON_HOLD }),
      });
    });

    it('refuses to hold a finished ticket', async () => {
      currentTicket(ticketAt(TicketStatus.CLOSED));

      await expect(service.hold(TICKET_ID, { reason } as any, asUser(UserRole.PROJECT_MANAGER)))
        .rejects.toThrow(BadRequestException);
    });

    it('records the blocking ticket when one is named', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.block(
        TICKET_ID,
        { reason, blockedByTicketId: 'ticket-1' } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ blockedByTicketId: 'ticket-1' }),
      });
    });

    it('sends a resumed ticket back to where it stopped', async () => {
      currentTicket(ticketAt(TicketStatus.BLOCKED));
      prisma.ticketStatusHistory.findMany.mockResolvedValue([
        { fromStatus: TicketStatus.SCHEDULED, toStatus: TicketStatus.IN_PROGRESS, createdAt: new Date('2026-08-01') },
        { fromStatus: TicketStatus.IN_PROGRESS, toStatus: TicketStatus.BLOCKED, createdAt: new Date('2026-08-02') },
      ]);

      await service.resume(TICKET_ID, {} as any, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.IN_PROGRESS }),
      });
    });

    it('clears the pause fields on resume', async () => {
      currentTicket(ticketAt(TicketStatus.ON_HOLD));

      await service.resume(TICKET_ID, {} as any, asUser(UserRole.PROGRAMMING_HEAD));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ pauseReason: null, blockedByTicketId: null }),
      });
    });

    it('falls back to SCHEDULED when the pause predates any history', async () => {
      currentTicket(ticketAt(TicketStatus.BLOCKED));
      prisma.ticketStatusHistory.findMany.mockResolvedValue([]);
      prisma.ticketAssignment.count.mockResolvedValue(1);

      await service.resume(TICKET_ID, {} as any, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.SCHEDULED }),
      });
    });

    it('lets the lead clear their own blocker', async () => {
      currentTicket(ticketAt(TicketStatus.BLOCKED));

      await service.resume(TICKET_ID, {} as any, asUser(UserRole.DEVELOPER, 'lead-1'));

      expect(prisma.ticket.update).toHaveBeenCalled();
    });

    it('refuses a developer resuming a deliberately held ticket', async () => {
      // Lifting a hold reverses a leadership decision, so it needs leadership.
      currentTicket(ticketAt(TicketStatus.ON_HOLD));

      await expect(service.resume(TICKET_ID, {} as any, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(ForbiddenException);
    });

    it('refuses a contributor who does not lead the ticket', async () => {
      currentTicket(ticketAt(TicketStatus.BLOCKED));
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect(service.resume(TICKET_ID, {} as any, asUser(UserRole.DEVELOPER, 'contributor-1')))
        .rejects.toThrow(ForbiddenException);
    });

    it('refuses to resume a ticket that is not stopped', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await expect(service.resume(TICKET_ID, {} as any, asUser(UserRole.PROJECT_MANAGER)))
        .rejects.toThrow(BadRequestException);
    });

    it('writes a history row for the stop and the restart', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.block(TICKET_ID, { reason } as any, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: TicketStatus.IN_PROGRESS,
          toStatus: TicketStatus.BLOCKED,
          reason,
        }),
      });
    });

    it('tells the roster and the requester that work stopped', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));
      prisma.ticketAssignment.findMany.mockResolvedValue([
        { developerId: 'dev-1' }, { developerId: 'dev-2' },
      ]);

      await service.block(TICKET_ID, { reason } as any, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['dev-1', 'dev-2', CREATOR_ID],
        expect.objectContaining({ ticketId: TICKET_ID }),
        'pm-1',
      );
    });
  });

  describe('archive — tickets are never deleted', () => {
    it('archives rather than deleting', async () => {
      currentTicket(ticketAt(TicketStatus.CLOSED));

      await service.archive(TICKET_ID, asUser(UserRole.SENIOR_MANAGEMENT));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { isArchived: true },
      });
    });

    it('refuses archiving by a requester', async () => {
      currentTicket(ticketAt(TicketStatus.CLOSED));

      await expect(service.archive(TICKET_ID, asUser(UserRole.TICKET_REQUESTER))).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ownership and editability', () => {
    it('refuses edits by an unrelated requester', async () => {
      currentTicket(ticketAt(TicketStatus.DRAFT));

      await expect(service.update(TICKET_ID, { title: 'x' } as any, asUser(UserRole.TICKET_REQUESTER, 'intruder')))
        .rejects.toThrow(ForbiddenException);
    });

    it.each([
      TicketStatus.NEW,
      TicketStatus.APPROVED,
      TicketStatus.IN_PROGRESS,
      TicketStatus.CLOSED,
    ])('refuses edits once the ticket reaches %s', async (status) => {
      currentTicket(ticketAt(status));

      await expect(service.update(TICKET_ID, { title: 'x' } as any, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID)))
        .rejects.toThrow(BadRequestException);
    });

    it.each([TicketStatus.DRAFT, TicketStatus.AWAITING_INFO])('allows the creator to edit in %s', async (status) => {
      currentTicket(ticketAt(status));

      await service.update(TICKET_ID, { title: 'عنوان جديد' } as any, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { title: 'عنوان جديد' },
      });
    });

    it('reports a missing ticket as not found', async () => {
      currentTicket(null);

      await expect(service.approve(TICKET_ID, { decision: ApprovalDecision.APPROVED }, asUser(UserRole.PROGRAMMING_HEAD)))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it.each([TicketStatus.DRAFT, TicketStatus.AWAITING_INFO])('submits a %s ticket as NEW', async (status) => {
      currentTicket(ticketAt(status));

      await service.submit(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({ status: TicketStatus.NEW }),
      });
    });

    it('refuses to resubmit a ticket already under review', async () => {
      currentTicket(ticketAt(TicketStatus.NEW));

      await expect(service.submit(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID)))
        .rejects.toThrow(BadRequestException);
    });

    it('notifies reviewers when a ticket is submitted', async () => {
      currentTicket(ticketAt(TicketStatus.DRAFT));
      prisma.user.findMany.mockResolvedValue([{ id: 'head-1' }, { id: 'pm-1' }]);

      await service.submit(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID));

      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['head-1', 'pm-1'],
        expect.objectContaining({ ticketId: TICKET_ID }),
        CREATOR_ID,
      );
    });

    it('does not email the creator about a status change they made', async () => {
      currentTicket(ticketAt(TicketStatus.DRAFT));

      await service.submit(TICKET_ID, asUser(UserRole.TICKET_REQUESTER, CREATOR_ID));

      expect(email.sendStatusUpdate).not.toHaveBeenCalled();
    });
  });

  describe('status history — every change is auditable', () => {
    it.each([
      ['submit', () => service.submit(TICKET_ID, asUser(UserRole.PROJECT_MANAGER, 'head-1')), TicketStatus.DRAFT, TicketStatus.NEW],
      ['approve', () => service.approve(TICKET_ID, { decision: ApprovalDecision.APPROVED }, asUser(UserRole.PROGRAMMING_HEAD, 'head-1')), TicketStatus.NEW, TicketStatus.APPROVED],
      ['assign', () => service.assign(TICKET_ID, { developerIds: ['dev-1'] } as any, asUser(UserRole.PROJECT_MANAGER, 'head-1')), TicketStatus.APPROVED, TicketStatus.SCHEDULED],
      ['startWork', () => service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER, 'head-1')), TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS],
      ['submitForTesting', () => service.submitForTesting(TICKET_ID, asUser(UserRole.DEVELOPER, 'head-1')), TicketStatus.IN_PROGRESS, TicketStatus.AWAITING_TESTING],
      ['approveCompletion (QA)', () => service.approveCompletion(TICKET_ID, asUser(UserRole.QA, 'head-1')), TicketStatus.AWAITING_TESTING, TicketStatus.AWAITING_OWNER_APPROVAL],
      ['approveCompletion (owner)', () => service.approveCompletion(TICKET_ID, asUser(UserRole.PROJECT_MANAGER, 'head-1')), TicketStatus.AWAITING_OWNER_APPROVAL, TicketStatus.COMPLETED],
      // close() used to write the ticket row directly, leaving the final and
      // most audited transition in the workflow with no history at all.
      ['close', () => service.close(TICKET_ID, { closureNotes: 'تم' } as any, asUser(UserRole.PROJECT_MANAGER, 'head-1')), TicketStatus.COMPLETED, TicketStatus.CLOSED],
      ['reopen', () => service.reopen(TICKET_ID, asUser(UserRole.PROJECT_MANAGER, 'head-1')), TicketStatus.CLOSED, TicketStatus.NEW],
    ])('%s writes a from/to history row', async (_name, act, from, to) => {
      currentTicket(
        from === TicketStatus.APPROVED
          ? ticketAt(from as TicketStatus, { estimatedDeadline: new Date('2026-12-01') })
          : ticketAt(from as TicketStatus),
      );

      await (act as () => Promise<any>)();

      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticketId: TICKET_ID,
          fromStatus: from,
          toStatus: to,
          changedById: 'head-1',
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          entity: 'Ticket',
          entityId: TICKET_ID,
          oldValues: { status: from },
          newValues: expect.objectContaining({ status: to }),
        }),
      );
    });

    it('closes the ticket in the same write as the status change', async () => {
      currentTicket(ticketAt(TicketStatus.COMPLETED));

      await service.close(TICKET_ID, { closureNotes: 'تم التنفيذ' } as any, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledTimes(1);
    });

    it('moves an approved ticket to SCHEDULED when the team and due date are set', async () => {
      currentTicket({
        ...ticketAt(TicketStatus.APPROVED),
        estimatedDeadline: new Date('2026-12-01'),
      });
      prisma.ticketAssignment.findMany.mockResolvedValue([
        { developerId: 'dev-1', isLead: true, isActive: true, developer: { id: 'dev-1' } },
      ]);

      await service.assign(TICKET_ID, {} as any, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TICKET_ID },
          data: expect.objectContaining({ status: TicketStatus.SCHEDULED }),
        }),
      );
    });

    it('refuses to schedule without a due date on the ticket', async () => {
      currentTicket(ticketAt(TicketStatus.APPROVED));
      prisma.ticketAssignment.findMany.mockResolvedValue([
        { developerId: 'dev-1', isLead: true, isActive: true, developer: { id: 'dev-1' } },
      ]);

      await expect(
        service.assign(TICKET_ID, {} as any, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow('حدّد تاريخ التسليم المتوقع أولاً');
    });

    it('writes plan fields through PATCH /plan, not assign', async () => {
      currentTicket(approvedTicket());

      await service.updatePlan(
        TICKET_ID,
        { estimatedHours: 8, difficultyLevel: 3, estimatedDeadline: '2026-12-15' } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: expect.objectContaining({
          estimatedHours: 8,
          difficultyLevel: 3,
          estimatedDeadline: expect.any(Date),
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PLAN_UPDATED',
          oldValues: {
            estimatedHours: null,
            difficultyLevel: null,
            estimatedDeadline: '2026-12-01',
          },
          newValues: {
            estimatedHours: 8,
            difficultyLevel: 3,
            estimatedDeadline: '2026-12-15',
          },
        }),
      );
    });

    it('lets an assigned developer revise the ticket estimate only', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS, {
        estimatedDeadline: new Date('2026-12-01'),
        estimatedHours: 10,
        difficultyLevel: 2,
      }));
      prisma.ticketAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1', developerId: 'dev-1', isActive: true, isLead: true,
      });

      await service.updatePlan(
        TICKET_ID,
        { estimatedHours: 16, difficultyLevel: 4 } as any,
        asUser(UserRole.DEVELOPER, 'dev-1'),
      );

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { estimatedHours: 16, difficultyLevel: 4 },
      });
    });

    it('refuses schedule edits from a developer', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS, { estimatedDeadline: new Date('2026-12-01') }));
      prisma.ticketAssignment.findFirst.mockResolvedValue({
        id: 'assignment-1', developerId: 'dev-1', isActive: true, isLead: true,
      });

      await expect(
        service.updatePlan(
          TICKET_ID,
          { estimatedDeadline: '2026-12-20', estimatedHours: 12 } as any,
          asUser(UserRole.DEVELOPER, 'dev-1'),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses estimate edits from a developer not on the roster', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS, { estimatedDeadline: new Date('2026-12-01') }));
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect(
        service.updatePlan(TICKET_ID, { estimatedHours: 12 } as any, asUser(UserRole.DEVELOPER, 'dev-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('records the reason on a forced status change', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await service.forceStatus(
        TICKET_ID,
        { status: TicketStatus.ON_HOLD, reason: 'انتظار العميل' } as any,
        asUser(UserRole.SENIOR_MANAGEMENT, 'sm-1'),
      );

      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromStatus: TicketStatus.IN_PROGRESS,
          toStatus: TicketStatus.ON_HOLD,
          reason: 'انتظار العميل',
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FORCE_STATUS', entity: 'Ticket' }));
    });

    it('refuses a forced status change by a developer', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await expect(service.forceStatus(TICKET_ID, { status: TicketStatus.COMPLETED } as any, asUser(UserRole.DEVELOPER)))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMyCreated — personal queue', () => {
    it('keeps a requester on tickets they filed', async () => {
      await service.findMyCreated(asUser(UserRole.TICKET_REQUESTER));

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          isArchived: false,
          AND: [
            { creatorId: 'actor-1' },
            {
              OR: [
                { creatorId: 'actor-1' },
                { systemOwnerId: 'actor-1' },
                {
                  status: {
                    in: [
                      TicketStatus.AWAITING_INFO,
                      TicketStatus.AWAITING_OWNER_APPROVAL,
                      TicketStatus.DRAFT,
                    ],
                  },
                },
              ],
            },
          ],
        },
      }));
    });

    it('adds owner-approval tickets inside a system owner company portfolio', async () => {
      prisma.userCompany.findMany.mockResolvedValue([{ companyId: 'company-9' }]);

      await service.findMyCreated(asUser(UserRole.SYSTEM_OWNER, 'owner-1'));

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          isArchived: false,
          AND: [
            {
              OR: [
                { creatorId: 'owner-1' },
                { systemOwnerId: 'owner-1' },
                { companyId: { in: ['company-9'] } },
              ],
            },
            {
              OR: [
                { creatorId: 'owner-1' },
                { systemOwnerId: 'owner-1' },
                { status: { in: [TicketStatus.AWAITING_OWNER_APPROVAL] } },
              ],
            },
          ],
        },
      }));
    });

    it('queues approved tickets a project manager must assign, not only tickets they filed', async () => {
      prisma.userCompany.findMany.mockResolvedValue([{ companyId: 'company-1' }]);

      await service.findMyCreated(asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          isArchived: false,
          AND: [
            {
              OR: [
                { creatorId: 'pm-1' },
                { companyId: { in: ['company-1'] } },
              ],
            },
            {
              OR: [
                { creatorId: 'pm-1' },
                { systemOwnerId: 'pm-1' },
                {
                  status: {
                    in: [
                      TicketStatus.APPROVED,
                      TicketStatus.AWAITING_TESTING,
                      TicketStatus.AWAITING_OWNER_APPROVAL,
                      // Stopped tickets are the manager's to unstick.
                      TicketStatus.BLOCKED,
                      TicketStatus.ON_HOLD,
                    ],
                  },
                },
              ],
            },
          ],
        },
      }));
    });
  });

  describe('findAll — overdue filter', () => {
    it('keeps tickets past their deadline that are still open', async () => {
      await service.findAll(asUser(UserRole.PROGRAMMING_HEAD), { overdue: true } as any);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          isArchived: false,
          estimatedDeadline: { lt: expect.any(Date) },
          status: { notIn: [TicketStatus.CLOSED, TicketStatus.COMPLETED, TicketStatus.REJECTED] },
        }),
      }));
    });

    it('does not apply the overdue window unless overdue=true', async () => {
      await service.findAll(asUser(UserRole.PROGRAMMING_HEAD), { status: TicketStatus.NEW } as any);

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.status).toBe(TicketStatus.NEW);
      expect(where.estimatedDeadline).toBeUndefined();
    });
  });

  describe('findAll — mine filter', () => {
    const assignedToMe = (id: string) => ({
      OR: [
        { assignments: { some: { developerId: id, isActive: true } } },
        { tasks: { some: { assignedToId: id } } },
      ],
    });

    it('keeps tickets assigned to the caller or that have a task assigned to them', async () => {
      await service.findAll(asUser(UserRole.PROGRAMMING_HEAD, 'head-1'), { mine: true } as any);

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.AND).toContainEqual(assignedToMe('head-1'));
    });

    it('does not narrow to the caller unless mine=true', async () => {
      await service.findAll(asUser(UserRole.PROGRAMMING_HEAD, 'head-1'), {} as any);

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.AND).toBeUndefined();
    });

    it('keeps the mine filter alongside a search, instead of overwriting it', async () => {
      await service.findAll(
        asUser(UserRole.PROGRAMMING_HEAD, 'head-1'),
        { mine: true, search: 'فاتورة' } as any,
      );

      const [filters, mine] = prisma.ticket.findMany.mock.calls[0][0].where.AND;
      expect(filters.OR).toEqual([
        { title: { contains: 'فاتورة', mode: 'insensitive' } },
        { description: { contains: 'فاتورة', mode: 'insensitive' } },
      ]);
      expect(mine).toEqual(assignedToMe('head-1'));
    });

    it('matches a ticket by its BRM code in search', async () => {
      await service.findAll(
        asUser(UserRole.PROGRAMMING_HEAD),
        { search: 'BRM-0124' } as any,
      );

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { title: { contains: 'BRM-0124', mode: 'insensitive' } },
        { description: { contains: 'BRM-0124', mode: 'insensitive' } },
        { ticketNumber: 124 },
      ]);
    });
  });

  describe('findAll — developerId filter', () => {
    const assignedTo = (id: string) => ({
      assignments: { some: { developerId: id, isActive: true } },
    });

    it('keeps tickets with an active assignment to that developer', async () => {
      await service.findAll(
        asUser(UserRole.PROGRAMMING_HEAD),
        { developerId: 'dev-1' } as any,
      );

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.assignments).toEqual(assignedTo('dev-1').assignments);
    });

    it('keeps the developer filter alongside a search, instead of overwriting it', async () => {
      await service.findAll(
        asUser(UserRole.PROGRAMMING_HEAD),
        { developerId: 'dev-1', search: 'فاتورة' } as any,
      );

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.assignments).toEqual(assignedTo('dev-1').assignments);
      expect(where.OR).toEqual([
        { title: { contains: 'فاتورة', mode: 'insensitive' } },
        { description: { contains: 'فاتورة', mode: 'insensitive' } },
      ]);
    });
  });
});
