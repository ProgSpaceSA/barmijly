import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ApproveTicketDto, ApprovalDecision } from './dto/approve-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { TicketStatus, UserRole, NotificationType } from '@prisma/client';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private audit: AuditService,
  ) {}

  async findAll(user: any, filters: FilterTicketsDto) {
    const page = parseInt(filters.page || '1');
    const limit = parseInt(filters.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {
      isArchived: filters.isArchived ?? false,
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
    };

    if (user.role === UserRole.TICKET_REQUESTER) {
      where.creatorId = user.id;
    } else if (user.role === UserRole.DEVELOPER) {
      where.assignments = { some: { developerId: user.id, isActive: true } };
    } else if (user.role === UserRole.SYSTEM_OWNER) {
      where.companyId = user.companyId;
    }

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
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
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
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
          where: user.role === UserRole.TICKET_REQUESTER ? { visibility: 'PUBLIC' } : {},
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
            attachments: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        assignments: { include: { developer: { select: { id: true, firstName: true, lastName: true } } } },
        approvals: { include: { approver: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.enforceVisibility(ticket, user);
    return ticket;
  }

  async create(dto: CreateTicketDto, user: any) {
    const ticket = await this.prisma.ticket.create({
      data: { ...dto, creatorId: user.id, status: TicketStatus.DRAFT },
    });
    await this.audit.log({ action: 'CREATE', entity: 'Ticket', entityId: ticket.id, userId: user.id, newValues: dto });
    return ticket;
  }

  async submit(id: string, user: any) {
    const ticket = await this.getOwnedTicket(id, user);
    if (ticket.status !== TicketStatus.DRAFT) throw new BadRequestException('Only draft tickets can be submitted');

    const updated = await this.changeStatus(ticket, TicketStatus.NEW, user.id);

    const heads = await this.prisma.user.findMany({ where: { role: UserRole.PROGRAMMING_HEAD, isActive: true } });
    if (heads.length > 0) {
      await this.notifications.notifyMany(heads.map((h) => h.id), {
        type: NotificationType.TICKET_CREATED,
        title: 'New ticket awaiting review',
        body: `Ticket "${ticket.title}" has been submitted`,
        ticketId: id,
      });
    }
    return updated;
  }

  async update(id: string, dto: UpdateTicketDto, user: any) {
    const ticket = await this.getOwnedTicket(id, user);
    const editableStatuses: string[] = [TicketStatus.DRAFT, TicketStatus.AWAITING_INFO];
    if (!editableStatuses.includes(ticket.status)) {
      throw new BadRequestException('Ticket cannot be edited in current status');
    }
    const updated = await this.prisma.ticket.update({ where: { id }, data: dto });
    await this.audit.log({ action: 'UPDATE', entity: 'Ticket', entityId: id, userId: user.id, newValues: dto });
    return updated;
  }

  async approve(id: string, dto: ApproveTicketDto, user: any) {
    this.requireRole(user, [UserRole.PROGRAMMING_HEAD]);
    const ticket = await this.findById(id);

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

    const [updated] = await Promise.all([
      this.changeStatus(ticket, newStatus, user.id, dto.notes),
      this.prisma.ticketApproval.create({
        data: { ticketId: id, approverId: user.id, decision: dto.decision, notes: dto.notes, conditions: dto.conditions },
      }),
    ]);

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
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD]);
    const ticket = await this.findById(id);
    if (ticket.status !== TicketStatus.APPROVED) throw new BadRequestException('Only approved tickets can be assigned');

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

    await this.notifications.notify(developerId, {
      type: NotificationType.TICKET_ASSIGNED,
      title: 'New ticket assigned to you',
      body: `Ticket "${ticket.title}" has been assigned to you`,
      ticketId: id,
    });

    return this.findById(id);
  }

  async startWork(id: string, user: any) {
    this.requireRole(user, [UserRole.DEVELOPER]);
    const ticket = await this.findById(id);
    const assignment = await this.prisma.ticketAssignment.findFirst({
      where: { ticketId: id, developerId: user.id, isActive: true },
    });
    if (!assignment) throw new ForbiddenException('You are not assigned to this ticket');
    if (ticket.status !== TicketStatus.SCHEDULED) throw new BadRequestException('Ticket is not scheduled');
    return this.changeStatus(ticket, TicketStatus.IN_PROGRESS, user.id);
  }

  async submitForTesting(id: string, user: any) {
    this.requireRole(user, [UserRole.DEVELOPER]);
    const ticket = await this.findById(id);
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

  async approveCompletion(id: string, user: any) {
    const ticket = await this.findById(id);
    const awaitingStatuses: string[] = [TicketStatus.AWAITING_TESTING, TicketStatus.AWAITING_OWNER_APPROVAL];
    if (!awaitingStatuses.includes(ticket.status)) {
      throw new BadRequestException('Ticket is not awaiting testing/approval');
    }

    if (user.role === UserRole.QA) {
      return this.changeStatus(ticket, TicketStatus.AWAITING_OWNER_APPROVAL, user.id);
    }

    if (user.role === UserRole.TICKET_REQUESTER && ticket.creatorId !== user.id) {
      throw new ForbiddenException('Not your ticket');
    }

    return this.changeStatus(ticket, TicketStatus.COMPLETED, user.id);
  }

  async close(id: string, dto: CloseTicketDto, user: any) {
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD]);
    const ticket = await this.findById(id);
    if (ticket.status !== TicketStatus.COMPLETED) throw new BadRequestException('Ticket must be completed before closing');
    return this.prisma.ticket.update({ where: { id }, data: { status: TicketStatus.CLOSED, closureNotes: dto.closureNotes } });
  }

  async archive(id: string, user: any) {
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD]);
    await this.findById(id);
    return this.prisma.ticket.update({ where: { id }, data: { isArchived: true } });
  }

  async reopen(id: string, user: any) {
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD]);
    const ticket = await this.findById(id);
    const reopenableStatuses: string[] = [TicketStatus.CLOSED, TicketStatus.REJECTED];
    if (!reopenableStatuses.includes(ticket.status)) {
      throw new BadRequestException('Only closed or rejected tickets can be reopened');
    }
    return this.changeStatus(ticket, TicketStatus.NEW, user.id, 'Reopened');
  }

  async duplicate(id: string, user: any) {
    const ticket = await this.findById(id);
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

  private async changeStatus(ticket: any, toStatus: TicketStatus, userId: string, reason?: string) {
    const [updated] = await Promise.all([
      this.prisma.ticket.update({ where: { id: ticket.id }, data: { status: toStatus } }),
      this.prisma.ticketStatusHistory.create({
        data: { ticketId: ticket.id, fromStatus: ticket.status, toStatus, changedById: userId, reason },
      }),
    ]);
    return updated;
  }

  private async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async getOwnedTicket(id: string, user: any) {
    const ticket = await this.findById(id);
    const managerRoles: string[] = [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER];
    if (ticket.creatorId !== user.id && !managerRoles.includes(user.role)) {
      throw new ForbiddenException('Access denied');
    }
    return ticket;
  }

  private enforceVisibility(ticket: any, user: any) {
    const allowedRoles: string[] = [
      UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER,
      UserRole.QA, UserRole.SENIOR_MANAGEMENT,
    ];
    if (allowedRoles.includes(user.role)) return;
    if (ticket.creatorId !== user.id && ticket.companyId !== user.companyId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private requireRole(user: any, roles: UserRole[]) {
    if (!(roles as string[]).includes(user.role)) throw new ForbiddenException('Insufficient permissions');
  }
}
