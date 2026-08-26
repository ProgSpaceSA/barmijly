import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException,
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
import { UpdateTicketPlanDto } from './dto/update-ticket-plan.dto';
import { FilterTicketsDto } from './dto/filter-tickets.dto';
import { CloseTicketDto } from './dto/close-ticket.dto';
import { ForceStatusDto } from './dto/force-status.dto';
import { Prisma, TicketStatus, TicketDependencyType, UserRole, NotificationType } from '@prisma/client';
import { actionQueueStatuses } from './action-queues';
import {
  BLOCKABLE_STATUSES, OPEN_TASK_STATUSES, TERMINAL_STATUSES,
  actualHours, resumeTargetFrom, workClockFields,
} from './transitions';
import { collectTimelineUserIds, collectTimelineTicketIds, collectTimelineTaskIds, enrichTaskTimelineBags, resolveTimelineSubjects, resolveTimelineRelation, type TimelinePerson, type TimelineTicketRef } from './timeline';
import { parseAuditBag } from './audit-bag';
import { AssignmentSyncService } from './assignment-sync.service';
import { assertNoOpenTasks } from './task-gate';
import { PauseTicketDto, ResumeTicketDto } from './dto/pause-ticket.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import {
  PREREQUISITE_SATISFIED_STATUSES, assertPrerequisitesMet, loadDependencyEdges, wouldCreateCycle,
} from './dependencies';
import { parseTicketNumberQuery } from './ticket-code';

