import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { assertCan, can, LEADERSHIP } from '../access/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ApproveTicketDto, ApprovalDecision } from './dto/approve-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { ForceStatusDto } from './dto/force-status.dto';
import { Prisma, TicketStatus, UserRole, NotificationType } from '@prisma/client';
import { actionQueueStatuses } from './action-queues';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async findAll(user: any, filters: FilterTicketsDto) {
    const page = parseInt(filters.page || '1');
    const limit = parseInt(filters.limit || '20');
    const skip = (page - 1) * limit;

    // Only roles that own the archive may ask for it; everyone else is pinned
    // to live tickets no matter what they send.
    const isArchived = can(user.role, 'ticket:read-archived') ? (filters.isArchived ?? false) : false;

    const where: Prisma.TicketWhereInput = {
      isArchived,
      ...(filters.status && { status: filters.status }),
      ...(filters.type && { type: filters.type }),
      ...(filters.priority && { finalPriority: filters.priority }),
      ...(filters.systemId && { systemId: filters.systemId }),
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.creatorId && { creatorId: filters.creatorId }),
      ...(filters.developerId && {
        assignments: { some: { developerId: filters.developerId, isActive: true } },
      }),
      ...(filters.search && {
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      }),
      ...(filters.overdue && {
        estimatedDeadline: { lt: new Date() },
        status: { notIn: [TicketStatus.CLOSED, TicketStatus.COMPLETED, TicketStatus.REJECTED] },
      }),
    };

    // Assigned as the ticket developer, or given at least one task on it.
    // Uses the authenticated user — never a caller-supplied id — so "تذاكري"
    // cannot be pointed at someone else.
    const mineWhere: Prisma.TicketWhereInput | undefined = filters.mine
      ? {
          OR: [
            { assignments: { some: { developerId: user.id, isActive: true } } },
            { tasks: { some: { assignedToId: user.id } } },
          ],
        }
      : undefined;

    // AND rather than a merge: the scope must survive alongside the search OR,
    // and a caller-supplied filter must never be able to widen it.
    const scope = await this.access.ticketScope(user);
    const extra = [scope, mineWhere].filter(
      (clause): clause is Prisma.TicketWhereInput => Boolean(clause),
    );
    const scopedWhere: Prisma.TicketWhereInput = extra.length
      ? { AND: [where, ...extra] }
      : where;

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where: scopedWhere,
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } },
          system: true,
          company: true,
          assignments: {
            where: { isActive: true },
            include: { developer: { select: { id: true, firstName: true, lastName: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.ticket.count({ where: scopedWhere }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findMyCreated(user: any) {
    // Personal queue for the dashboard hub. Same action buckets as the daily
    // digest, plus tickets the user filed or owns — a project manager rarely
    // files the ticket, but they still have to assign it.
    const scope = await this.access.ticketScope(user);
    const queueStatuses = actionQueueStatuses(user.role);
    const mine: Prisma.TicketWhereInput[] = [
      { creatorId: user.id },
      { systemOwnerId: user.id },
      ...(queueStatuses.length ? [{ status: { in: queueStatuses } }] : []),
    ];

    const where: Prisma.TicketWhereInput = {
      isArchived: false,
      AND: [...(scope ? [scope] : []), { OR: mine }],
    };

    const [tickets, unreadGroups] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        select: {
          id: true, title: true, ticketNumber: true, status: true,
          updatedAt: true, estimatedDeadline: true, priority: true, finalPriority: true,
          company: { select: { id: true, name: true, logoUrl: true } },
          system:  { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.notification.groupBy({
        by: ['ticketId'],
        where: { userId: user.id, isRead: false, ticketId: { not: null } },
        _count: { _all: true },
      }),
    ]);

    const unreadByTicket = new Map(
      unreadGroups.map(n => [n.ticketId, n._count._all])
    );

    return tickets.map(t => ({
      ...t,
      hasUpdates: (unreadByTicket.get(t.id) ?? 0) > 0,
      unreadCount: unreadByTicket.get(t.id) ?? 0,
    }));
  }

  async findOne(id: string, user: any) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        creator: true,
        systemOwner: true,
        system: true,
        company: true,
        comments: {
          // INTERNAL threads are for the programming team (req.md §12) — the
          // filter is applied in the query so they never reach the client.
          where: this.access.commentVisibilityWhere(user),
          include: {
            author: { select: { id: true, firstName: true, lastName: true, role: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { id: true, firstName: true, lastName: true } } } },
        assignments: { include: { developer: { select: { id: true, firstName: true, lastName: true } } } },
        approvals: { include: { approver: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.access.assertCanViewTicket(id, user);
    return ticket;
  }

  async create(dto: CreateTicketDto, user: any) {
    assertCan(user, 'ticket:create');
    await this.access.assertCanFileAgainst(dto.systemId, dto.companyId, user);

    const ticket = await this.prisma.ticket.create({
      data: {
        ...dto,
        reason: dto.reason ?? '',
        expectedOutcome: dto.expectedOutcome ?? '',
        businessImpact: dto.businessImpact ?? '',
        creatorId: user.id,
        status: TicketStatus.DRAFT,
      },
    });
    await this.audit.log({ action: 'CREATE', entity: 'Ticket', entityId: ticket.id, userId: user.id, newValues: dto });
    return ticket;
  }

  async submit(id: string, user: any) {
    assertCan(user, 'ticket:submit');
    const ticket = await this.getOwnedTicket(id, user);
    const submittableStatuses: TicketStatus[] = [TicketStatus.DRAFT, TicketStatus.AWAITING_INFO];
    if (!submittableStatuses.includes(ticket.status))
      throw new BadRequestException('Only draft or awaiting-info tickets can be submitted');

    const updated = await this.changeStatus(ticket, TicketStatus.NEW, user.id);

    const reviewers = await this.prisma.user.findMany({
      where: { role: { in: [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER] }, isActive: true },
    });
    if (reviewers.length > 0) {
      await this.notifications.notifyMany(reviewers.map((r) => r.id), {
        type: NotificationType.TICKET_CREATED,
        title: 'تذكرة جديدة تنتظر المراجعة',
        body: `تم تقديم التذكرة "${ticket.title}"`,
        ticketId: id,
      });
    }
    return updated;
  }

  async update(id: string, dto: UpdateTicketDto, user: any) {
    assertCan(user, 'ticket:update');
    const ticket = await this.getOwnedTicket(id, user);
    const editableStatuses: string[] = [TicketStatus.DRAFT, TicketStatus.AWAITING_INFO];
    if (!editableStatuses.includes(ticket.status)) {
      throw new BadRequestException('Ticket cannot be edited in current status');
    }

    // Re-target only within reach: moving a ticket is the same authorisation
    // question as filing one.
    if (dto.systemId || dto.companyId) {
      await this.access.assertCanFileAgainst(
        dto.systemId ?? ticket.systemId,
        dto.companyId ?? ticket.companyId,
        user,
      );
    }

    const updated = await this.prisma.ticket.update({ where: { id }, data: dto });
    await this.audit.log({ action: 'UPDATE', entity: 'Ticket', entityId: id, userId: user.id, newValues: dto });
    return updated;
  }

  async approve(id: string, dto: ApproveTicketDto, user: any) {
    assertCan(user, 'ticket:approve');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    const approvableStatuses: string[] = [TicketStatus.NEW, TicketStatus.AWAITING_APPROVAL];
    if (!approvableStatuses.includes(ticket.status)) {
      throw new BadRequestException('Ticket is not pending approval');
    }

    let newStatus: TicketStatus;
    switch (dto.decision) {
      case ApprovalDecision.APPROVED: newStatus = TicketStatus.APPROVED; break;
      case ApprovalDecision.REJECTED: newStatus = TicketStatus.REJECTED; break;
      case ApprovalDecision.NEEDS_INFO: newStatus = TicketStatus.AWAITING_INFO; break;
      default: newStatus = TicketStatus.ON_HOLD;
    }

    const ops: Promise<any>[] = [
      this.changeStatus(ticket, newStatus, user.id, dto.notes),
      this.prisma.ticketApproval.create({
        data: { ticketId: id, approverId: user.id, decision: dto.decision, notes: dto.notes, conditions: dto.conditions },
      }),
    ];
    if (dto.notes?.trim()) {
      ops.push(
        this.prisma.ticketComment.create({
          data: { ticketId: id, authorId: user.id, content: dto.notes.trim(), visibility: 'PUBLIC', mentions: [] },
        }),
      );
    }
    const [updated] = await Promise.all(ops);

    const notifType =
      dto.decision === ApprovalDecision.APPROVED ? NotificationType.TICKET_APPROVED :
      dto.decision === ApprovalDecision.REJECTED ? NotificationType.TICKET_REJECTED :
      NotificationType.INFO_REQUESTED;

    await this.notifications.notify(ticket.creatorId, {
      type: notifType,
      title: `Ticket ${dto.decision.toLowerCase()}`,
      body: `Your ticket "${ticket.title}" has been ${dto.decision.toLowerCase()}`,
      ticketId: id,
    });

    return updated;
  }

  async assign(id: string, dto: AssignTicketDto, user: any) {
    assertCan(user, 'ticket:assign');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    if (ticket.status !== TicketStatus.APPROVED) throw new BadRequestException('Only approved tickets can be assigned');
    // Without this an assignment can hand execution rights to any account id,
    // including one with no reach into this ticket's system or company.
    await this.access.assertIsAssignableDeveloper(dto.developerId, ticket);

    await this.prisma.ticketAssignment.updateMany({ where: { ticketId: id, isActive: true }, data: { isActive: false } });

    const { developerId, estimatedHours, startDate, estimatedDeadline, difficultyLevel, finalPriority, ...ticketUpdates } = dto;

    await Promise.all([
      this.prisma.ticketAssignment.create({
        data: {
          ticketId: id,
          developerId,
          estimatedHours,
          startDate: startDate ? new Date(startDate) : undefined,
          estimatedDeadline: estimatedDeadline ? new Date(estimatedDeadline) : undefined,
        },
      }),
      this.prisma.ticket.update({
        where: { id },
        data: {
          difficultyLevel,
          finalPriority,
          estimatedHours,
          estimatedDeadline: estimatedDeadline ? new Date(estimatedDeadline) : undefined,
          ...ticketUpdates,
        },
      }),
      this.changeStatus(ticket, TicketStatus.SCHEDULED, user.id),
    ]);

    // Mirror the ticket as a task for the developer, unless one already exists
    const existingTask = await this.prisma.ticketTask.findFirst({
      where: { ticketId: id, assignedToId: developerId, title: ticket.title },
    });
    if (!existingTask) {
      await this.prisma.ticketTask.create({
        data: {
          ticketId: id,
          title: ticket.title,
          assignedToId: developerId,
          createdById: user.id,
          ...(estimatedDeadline ? { dueDate: new Date(estimatedDeadline) } : {}),
        },
      });
    }

    await this.notifications.notify(developerId, {
      type: NotificationType.TICKET_ASSIGNED,
      title: 'New ticket assigned to you',
      body: `Ticket "${ticket.title}" has been assigned to you`,
      ticketId: id,
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
    const developer = await this.prisma.user.findUnique({
      where: { id: developerId },
      select: { email: true, firstName: true },
    });
    if (developer?.email) {
      this.email.sendTicketAssigned(
        developer.email,
        developer.firstName,
        ticket.title,
        `${frontendUrl}/tickets/${id}`,
        `${user.firstName} ${user.lastName}`,
      );
    }

    return this.findById(id);
  }

  async startWork(id: string, user: any) {
    assertCan(user, 'ticket:start');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    const assignment = await this.prisma.ticketAssignment.findFirst({
      where: { ticketId: id, developerId: user.id, isActive: true },
    });
    if (!assignment) throw new ForbiddenException('You are not assigned to this ticket');
    if (ticket.status !== TicketStatus.SCHEDULED) throw new BadRequestException('Ticket is not scheduled');
    return this.changeStatus(ticket, TicketStatus.IN_PROGRESS, user.id);
  }

  async submitForTesting(id: string, user: any) {
    assertCan(user, 'ticket:submit-testing');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    const assignment = await this.prisma.ticketAssignment.findFirst({
      where: { ticketId: id, developerId: user.id, isActive: true },
    });
    if (!assignment) throw new ForbiddenException('You are not assigned to this ticket');
    if (ticket.status !== TicketStatus.IN_PROGRESS) throw new BadRequestException('Ticket is not in progress');

    const updated = await this.changeStatus(ticket, TicketStatus.AWAITING_TESTING, user.id);
    await this.notifications.notify(ticket.creatorId, {
      type: NotificationType.EXECUTION_COMPLETED,
      title: 'Ticket ready for testing',
      body: `Ticket "${ticket.title}" is ready for your review`,
      ticketId: id,
    });
    return updated;
  }

  /**
   * Two different transitions behind one endpoint, each with its own gate:
   * AWAITING_TESTING moves on the tester's word, AWAITING_OWNER_APPROVAL on the
   * business side (req.md §3: الطالب أو مالك النظام). A developer holds
   * neither, so they can never sign off on their own delivery.
   */
  async approveCompletion(id: string, user: any) {
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    if (ticket.status === TicketStatus.AWAITING_TESTING) {
      assertCan(user, 'ticket:verify-testing');
      return this.changeStatus(ticket, TicketStatus.AWAITING_OWNER_APPROVAL, user.id);
    }

    if (ticket.status === TicketStatus.AWAITING_OWNER_APPROVAL) {
      assertCan(user, 'ticket:accept-delivery');
      // Leadership can stand in for an absent owner. The requester and the
      // named system owner always can. Any SYSTEM_OWNER who can already see
      // the ticket (company / system portfolio) can too — "مالك النظام" is
      // the role, not only the user id stored on the row.
      const isLeadership = (LEADERSHIP as string[]).includes(user.role);
      const isOwnerSide =
        ticket.creatorId === user.id ||
        ticket.systemOwnerId === user.id ||
        user.role === UserRole.SYSTEM_OWNER;
      if (!isLeadership && !isOwnerSide) throw new ForbiddenException('Not your ticket');
      return this.changeStatus(ticket, TicketStatus.COMPLETED, user.id);
    }

    throw new BadRequestException('Ticket is not awaiting testing/approval');
  }

  async close(id: string, dto: CloseTicketDto, user: any) {
    assertCan(user, 'ticket:close');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    if (ticket.status !== TicketStatus.COMPLETED) throw new BadRequestException('Ticket must be completed before closing');
    return this.prisma.ticket.update({ where: { id }, data: { status: TicketStatus.CLOSED, closureNotes: dto.closureNotes } });
  }

  async archive(id: string, user: any) {
    assertCan(user, 'ticket:archive');
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    return this.prisma.ticket.update({ where: { id }, data: { isArchived: true } });
  }

  async unarchive(id: string, user: any) {
    assertCan(user, 'ticket:archive');
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    return this.prisma.ticket.update({ where: { id }, data: { isArchived: false } });
  }

  async reopen(id: string, user: any) {
    assertCan(user, 'ticket:reopen');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    const reopenableStatuses: string[] = [TicketStatus.CLOSED, TicketStatus.REJECTED];
    if (!reopenableStatuses.includes(ticket.status)) {
      throw new BadRequestException('Only closed or rejected tickets can be reopened');
    }
    return this.changeStatus(ticket, TicketStatus.NEW, user.id, 'Reopened');
  }

  async duplicate(id: string, user: any) {
    assertCan(user, 'ticket:create');
    const ticket = await this.findById(id);
    // A copy reproduces the whole body, so it needs read rights on the source
    // and file rights on the target system — not just a ticket id.
    await this.access.assertCanViewTicket(id, user);
    await this.access.assertCanFileAgainst(ticket.systemId, ticket.companyId, user);

    return this.prisma.ticket.create({
      data: {
        title: `[Copy] ${ticket.title}`,
        description: ticket.description,
        reason: ticket.reason,
        expectedOutcome: ticket.expectedOutcome,
        businessImpact: ticket.businessImpact,
        hasFinancialLoss: ticket.hasFinancialLoss,
        financialLossDetails: ticket.financialLossDetails,
        type: ticket.type,
        priority: ticket.priority,
        systemId: ticket.systemId,
        companyId: ticket.companyId,
        creatorId: user.id,
        status: TicketStatus.DRAFT,
        templateId: ticket.id,
      },
    });
  }

  async forceStatus(id: string, dto: ForceStatusDto, user: any) {
    assertCan(user, 'ticket:force-status');
    const ticket = await this.findById(id);
    const updated = await this.changeStatus(ticket, dto.status, user.id, dto.reason || 'تغيير يدوي');
    await this.audit.log({ action: 'FORCE_STATUS', entity: 'Ticket', entityId: id, userId: user.id, newValues: { status: dto.status, reason: dto.reason } });
    return updated;
  }

  private async changeStatus(ticket: any, toStatus: TicketStatus, userId: string, reason?: string) {
    const [updated] = await Promise.all([
      this.prisma.ticket.update({ where: { id: ticket.id }, data: { status: toStatus } }),
      this.prisma.ticketStatusHistory.create({
        data: { ticketId: ticket.id, fromStatus: ticket.status, toStatus, changedById: userId, reason },
      }),
    ]);

    // Notify ticket creator by email
    const creator = await this.prisma.user.findUnique({ where: { id: ticket.creatorId }, select: { email: true } });
    if (creator?.email) {
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://barmijly.ai');
      this.email.sendStatusUpdate(creator.email, ticket.title, toStatus, `${frontendUrl}/tickets/${ticket.id}`);
    }

    return updated;
  }

  private async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  /** The creator, or leadership acting on their behalf. */
  private async getOwnedTicket(id: string, user: any) {
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    if (ticket.creatorId !== user.id && !(LEADERSHIP as string[]).includes(user.role)) {
      throw new ForbiddenException('Access denied');
    }
    return ticket;
  }
}
