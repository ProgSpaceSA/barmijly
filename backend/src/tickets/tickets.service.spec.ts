import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TicketStatus, UserRole } from '@prisma/client';
import { TicketsService } from './tickets.service';
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
  ...overrides,
});

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
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketApproval: { create: jest.fn().mockResolvedValue({}) },
      ticketComment: { create: jest.fn().mockResolvedValue({}) },
      ticketAssignment: {
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
      },
      ticketTask: {
        create: jest.fn().mockResolvedValue({ id: 'task-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
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
      system: { findUnique: jest.fn().mockResolvedValue({ id: 'system-1', companyId: 'company-1', isActive: true }), findMany: jest.fn().mockResolvedValue([]) },
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

      expect(notifications.notify).toHaveBeenCalledWith(CREATOR_ID, expect.objectContaining({ ticketId: TICKET_ID }));
    });
  });

  describe('assign — no development before approval', () => {
    const assignment = { developerId: 'dev-1' } as any;

    it.each([
      UserRole.DEVELOPER,
      UserRole.QA,
      UserRole.TICKET_REQUESTER,
      UserRole.SYSTEM_OWNER,
      UserRole.SENIOR_MANAGEMENT,
    ])('refuses assignment by %s', async (role) => {
      currentTicket(ticketAt(TicketStatus.APPROVED));

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
      currentTicket(ticketAt(TicketStatus.APPROVED));

      await service.assign(TICKET_ID, assignment, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketAssignment.updateMany).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, isActive: true },
        data: { isActive: false },
      });
      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { status: TicketStatus.SCHEDULED },
      });
      expect(notifications.notify).toHaveBeenCalledWith('dev-1', expect.objectContaining({ ticketId: TICKET_ID }));
    });

    it('creates a task named after the ticket for the assigned developer', async () => {
      currentTicket(ticketAt(TicketStatus.APPROVED));

      await service.assign(
        TICKET_ID,
        { developerId: 'dev-1', estimatedDeadline: '2026-09-01T00:00:00.000Z' } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticketTask.create).toHaveBeenCalledWith({
        data: {
          ticketId: TICKET_ID,
          title: 'تعديل شاشة الفواتير',
          assignedToId: 'dev-1',
          createdById: 'actor-1',
          dueDate: new Date('2026-09-01T00:00:00.000Z'),
        },
      });
    });

    it('does not duplicate the task when the same developer is re-assigned', async () => {
      currentTicket(ticketAt(TicketStatus.APPROVED));
      prisma.ticketTask.findFirst.mockResolvedValue({ id: 'task-1' });

      await service.assign(TICKET_ID, assignment, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketTask.create).not.toHaveBeenCalled();
    });
  });

  describe('developer transitions', () => {
    it('refuses startWork for a developer who is not assigned', async () => {
      currentTicket(ticketAt(TicketStatus.SCHEDULED));
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect(service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER))).rejects.toThrow(ForbiddenException);
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
        data: { status: TicketStatus.IN_PROGRESS },
      });
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
      expect(notifications.notify).toHaveBeenCalledWith(CREATOR_ID, expect.objectContaining({ ticketId: TICKET_ID }));
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
        data: { status: TicketStatus.COMPLETED },
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
        data: { status: TicketStatus.COMPLETED },
      });
    });

    it('lets a system owner in the company sign off even if they did not file the ticket', async () => {
      currentTicket(ticketAt(TicketStatus.AWAITING_OWNER_APPROVAL, { systemOwnerId: 'named-owner' }));

      await service.approveCompletion(TICKET_ID, asUser(UserRole.SYSTEM_OWNER, 'owner-all'));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { status: TicketStatus.COMPLETED },
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
        data: { status: TicketStatus.CLOSED, closureNotes: 'تم التنفيذ' },
      });
    });

    it.each([TicketStatus.CLOSED, TicketStatus.REJECTED])('reopens a %s ticket back to NEW', async (status) => {
      currentTicket(ticketAt(status));

      await service.reopen(TICKET_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticket.update).toHaveBeenCalledWith({
        where: { id: TICKET_ID },
        data: { status: TicketStatus.NEW },
      });
    });

    it('refuses to reopen a ticket that is still in flight', async () => {
      currentTicket(ticketAt(TicketStatus.IN_PROGRESS));

      await expect(service.reopen(TICKET_ID, asUser(UserRole.PROJECT_MANAGER))).rejects.toThrow(BadRequestException);
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
        data: { status: TicketStatus.NEW },
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
      );
    });
  });

  describe('status history — every change is auditable', () => {
    it.each([
      ['approve', () => service.approve(TICKET_ID, { decision: ApprovalDecision.APPROVED }, asUser(UserRole.PROGRAMMING_HEAD, 'head-1')), TicketStatus.NEW, TicketStatus.APPROVED],
      ['startWork', () => service.startWork(TICKET_ID, asUser(UserRole.DEVELOPER, 'head-1')), TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS],
      ['reopen', () => service.reopen(TICKET_ID, asUser(UserRole.PROJECT_MANAGER, 'head-1')), TicketStatus.CLOSED, TicketStatus.NEW],
    ])('%s writes a from/to history row', async (_name, act, from, to) => {
      currentTicket(ticketAt(from as TicketStatus));

      await (act as () => Promise<any>)();

      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ticketId: TICKET_ID,
          fromStatus: from,
          toStatus: to,
          changedById: 'head-1',
        }),
      });
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
  });
});