@Injectable()
export class TicketsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private email: EmailService,
    private assignments: AssignmentSyncService,
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
      ...(filters.search && (() => {
        const or: Prisma.TicketWhereInput[] = [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ];
        const ticketNumber = parseTicketNumberQuery(filters.search);
        if (ticketNumber != null) or.push({ ticketNumber });
        return { OR: or };
      })()),
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
        _count: { select: { tasks: { where: { status: { in: OPEN_TASK_STATUSES } } } } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.access.assertCanViewTicket(id, user);

    const taskDifficulty = await this.prisma.ticketTask.aggregate({
      where: { ticketId: id, difficultyLevel: { not: null } },
      _avg: { difficultyLevel: true },
      _count: { difficultyLevel: true },
    });
    const effectiveDifficultyLevel =
      taskDifficulty._count.difficultyLevel > 0 && taskDifficulty._avg.difficultyLevel != null
        ? Math.round(taskDifficulty._avg.difficultyLevel)
        : ticket.difficultyLevel;

    // Mention chips resolve by name against a user list. People already stored
    // on `mentions` must stay resolvable even if they later leave the picker.
    const rawComments = ticket.comments ?? [];
    const mentionIds = [
      ...new Set(rawComments.flatMap((c) => c.mentions ?? [])),
    ];
    const mentionedRows =
      mentionIds.length === 0
        ? []
        : await this.prisma.user.findMany({
            where: { id: { in: mentionIds } },
            select: { id: true, firstName: true, lastName: true, role: true, email: true },
          });
    const mentionedById = new Map(mentionedRows.map((u) => [u.id, u]));
    const comments = rawComments.map((c) => ({
      ...c,
      mentionedUsers: (c.mentions ?? [])
        .map((mid) => mentionedById.get(mid))
        .filter((u): u is (typeof mentionedRows)[number] => !!u),
    }));

    return {
      ...ticket,
      comments,
      // Tasks are the finer-grained truth once they exist; the ticket-level
      // number is what leadership planned before the work was broken down.
      effectiveEstimatedHours: ticket.tasksEstimatedHours ?? ticket.estimatedHours,
      effectiveDifficultyLevel,
      openTaskCount: ticket._count.tasks,
      // Derived from the history already loaded above, so paused time never
      // counts as work time.
      actualHours: actualHours(ticket.statusHistory, ticket.startedAt, ticket.completedAt, new Date()),
    };
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
    await this.audit.log({ action: 'CREATE', entity: 'Ticket', entityId: ticket.id, ticketId: ticket.id, userId: user.id, newValues: dto });
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
      }, user.id);
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
    await this.audit.log({ action: 'UPDATE', entity: 'Ticket', entityId: id, ticketId: id, userId: user.id, newValues: dto });
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
      this.changeStatus(ticket, newStatus, user.id, { reason: dto.notes }),
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

    const approvalCopy: Record<ApprovalDecision, { title: string; body: string }> = {
      [ApprovalDecision.APPROVED]: {
        title: 'تم اعتماد التذكرة',
        body: `تم اعتماد تذكرتك «${ticket.title}»`,
      },
      [ApprovalDecision.REJECTED]: {
        title: 'تم رفض التذكرة',
        body: `تم رفض تذكرتك «${ticket.title}»`,
      },
      [ApprovalDecision.NEEDS_INFO]: {
        title: 'طُلبت معلومات إضافية',
        body: `طُلبت معلومات إضافية على تذكرتك «${ticket.title}»`,
      },
      [ApprovalDecision.CONVERT_TO_PROJECT]: {
        title: 'تحويل التذكرة إلى مشروع',
        body: `تم تحويل تذكرتك «${ticket.title}» إلى مشروع`,
      },
    };
    const copy = approvalCopy[dto.decision];

    await this.notifications.notify(ticket.creatorId, {
      type: notifType,
      title: copy.title,
      body: copy.body,
      ticketId: id,
    }, user.id);

    return updated;
  }

  async updatePlan(id: string, dto: UpdateTicketPlanDto, user: any) {
    const canFullPlan = can(user.role, 'ticket:assign');
    const canEstimateOnly = can(user.role, 'ticket:update-estimate');
    if (!canFullPlan && !canEstimateOnly) {
      assertCan(user, 'ticket:assign');
    }

    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    const locked: TicketStatus[] = [
      TicketStatus.DRAFT,
      TicketStatus.NEW,
      TicketStatus.AWAITING_APPROVAL,
      TicketStatus.AWAITING_INFO,
      TicketStatus.REJECTED,
      TicketStatus.COMPLETED,
      TicketStatus.CLOSED,
    ];
    if (locked.includes(ticket.status)) {
      throw new BadRequestException('لا يمكن تعديل خطة التذكرة في هذه الحالة');
    }

    // Developers revise the effort estimate; dates and scheduling stay with
    // whoever can assign. They must already be on the active roster.
    if (!canFullPlan) {
      const onTicket = await this.prisma.ticketAssignment.findFirst({
        where: { ticketId: id, developerId: user.id, isActive: true },
      });
      if (!onTicket) {
        throw new ForbiddenException('يمكنك تعديل تقدير التذاكر المسندة إليك فقط');
      }
      if (dto.scheduledStart !== undefined || dto.estimatedDeadline !== undefined) {
        throw new ForbiddenException('يمكنك تعديل التقدير فقط');
      }
    }

    const data: Record<string, unknown> = {};
    if (canFullPlan && dto.scheduledStart !== undefined) {
      data.scheduledStart = dto.scheduledStart ? new Date(dto.scheduledStart) : null;
    }
    if (canFullPlan && dto.estimatedDeadline !== undefined) {
      data.estimatedDeadline = dto.estimatedDeadline ? new Date(dto.estimatedDeadline) : null;
    }
    if (dto.estimatedHours !== undefined) data.estimatedHours = dto.estimatedHours;
    if (dto.difficultyLevel !== undefined) data.difficultyLevel = dto.difficultyLevel;

    const planAuditValue = (key: string, value: unknown) => {
      if ((key === 'scheduledStart' || key === 'estimatedDeadline') && value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
      return value ?? null;
    };
    const oldValues: Record<string, unknown> = {};
    for (const key of Object.keys(data)) {
      oldValues[key] = planAuditValue(key, ticket[key as keyof typeof ticket]);
    }
    const newValues = Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, planAuditValue(key, value)]),
    );

    await this.prisma.ticket.update({ where: { id }, data });
    await this.audit.log({
      action: 'PLAN_UPDATED',
      entity: 'Ticket',
      entityId: id,
      userId: user.id,
      ticketId: id,
      oldValues,
      newValues,
    });

    return this.findOne(id, user);
  }

  async assign(id: string, dto: AssignTicketDto, user: any) {
    assertCan(user, 'ticket:assign');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    if (ticket.status !== TicketStatus.APPROVED) throw new BadRequestException('Only approved tickets can be assigned');

    const {
      developerIds: dtoDeveloperIds, leadDeveloperId, finalPriority, ...ticketUpdates
    } = dto;

    const activeAssignees = await this.assignments.listAssignees(id);
    const roster = dtoDeveloperIds?.length
      ? [...new Set(dtoDeveloperIds)]
      : activeAssignees.map((a) => a.developerId);

    if (!roster.length) {
      throw new BadRequestException('أضف مطوراً إلى فريق العمل أولاً');
    }

    if (!ticket.estimatedDeadline) {
      throw new BadRequestException('حدّد تاريخ التسليم المتوقع أولاً');
    }

    const existingLead = activeAssignees.find((a) => a.isLead);
    const leadId = leadDeveloperId ?? existingLead?.developerId ?? roster[0];
    if (!roster.includes(leadId)) {
      throw new BadRequestException('قائد العمل يجب أن يكون ضمن فريق العمل');
    }

    if (dtoDeveloperIds?.length) {
      for (const developerId of roster) {
        await this.access.assertIsAssignableDeveloper(developerId, ticket);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dtoDeveloperIds?.length) {
        await tx.ticketAssignment.updateMany({
          where: { ticketId: id, isActive: true, developerId: { notIn: roster } },
          data: { isActive: false, isLead: false },
        });

        for (const developerId of roster) {
          await tx.ticketAssignment.upsert({
            where: { ticketId_developerId: { ticketId: id, developerId } },
            create: { ticketId: id, developerId, isActive: true },
            update: { isActive: true },
          });
        }
      }

      await this.assignments.setLead(id, leadId, tx);
    });

    // Status move only — plan fields are edited via PATCH /plan.
    await this.changeStatus(ticket, TicketStatus.SCHEDULED, user.id, {
      data: {
        finalPriority,
        ...ticketUpdates,
      },
    });

    await this.audit.log({
      action: 'ASSIGNEES_CHANGED',
      entity: 'Ticket',
      entityId: id,
      userId: user.id,
      ticketId: id,
      newValues: { developerIds: roster, leadDeveloperId: leadId },
    });

    await this.notifyAssigned(ticket, roster, leadId, user);

    return this.findById(id);
  }

  /** In-app for everyone on the roster, email for everyone but the caller. */
  private async notifyAssigned(ticket: any, roster: string[], leadId: string, user: any) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
    const scope = await this.mailScope(ticket);

    for (const developerId of roster) {
      const isLead = developerId === leadId;
      await this.notifications.notify(developerId, {
        type: NotificationType.TICKET_ASSIGNED,
        title: isLead ? 'أُسندت إليك تذكرة كقائد عمل' : 'أُسندت إليك تذكرة',
        body: isLead
          ? `أنت قائد العمل على التذكرة «${ticket.title}»`
          : `أُسندت إليك التذكرة «${ticket.title}»`,
        ticketId: ticket.id,
      }, user.id);

      if (developerId === user.id) continue;

      const developer = await this.prisma.user.findUnique({
        where: { id: developerId },
        select: { email: true, firstName: true },
      });
      if (developer?.email) {
        this.email.sendTicketAssigned(
          developer.email,
          developer.firstName,
          ticket.title,
          `${frontendUrl}/tickets/${ticket.id}`,
          `${user.firstName} ${user.lastName}`,
          ticket.ticketNumber,
          scope,
        );
      }
    }
  }

  // ---- Roster -------------------------------------------------------------
  // Assignment is not a one-shot decision at the APPROVED gate any more: people
  // join and leave a ticket while it is in flight, and the lead can change hands.

  async listAssignees(id: string, user: any) {
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    return this.assignments.listAssignees(id);
  }

  async addAssignee(id: string, developerId: string, user: any) {
    assertCan(user, 'ticket:assign');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    await this.access.assertIsAssignableDeveloper(developerId, ticket);

    const hadLead = await this.prisma.ticketAssignment.count({
      where: { ticketId: id, isActive: true, isLead: true },
    });

    await this.assignments.addAssignee(id, developerId);
    await this.audit.log({
      action: 'ASSIGNEE_ADD', entity: 'Ticket', entityId: id, userId: user.id,
      ticketId: id, newValues: { developerId },
    });
    await this.notifications.notify(developerId, {
      type: NotificationType.TICKET_ASSIGNED,
      title: hadLead === 0 ? 'أُسندت إليك تذكرة كقائد عمل' : 'أُسندت إليك تذكرة',
      body: hadLead === 0
        ? `أنت قائد العمل على التذكرة «${ticket.title}»`
        : `أُسندت إليك التذكرة «${ticket.title}»`,
      ticketId: id,
    }, user.id);

    return this.assignments.listAssignees(id);
  }

  async removeAssignee(id: string, developerId: string, user: any) {
    assertCan(user, 'ticket:assign');
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    await this.assignments.removeAssignee(id, developerId);
    await this.audit.log({
      action: 'ASSIGNEE_REMOVE', entity: 'Ticket', entityId: id, userId: user.id,
      ticketId: id, oldValues: { developerId },
    });

    return this.assignments.listAssignees(id);
  }

  async setLead(id: string, developerId: string, user: any) {
    assertCan(user, 'ticket:assign');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    await this.access.assertIsAssignableDeveloper(developerId, ticket);

    await this.prisma.$transaction((tx) => this.assignments.setLead(id, developerId, tx));
    await this.audit.log({
      action: 'LEAD_CHANGED', entity: 'Ticket', entityId: id, userId: user.id,
      ticketId: id, newValues: { leadDeveloperId: developerId },
    });
    await this.notifications.notify(developerId, {
      type: NotificationType.TICKET_ASSIGNED,
      title: 'أصبحت قائد العمل',
      body: `أنت الآن قائد العمل على التذكرة «${ticket.title}»`,
      ticketId: id,
    }, user.id);

    return this.assignments.listAssignees(id);
  }

  async startWork(id: string, user: any) {
    assertCan(user, 'ticket:start');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    // Contributors work their tasks; moving the ticket itself is the lead's call,
    // so two people cannot race the same transition.
    await this.assignments.requireLead(id, user.id);
    if (ticket.status !== TicketStatus.SCHEDULED) throw new BadRequestException('Ticket is not scheduled');
    await assertPrerequisitesMet(this.prisma, id);
    return this.changeStatus(ticket, TicketStatus.IN_PROGRESS, user.id);
  }

  async submitForTesting(id: string, user: any) {
    assertCan(user, 'ticket:submit-testing');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    await this.assignments.requireLead(id, user.id);
    if (ticket.status !== TicketStatus.IN_PROGRESS) throw new BadRequestException('Ticket is not in progress');
    await assertNoOpenTasks(this.prisma, id);
    await assertPrerequisitesMet(this.prisma, id);

    const updated = await this.changeStatus(ticket, TicketStatus.AWAITING_TESTING, user.id);
    await this.notifications.notify(ticket.creatorId, {
      type: NotificationType.EXECUTION_COMPLETED,
      title: 'التذكرة جاهزة للاختبار',
      body: `التذكرة «${ticket.title}» جاهزة للمراجعة`,
      ticketId: id,
    }, user.id);
    return updated;
  }

  /**
   * QA found issues — send the ticket back to IN_PROGRESS so developers can
   * fix them. Same gate as verify-testing; reason is required for the history.
   */
  async requestChanges(id: string, dto: { reason: string }, user: any) {
    assertCan(user, 'ticket:verify-testing');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    if (ticket.status !== TicketStatus.AWAITING_TESTING) {
      throw new BadRequestException('Ticket is not awaiting testing');
    }

    const updated = await this.changeStatus(ticket, TicketStatus.IN_PROGRESS, user.id, {
      reason: dto.reason,
    });

    await this.notifyPause(
      ticket,
      'طُلبت تعديلات',
      `طُلبت تعديلات على التذكرة «${ticket.title}»: ${dto.reason}`,
      user,
    );
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

  /**
   * Everything that has happened to this ticket, oldest first.
   *
   * The status history table only ever knew about status. Tasks being created
   * and finished, developers joining and leaving, the lead changing hands and
   * relations being drawn are all real events on the ticket, and every one of
   * them already writes an AuditLog row — so the log is the timeline, and this
   * just shapes it for reading.
   *
   * Older STATUS_CHANGE audits often omitted `ticketId` (only `entityId` was
   * set). Those rows are still included via entityId, and any status transition
   * that never got an audit row is filled in from TicketStatusHistory so the
   * activity panel does not go blank after deploy.
   */
  async timeline(id: string, user: any) {
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    const actorSelect = { id: true, firstName: true, lastName: true, role: true } as const;
    const [auditEntries, statusHistory] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { ticketId: id },
            { entity: 'Ticket', entityId: id },
          ],
        },
        include: { user: { select: actorSelect } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.ticketStatusHistory.findMany({
        where: { ticketId: id },
        include: { changedBy: { select: actorSelect } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const statusToken = (value: unknown): string =>
      typeof value === 'string' ? value : '';

    const statusTransitionKey = (
      from: unknown,
      to: unknown,
      at: Date,
    ) => `${statusToken(from)}|${statusToken(to)}|${Math.floor(at.getTime() / 1000)}`;

    // FORCE_STATUS already accounts for the move — do not also synthesize (or
    // keep) a normal STATUS_CHANGE for the same second.
    const forceToSecond = new Set(
      auditEntries
        .filter((e) => e.action === 'FORCE_STATUS')
        .map((e) => {
          const to = statusToken(parseAuditBag(e.newValues)?.status);
          return `${to}|${Math.floor(e.createdAt.getTime() / 1000)}`;
        }),
    );

    const auditsForTimeline = auditEntries.filter((e) => {
      if (e.action !== 'STATUS_CHANGE') return true;
      const to = statusToken(parseAuditBag(e.newValues)?.status);
      return !forceToSecond.has(`${to}|${Math.floor(e.createdAt.getTime() / 1000)}`);
    });

    const statusCovered = new Set(
      auditsForTimeline
        .filter((e) => e.action === 'STATUS_CHANGE' || e.action === 'FORCE_STATUS')
        .map((e) => {
          const from = parseAuditBag(e.oldValues)?.status;
          const to = parseAuditBag(e.newValues)?.status;
          return statusTransitionKey(from, to, e.createdAt);
        }),
    );

    // Legacy FORCE_STATUS rows omit oldValues — still count as covering history.
    for (const e of auditsForTimeline) {
      if (e.action !== 'FORCE_STATUS') continue;
      const to = statusToken(parseAuditBag(e.newValues)?.status);
      const second = Math.floor(e.createdAt.getTime() / 1000);
      for (const h of statusHistory) {
        if (h.toStatus === to && Math.floor(h.createdAt.getTime() / 1000) === second) {
          statusCovered.add(statusTransitionKey(h.fromStatus, h.toStatus, h.createdAt));
        }
      }
    }

    const historyOnly = statusHistory
      .filter((h) => {
        const key = statusTransitionKey(h.fromStatus, h.toStatus, h.createdAt);
        return !statusCovered.has(key);
      })
      .map((h) => ({
        id: `status-history:${h.id}`,
        action: 'STATUS_CHANGE',
        entity: 'Ticket',
        entityId: id,
        createdAt: h.createdAt,
        user: h.changedBy,
        oldValues: { status: h.fromStatus },
        newValues: { status: h.toStatus, ...(h.reason ? { reason: h.reason } : {}) },
      }));

    const entries = [...auditsForTimeline, ...historyOnly].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const depIds = [
      ...new Set(
        entries
          .filter((e) => e.action === 'DEPENDENCY_ADD' && e.entity === 'TicketDependency')
          .map((e) => e.entityId),
      ),
    ];
    const depsById = new Map(
      depIds.length
        ? (
            await this.prisma.ticketDependency.findMany({
              where: { id: { in: depIds } },
              include: {
                blockingTicket: { select: { id: true, ticketNumber: true, title: true } },
                blockedTicket: { select: { id: true, ticketNumber: true, title: true } },
              },
            })
          ).map((d) => [d.id, d] as const)
        : [] as const,
    );

    const enrichDependencyTo = (
      ticketId: string,
      entityId: string,
      to: Record<string, unknown> | null,
    ): Record<string, unknown> | null => {
      const dep = depsById.get(entityId);
      if (!dep) return to;
      const snap = to?.otherTicket;
      const hasTicket =
        snap && typeof snap === 'object' && typeof (snap as { id?: unknown }).id === 'string';
      if (hasTicket) return to;
      const onBlocked = dep.blockedTicketId === ticketId;
      const other = onBlocked ? dep.blockingTicket : dep.blockedTicket;
      return {
        ...(to ?? {}),
        blockingTicketId: dep.blockingTicketId,
        blockedTicketId: dep.blockedTicketId,
        type: dep.type,
        otherTicketId: other.id,
        otherTicket: other,
      };
    };

    const userIds = new Set<string>();
    const ticketIds = new Set<string>();
    const taskIds = new Set<string>();
    for (const e of entries) {
      const from = parseAuditBag(e.oldValues);
      let to = parseAuditBag(e.newValues);
      if (e.action === 'DEPENDENCY_ADD') {
        to = enrichDependencyTo(id, e.entityId, to);
      }
      collectTimelineUserIds(from, to, userIds);
      collectTimelineTicketIds(e.action, from, to, ticketIds);
      collectTimelineTaskIds(e.entity, e.entityId, taskIds);
    }

    const [resolved, relatedTickets, relatedTasks] = await Promise.all([
      userIds.size
        ? this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, firstName: true, lastName: true, role: true },
          })
        : Promise.resolve([]),
      ticketIds.size
        ? this.prisma.ticket.findMany({
            where: { id: { in: [...ticketIds] } },
            select: { id: true, ticketNumber: true, title: true },
          })
        : Promise.resolve([]),
      taskIds.size
        ? this.prisma.ticketTask.findMany({
            where: { id: { in: [...taskIds] } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
    ]);
    const usersById = new Map<string, TimelinePerson>(
      resolved.map((u) => [u.id, u] as const),
    );
    const ticketsById = new Map<string, TimelineTicketRef>(
      relatedTickets.map((t) => [t.id, t] as const),
    );
    const tasksById = new Map<string, string>(
      relatedTasks.map((t) => [t.id, t.title] as const),
    );

    return entries.map((e) => {
      let from = parseAuditBag(e.oldValues);
      let to = parseAuditBag(e.newValues);
      if (e.action === 'DEPENDENCY_ADD') {
        to = enrichDependencyTo(id, e.entityId, to);
      }
      if (e.entity === 'TicketTask') {
        ({ from, to } = enrichTaskTimelineBags(e.entityId, from, to, tasksById));
      }
      const actor = e.user
        ? {
            id: e.user.id,
            firstName: e.user.firstName,
            lastName: e.user.lastName,
            role: e.user.role,
          }
        : null;
      return {
        id: e.id,
        action: e.action,
        entity: e.entity,
        at: e.createdAt,
        actor,
        from,
        to,
        subjects: resolveTimelineSubjects(e.action, from, to, usersById),
        relation: resolveTimelineRelation(id, e.action, from, to, ticketsById),
      };
    });
  }

  // ---- Prerequisites ------------------------------------------------------
  // "This cannot start until that is done." Enforced at `start` and at
  // `submit-for-testing`, so the dependency stays a real constraint even if the
  // edge was added after work began.

  async listDependencies(id: string, user: any) {
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    const summary = {
      select: { id: true, ticketNumber: true, title: true, status: true },
    };
    const [blockedBy, blocking] = await Promise.all([
      this.prisma.ticketDependency.findMany({
        where: { blockedTicketId: id },
        include: { blockingTicket: summary },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.ticketDependency.findMany({
        where: { blockingTicketId: id },
        include: { blockedTicket: summary },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { blockedBy, blocking };
  }

  /**
   * Relates two tickets.
   *
   * The row is always stored as `blocking -> blocked`; `direction` just says
   * which end the caller's ticket sits on, so the same endpoint serves both
   * "this waits on that" and "that waits on this" without a second route.
   */
  async addDependency(id: string, dto: AddDependencyDto, user: any) {
    assertCan(user, 'ticket:assign');
    await this.findById(id);
    await this.findById(dto.otherTicketId);
    // Both ends, so a relation cannot be used to probe for tickets the caller
    // is not allowed to see.
    await this.access.assertCanViewTicket(id, user);
    await this.access.assertCanViewTicket(dto.otherTicketId, user);

    if (dto.otherTicketId === id) {
      throw new BadRequestException('لا يمكن ربط التذكرة بنفسها');
    }

    const blocks = dto.direction === 'blocks';
    const blockedTicketId = blocks ? dto.otherTicketId : id;
    const blockingTicketId = blocks ? id : dto.otherTicketId;
    const type = dto.type ?? TicketDependencyType.BLOCKS;

    // Only a blocking edge can deadlock; the softer kinds are navigation aids.
    if (type === TicketDependencyType.BLOCKS) {
      const edges = await loadDependencyEdges(this.prisma);
      if (wouldCreateCycle(edges, blockingTicketId, blockedTicketId)) {
        throw new BadRequestException('لا يمكن إنشاء اعتماد دائري');
      }
    }

    const existing = await this.prisma.ticketDependency.findUnique({
      where: { blockingTicketId_blockedTicketId: { blockingTicketId, blockedTicketId } },
    });
    if (existing?.type === type) {
      throw new ConflictException('هذه العلاقة مضافة مسبقاً');
    }

    const dependency = existing
      ? await this.prisma.ticketDependency.update({
          where: { id: existing.id },
          data: { type },
        })
      : await this.prisma.ticketDependency.create({
          data: { blockedTicketId, blockingTicketId, type, createdById: user.id },
        });
    const otherTicket = await this.prisma.ticket.findUnique({
      where: { id: dto.otherTicketId },
      select: { id: true, ticketNumber: true, title: true },
    });
    await this.audit.log({
      action: 'DEPENDENCY_ADD', entity: 'TicketDependency', entityId: dependency.id,
      userId: user.id, ticketId: id,
      newValues: { blockingTicketId, blockedTicketId, type, otherTicketId: dto.otherTicketId, otherTicket },
    });

    return dependency;
  }

  async removeDependency(id: string, otherTicketId: string, user: any) {
    assertCan(user, 'ticket:assign');
    await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    // The caller names the other ticket; the row may be stored either way round.
    const dependency = await this.prisma.ticketDependency.findFirst({
      where: {
        OR: [
          { blockedTicketId: id, blockingTicketId: otherTicketId },
          { blockedTicketId: otherTicketId, blockingTicketId: id },
        ],
      },
    });
    if (!dependency) throw new NotFoundException('Dependency not found');

    const otherTicket = await this.prisma.ticket.findUnique({
      where: { id: otherTicketId },
      select: { id: true, ticketNumber: true, title: true },
    });

    await this.prisma.ticketDependency.delete({ where: { id: dependency.id } });
    await this.audit.log({
      action: 'DEPENDENCY_REMOVE', entity: 'TicketDependency', entityId: dependency.id,
      userId: user.id, ticketId: id,
      oldValues: {
        otherTicketId,
        otherTicket,
        type: dependency.type,
        blockingTicketId: dependency.blockingTicketId,
        blockedTicketId: dependency.blockedTicketId,
      },
    });

    return { id: dependency.id };
  }

  /**
   * Tells the people waiting on a ticket that it has landed.
   *
   * Only when *every* prerequisite is now met — telling a lead the way is clear
   * while two others are still open would be worse than saying nothing. It does
   * not auto-resume: deciding to pick the work back up is a person's call.
   */
  private async notifyUnblockedDependents(ticketId: string, actorId: string) {
    const dependents = await this.prisma.ticketDependency.findMany({
      where: { blockingTicketId: ticketId, type: TicketDependencyType.BLOCKS },
      select: { blockedTicketId: true },
    });
    if (!dependents.length) return;

    for (const { blockedTicketId } of dependents) {
      const stillWaiting = await this.prisma.ticketDependency.count({
        where: {
          blockedTicketId,
          type: TicketDependencyType.BLOCKS,
          blockingTicket: { status: { notIn: PREREQUISITE_SATISFIED_STATUSES } },
        },
      });
      if (stillWaiting > 0) continue;

      const [blocked, lead] = await Promise.all([
        this.prisma.ticket.findUnique({
          where: { id: blockedTicketId },
          select: { title: true },
        }),
        this.prisma.ticketAssignment.findFirst({
          where: { ticketId: blockedTicketId, isActive: true, isLead: true },
          select: { developerId: true },
        }),
      ]);
      if (!blocked || !lead) continue;

      await this.notifications.notify(lead.developerId, {
        type: NotificationType.STATUS_CHANGED,
        title: 'ارتفعت المتطلبات عن تذكرتك',
        body: `اكتملت كل التذاكر المتطلَّبة للتذكرة «${blocked.title}»`,
        ticketId: blockedTicketId,
      }, actorId);
    }
  }

  // ---- Stopping and restarting --------------------------------------------
  // Two ways a ticket stops. BLOCKED is involuntary — something outside the
  // ticket is in the way. ON_HOLD is a deliberate parking decision. Both need a
  // documented reason (req.md §21) and both stop the work clock, because the
  // hours a ticket spends waiting are not hours anyone worked.

  async block(id: string, dto: PauseTicketDto, user: any) {
    assertCan(user, 'ticket:block');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    if (!BLOCKABLE_STATUSES.includes(ticket.status)) {
      throw new BadRequestException('لا يمكن إيقاف تذكرة لم يبدأ العمل عليها');
    }
    if (dto.blockedByTicketId) {
      // A blocker the caller cannot see would render as a dead reference.
      await this.access.assertCanViewTicket(dto.blockedByTicketId, user);
    }
    // Same pairing as `/resume`: contributors who cannot clear a blocker must
    // not raise one. QA may still report blockers; leadership and the lead lift them.
    if (can(user.role, 'ticket:resume') && !can(user.role, 'ticket:hold')) {
      await this.assignments.requireLead(id, user.id);
    }

    const updated = await this.changeStatus(ticket, TicketStatus.BLOCKED, user.id, {
      reason: dto.reason,
      data: { pauseReason: dto.reason, blockedByTicketId: dto.blockedByTicketId ?? null },
    });

    await this.notifyPause(ticket, 'توقفت التذكرة', `توقفت التذكرة «${ticket.title}»: ${dto.reason}`, user);
    return updated;
  }

  async hold(id: string, dto: PauseTicketDto, user: any) {
    assertCan(user, 'ticket:hold');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    if (TERMINAL_STATUSES.includes(ticket.status)) {
      throw new BadRequestException('لا يمكن تعليق تذكرة منتهية');
    }

    const updated = await this.changeStatus(ticket, TicketStatus.ON_HOLD, user.id, {
      reason: dto.reason,
      data: { pauseReason: dto.reason, blockedByTicketId: null },
    });

    await this.notifyPause(ticket, 'عُلّقت التذكرة', `عُلّقت التذكرة «${ticket.title}»: ${dto.reason}`, user);
    return updated;
  }

  /**
   * Sends a stopped ticket back to the status it stopped from, read out of the
   * status history rather than a stored column.
   */
  async resume(id: string, dto: ResumeTicketDto, user: any) {
    assertCan(user, 'ticket:resume');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);

    if (ticket.status !== TicketStatus.BLOCKED && ticket.status !== TicketStatus.ON_HOLD) {
      throw new BadRequestException('التذكرة ليست متوقفة');
    }
    // A deliberate hold is a leadership decision, so lifting it is one too. A
    // blocker is the lead's to clear, since they raised it.
    if (!can(user.role, 'ticket:hold')) {
      if (ticket.status === TicketStatus.ON_HOLD) {
        throw new ForbiddenException('استئناف التذكرة المعلّقة من صلاحية الإدارة');
      }
      await this.assignments.requireLead(id, user.id);
    }

    const [history, hasAssignment] = await Promise.all([
      this.prisma.ticketStatusHistory.findMany({
        where: { ticketId: id },
        orderBy: { createdAt: 'asc' },
        select: { fromStatus: true, toStatus: true, createdAt: true },
      }),
      this.assignments.hasActiveAssignment(id),
    ]);

    const target = resumeTargetFrom(history, hasAssignment);
    const updated = await this.changeStatus(ticket, target, user.id, {
      reason: dto.reason ?? 'استئناف العمل',
      data: { pauseReason: null, blockedByTicketId: null },
    });

    await this.notifyPause(ticket, 'استؤنف العمل', `استؤنف العمل على التذكرة «${ticket.title}»`, user);
    return updated;
  }

  /** Everyone who is working the ticket, plus whoever filed it. */
  private async notifyPause(ticket: any, title: string, body: string, user: any) {
    const roster = await this.prisma.ticketAssignment.findMany({
      where: { ticketId: ticket.id, isActive: true },
      select: { developerId: true },
    });
    const audience = [...new Set([...roster.map((r) => r.developerId), ticket.creatorId])];

    await this.notifications.notifyMany(audience, {
      type: NotificationType.STATUS_CHANGED,
      title,
      body,
      ticketId: ticket.id,
    }, user.id);
  }

  async close(id: string, dto: CloseTicketDto, user: any) {
    assertCan(user, 'ticket:close');
    const ticket = await this.findById(id);
    await this.access.assertCanViewTicket(id, user);
    if (ticket.status !== TicketStatus.COMPLETED) throw new BadRequestException('Ticket must be completed before closing');
    return this.changeStatus(ticket, TicketStatus.CLOSED, user.id, {
      data: { closureNotes: dto.closureNotes },
    });
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
    return this.changeStatus(ticket, TicketStatus.NEW, user.id, { reason: 'Reopened' });
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
    // One audit row only — FORCE_STATUS — so the timeline does not also show a
    // normal STATUS_CHANGE for the same move.
    return this.changeStatus(ticket, dto.status, user.id, {
      reason: dto.reason || 'تغيير يدوي',
      auditAction: 'FORCE_STATUS',
    });
  }

  /**
   * The single writer for `Ticket.status`. Every transition goes through here so
   * that history, audit and the creator email are never something a new endpoint
   * can forget. `opts.data` carries the columns that belong to the same write —
   * closure notes, assignment fields, block reasons — which keeps one row update
   * per transition instead of two racing ones.
   */
  private async changeStatus(
    ticket: any,
    toStatus: TicketStatus,
    userId: string,
    opts: {
      reason?: string;
      data?: Prisma.TicketUncheckedUpdateInput;
      auditAction?: 'STATUS_CHANGE' | 'FORCE_STATUS';
    } = {},
  ) {
    const { reason, data, auditAction = 'STATUS_CHANGE' } = opts;

    const [updated] = await Promise.all([
      this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { ...data, ...workClockFields(ticket, toStatus), status: toStatus },
      }),
      this.prisma.ticketStatusHistory.create({
        data: { ticketId: ticket.id, fromStatus: ticket.status, toStatus, changedById: userId, reason },
      }),
      this.audit.log({
        action: auditAction,
        entity: 'Ticket',
        entityId: ticket.id,
        // Without this the entry is invisible to the per-ticket timeline.
        ticketId: ticket.id,
        userId,
        oldValues: { status: ticket.status },
        newValues: { status: toStatus, ...(reason ? { reason } : {}) },
      }),
    ]);

    // Landing this ticket may be the last thing others were waiting on.
    if (PREREQUISITE_SATISFIED_STATUSES.includes(toStatus)) {
      await this.notifyUnblockedDependents(ticket.id, userId);
    }

    if (ticket.creatorId !== userId) {
      const creator = await this.prisma.user.findUnique({ where: { id: ticket.creatorId }, select: { email: true } });
      if (creator?.email) {
        const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://barmijly.ai');
        this.email.sendStatusUpdate(
          creator.email,
          ticket.title,
          toStatus,
          `${frontendUrl}/tickets/${ticket.id}`,
          ticket.ticketNumber,
          ticket.status,
          await this.mailScope(ticket),
        );
      }
    }

    return updated;
  }

  private async findById(id: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async mailScope(ticket: { companyId: string; systemId: string }) {
    const [company, system] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: ticket.companyId }, select: { name: true } }),
      this.prisma.system.findUnique({ where: { id: ticket.systemId }, select: { name: true } }),
    ]);
    return { companyName: company?.name, systemName: system?.name };
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
