import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
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
import { TicketStatus, UserRole, NotificationType } from '@prisma/client';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private email: EmailService,
    private config: ConfigService,
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
      const [userSystems, userCompanies] = await Promise.all([
        this.prisma.userSystem.findMany({ where: { userId: user.id }, select: { systemId: true } }),
        this.prisma.userCompany.findMany({ where: { userId: user.id }, select: { companyId: true } }),
      ]);
      const systemIds = userSystems.map(us => us.systemId);
      const companyIds = userCompanies.map(uc => uc.companyId);
      where.OR = [
        { assignments: { some: { developerId: user.id, isActive: true } } },
        { tasks:       { some: { assignedToId: user.id } } },
        { comments:    { some: { mentions: { hasSome: [user.id] } } } },
        ...(systemIds.length  ? [{ systemId:  { in: systemIds  } }] : []),
        ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
      ];
      delete where.assignments;
    } else if (user.role === UserRole.SYSTEM_OWNER) {
      const userCompanies = await this.prisma.userCompany.findMany({ where: { userId: user.id }, select: { companyId: true } });
      const companyIds = userCompanies.map(uc => uc.companyId);
      where.companyId = { in: companyIds };
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
        statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: { select: { id: true, firstName: true, lastName: true } } } },
        assignments: { include: { developer: { select: { id: true, firstName: true, lastName: true } } } },
        approvals: { include: { approver: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.enforceVisibility(ticket, user);
    return ticket;
  }

  async create(dto: CreateTicketDto, user: any) {
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

    const isManagerRole = user.role === UserRole.PROJECT_MANAGER || user.role === UserRole.PROGRAMMING_HEAD;

    // QA or manager confirming the testing step → move to owner approval
    if (user.role === UserRole.QA || (isManagerRole && ticket.status === TicketStatus.AWAITING_TESTING)) {
      return this.changeStatus(ticket, TicketStatus.AWAITING_OWNER_APPROVAL, user.id);
    }

    // Manager can also confirm the owner approval step → COMPLETED
    if (isManagerRole && ticket.status === TicketStatus.AWAITING_OWNER_APPROVAL) {
      return this.changeStatus(ticket, TicketStatus.COMPLETED, user.id);
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
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT]);
    await this.findById(id);
    return this.prisma.ticket.update({ where: { id }, data: { isArchived: true } });
  }

  async unarchive(id: string, user: any) {
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT]);
    await this.findById(id);
    return this.prisma.ticket.update({ where: { id }, data: { isArchived: false } });
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

  async forceStatus(id: string, dto: ForceStatusDto, user: any) {
    this.requireRole(user, [UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT]);
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

  private async getOwnedTicket(id: string, user: any) {
    const ticket = await this.findById(id);
    const managerRoles: string[] = [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER];
    if (ticket.creatorId !== user.id && !managerRoles.includes(user.role)) {
      throw new ForbiddenException('Access denied');
    }
    return ticket;
  }

  private async enforceVisibility(ticket: any, user: any) {
    const allowedRoles: string[] = [
      UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER,
      UserRole.QA, UserRole.SENIOR_MANAGEMENT,
    ];
    if (allowedRoles.includes(user.role)) return;
    const userCompanies = await this.prisma.userCompany.findMany({ where: { userId: user.id }, select: { companyId: true } });
    const companyIds = userCompanies.map(uc => uc.companyId);
    if (ticket.creatorId !== user.id && !companyIds.includes(ticket.companyId)) {
      throw new ForbiddenException('Access denied');
    }
  }

  private requireRole(user: any, roles: UserRole[]) {
    if (!(roles as string[]).includes(user.role)) throw new ForbiddenException('Insufficient permissions');
  }
}
