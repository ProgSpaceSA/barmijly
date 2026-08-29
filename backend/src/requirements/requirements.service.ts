import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  RequirementSource,
  RequirementStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MeetingAccessService, MeetingActor } from '../meetings/meetings.access';
import { formatRequirementCode, parseRequirementNumberQuery } from '../meetings/meeting-code';
import { parseAuditBag } from '../tickets/audit-bag';
import { cloneAttachments } from '../attachments/attachment-clone';
import { REQUIREMENT_DETAIL_INCLUDE, REQUIREMENT_INCLUDE } from './requirement-include';
import { buildRequirementTicket } from './requirement-promote';
import {
  ChangeRequirementStatusDto,
  CreateRequirementDto,
  FilterRequirementsDto,
  PromoteRequirementDto,
  UpdateRequirementDto,
} from './dto/requirement.dto';

/**
 * Re-reads a requirement at the end of a write, inside the same transaction.
 *
 * A write that returns the row it just created reports a `statusHistory` from
 * before the history row was inserted — the reply says "no history" for a move
 * the caller is about to render. Reading last is what keeps the response and
 * the database telling the same story.
 */
function readRequirement(tx: Prisma.TransactionClient, id: string) {
  return tx.requirement.findUniqueOrThrow({
    where: { id },
    include: REQUIREMENT_DETAIL_INCLUDE,
  });
}

/** Still on the board — the two terminal statuses are the ones that leave it. */
export const OPEN_REQUIREMENT_STATUSES: RequirementStatus[] = [
  RequirementStatus.NEW,
  RequirementStatus.UNDER_REVIEW,
  RequirementStatus.ACCEPTED,
];

/**
 * The requirements backlog.
 *
 * There is no `BACKLOG` ticket status and there is not going to be: a ticket is
 * scheduled work, and an ask that nobody has committed to yet is not that. It
 * lives here until leadership pins it to a system and promotes it, at which
 * point `promote()` creates a DRAFT ticket and the normal approval flow takes
 * over — nothing here bypasses `PROGRAMMING_HEAD` (req.md §8, §21).
 */
@Injectable()
export class RequirementsService {
  constructor(
    private prisma: PrismaService,
    private meetings: MeetingAccessService,
    private access: AccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------- read

  async findAll(user: MeetingActor, filters: FilterRequirementsDto) {
    const page = Math.max(1, parseInt(filters.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '20', 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.RequirementWhereInput = {
      isArchived: filters.isArchived ?? false,
      ...(filters.open
        ? { status: { in: OPEN_REQUIREMENT_STATUSES } }
        : filters.status && { status: filters.status }),
      ...(filters.source && { source: filters.source }),
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.systemId && { systemId: filters.systemId }),
      ...(filters.ownerId && { ownerId: filters.ownerId }),
      ...(filters.meetingId && { meetingPoint: { meetingId: filters.meetingId } }),
      ...(filters.unpinned !== undefined && {
        systemId: filters.unpinned ? null : { not: null },
      }),
      // Uses the authenticated user, never a caller-supplied id, so «متطلباتي»
      // cannot be pointed at somebody else.
      ...(filters.mine && {
        OR: [{ ownerId: user.id }, { createdById: user.id }, { requestedById: user.id }],
      }),
      ...(filters.search && this.searchWhere(filters.search)),
    };

    const scope = await this.meetings.requirementScope(user);
    const scoped: Prisma.RequirementWhereInput = Object.keys(scope).length
      ? { AND: [where, scope] }
      : where;

    const [data, total, openCount] = await Promise.all([
      this.prisma.requirement.findMany({
        where: scoped,
        include: REQUIREMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.requirement.count({ where: scoped }),
      this.prisma.requirement.count({
        where: {
          AND: [{ isArchived: false, status: { in: OPEN_REQUIREMENT_STATUSES } }, scope],
        },
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), openCount };
  }

  /** Open-requirement badge for the sidebar. Same scope as the list it links to. */
  async openCount(user: MeetingActor) {
    const scope = await this.meetings.requirementScope(user);
    const count = await this.prisma.requirement.count({
      where: {
        AND: [{ isArchived: false, status: { in: OPEN_REQUIREMENT_STATUSES } }, scope],
      },
    });
    return { count };
  }

  /**
   * The detail row, with the thread already filtered for this reader —
   * INTERNAL comments never reach a `SYSTEM_OWNER` (req.md §12), and filtering
   * at the query is what keeps the API from shipping them at all.
   */
  async findOne(id: string, user: MeetingActor) {
    const requirement = await this.meetings.loadVisibleRequirement(id, user, {
      include: {
        ...REQUIREMENT_DETAIL_INCLUDE,
        comments: {
          where: this.access.commentVisibilityWhere(user),
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, firstName: true, lastName: true, role: true } },
            attachments: true,
          },
        },
      },
    });

    const descriptionHistory = await this.loadDescriptionHistory(id);
    return { ...requirement, descriptionHistory };
  }

  private async loadDescriptionHistory(requirementId: string) {
    const audits = await this.prisma.auditLog.findMany({
      where: { entity: 'Requirement', entityId: requirementId, action: 'REQUIREMENT_UPDATE' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });

    return audits
      .map((row) => {
        const from = parseAuditBag(row.oldValues);
        const to = parseAuditBag(row.newValues);
        if (!from && !to) return null;
        if (from?.description === to?.description) return null;
        return {
          id: row.id,
          fromDescription:
            typeof from?.description === 'string' ? from.description : (from?.description ?? null),
          toDescription:
            typeof to?.description === 'string' ? to.description : (to?.description ?? null),
          changedBy: row.user,
          createdAt: row.createdAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  // ------------------------------------------------------------------- write

  /**
   * Files a standalone requirement — a WhatsApp message, an email, a corridor
   * conversation. An ask made in a meeting is *captured* off its minutes line
   * instead, which is what keeps `source = MEETING` honest.
   */
  async create(dto: CreateRequirementDto, user: MeetingActor) {
    this.meetings.assertCan(user, 'requirement:create');
    await this.access.assertCanViewCompany(dto.companyId, user);

    if (dto.source === RequirementSource.MEETING) {
      throw new BadRequestException('متطلبات الاجتماعات تُلتقط من بنود المحضر');
    }
    if (dto.systemId) {
      await this.access.assertCanFileAgainst(dto.systemId, dto.companyId, user);
    }
    if (dto.ownerId) await this.assertActiveUser(dto.ownerId, 'Owner not found');
    if (dto.requestedById) await this.assertActiveUser(dto.requestedById, 'Requester not found');

    const requirement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.requirement.create({
        data: {
          title: dto.title,
          description: dto.description,
          companyId: dto.companyId,
          source: dto.source ?? RequirementSource.OTHER,
          sourceNote: dto.sourceNote,
          systemId: dto.systemId ?? null,
          priority: dto.priority ?? null,
          requestedById: dto.requestedById ?? null,
          requestedByName: dto.requestedById ? null : dto.requestedByName?.trim() || null,
          ownerId: dto.ownerId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          createdById: user.id,
        },
      });
      await tx.requirementStatusHistory.create({
        data: {
          requirementId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedById: user.id,
        },
      });
      // Read back last: the row is only complete once its opening history
      // exists, and the caller renders that history straight from this reply.
      return readRequirement(tx, created.id);
    });

    await this.audit.log({
      action: 'REQUIREMENT_CREATE',
      entity: 'Requirement',
      entityId: requirement.id,
      userId: user.id,
      newValues: {
        title: requirement.title,
        requirementNumber: requirement.requirementNumber,
        source: requirement.source,
        status: requirement.status,
        companyId: requirement.companyId,
        systemId: requirement.systemId,
        ownerId: requirement.ownerId,
      },
    });

    await this.announceRaised(requirement, user);
    if (requirement.ownerId) await this.announceAssigned(requirement, requirement.ownerId, user);

    return requirement;
  }

  /** Triage: pin the system, hand it an owner, set priority and a due date. */
  async update(id: string, dto: UpdateRequirementDto, user: MeetingActor) {
    this.meetings.assertCan(user, 'requirement:triage');
    const requirement = await this.meetings.loadVisibleRequirement(id, user);
    this.assertEditable(requirement);

    const data: Prisma.RequirementUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.source !== undefined) data.source = dto.source;
    if (dto.sourceNote !== undefined) data.sourceNote = dto.sourceNote ?? null;
    if (dto.priority !== undefined) data.priority = dto.priority ?? null;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    if (dto.systemId !== undefined) {
      if (dto.systemId) {
        await this.access.assertCanFileAgainst(dto.systemId, requirement.companyId, user);
        data.systemId = dto.systemId;
      } else {
        data.systemId = null;
      }
    }

    if (dto.requestedById !== undefined) {
      if (dto.requestedById) await this.assertActiveUser(dto.requestedById, 'Requester not found');
      data.requestedById = dto.requestedById || null;
      if (dto.requestedById) data.requestedByName = null;
    }
    if (dto.requestedByName !== undefined && !dto.requestedById) {
      data.requestedByName = dto.requestedByName?.trim() || null;
    }

    let newOwner: string | null = null;
    if (dto.ownerId !== undefined && (dto.ownerId || null) !== requirement.ownerId) {
      if (dto.ownerId) await this.assertActiveUser(dto.ownerId, 'Owner not found');
      data.ownerId = dto.ownerId || null;
      newOwner = dto.ownerId || null;
    }

    const updated = await this.prisma.requirement.update({
      where: { id },
      data,
      include: REQUIREMENT_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: 'REQUIREMENT_UPDATE',
      entity: 'Requirement',
      entityId: id,
      userId: user.id,
      oldValues: {
        title: requirement.title,
        description: requirement.description,
        source: requirement.source,
        sourceNote: requirement.sourceNote,
        systemId: requirement.systemId,
        priority: requirement.priority,
        ownerId: requirement.ownerId,
        requestedById: requirement.requestedById,
        requestedByName: requirement.requestedByName,
        dueDate: requirement.dueDate,
      },
      newValues: {
        title: updated.title,
        description: updated.description,
        source: updated.source,
        sourceNote: updated.sourceNote,
        systemId: updated.systemId,
        priority: updated.priority,
        ownerId: updated.ownerId,
        requestedById: updated.requestedById,
        requestedByName: updated.requestedByName,
        dueDate: updated.dueDate,
      },
    });

    if (newOwner) await this.announceAssigned(updated, newOwner, user);

    return updated;
  }

  /** Every status move is auditable — `RequirementStatusHistory`, like bugs. */
  async changeStatus(id: string, dto: ChangeRequirementStatusDto, user: MeetingActor) {
    this.meetings.assertCan(user, 'requirement:triage');
    const requirement = await this.meetings.loadVisibleRequirement(id, user);
    if (requirement.isArchived) throw new BadRequestException('المتطلب مؤرشف ولا يمكن تعديله');

    if (dto.status === RequirementStatus.CONVERTED) {
      // CONVERTED means "a ticket now carries this". Setting it by hand would
      // claim work that does not exist — promote is the only way in.
      throw new BadRequestException('حالة «حُوِّل» تُضبط عند إنشاء التذكرة فقط');
    }
    if (requirement.status === RequirementStatus.CONVERTED) {
      throw new BadRequestException('المتطلب حُوِّل إلى تذكرة بالفعل');
    }
    if (requirement.status === dto.status) return this.findOne(id, user);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.requirement.update({
        where: { id },
        data: {
          status: dto.status,
          decidedById: user.id,
          decidedAt: new Date(),
          decisionNote: dto.note ?? null,
        },
      });
      await tx.requirementStatusHistory.create({
        data: {
          requirementId: id,
          fromStatus: requirement.status,
          toStatus: dto.status,
          changedById: user.id,
          note: dto.note,
        },
      });
      return readRequirement(tx, id);
    });

    await this.audit.log({
      action: 'REQUIREMENT_STATUS_CHANGE',
      entity: 'Requirement',
      entityId: id,
      userId: user.id,
      oldValues: {
        status: requirement.status,
        requirementNumber: requirement.requirementNumber,
        title: requirement.title,
      },
      newValues: {
        status: dto.status,
        note: dto.note ?? null,
        requirementNumber: requirement.requirementNumber,
        title: requirement.title,
      },
    });

    return updated;
  }

  /** Requirements archive; they are never hard-deleted. */
  async archive(id: string, user: MeetingActor) {
    return this.setArchived(id, true, user);
  }

  async unarchive(id: string, user: MeetingActor) {
    return this.setArchived(id, false, user);
  }

  /**
   * Turns a requirement into a ticket.
   *
   * The one place the meetings surface touches the ticket workflow. The ticket
   * is created at DRAFT and goes through DRAFT → NEW → AWAITING_APPROVAL like
   * any other, so `PROGRAMMING_HEAD` approval is still required before
   * development. A requirement with no system is refused rather than silently
   * filed against a guess — a ticket has to belong to a system (req.md §21).
   */
  async promote(id: string, user: MeetingActor, dto?: PromoteRequirementDto) {
    this.meetings.assertCan(user, 'requirement:promote');
    const requirement = await this.meetings.loadVisibleRequirement(id, user, {
      include: {
        meetingPoint: {
          select: {
            body: true,
            meeting: { select: { title: true, meetingNumber: true, heldAt: true } },
          },
        },
      },
    });

    if (requirement.isArchived) throw new BadRequestException('المتطلب مؤرشف');
    if (requirement.status === RequirementStatus.DECLINED) {
      throw new BadRequestException('المتطلب مرفوض');
    }
    if (!requirement.systemId) {
      throw new BadRequestException('حدّد النظام قبل إنشاء التذكرة');
    }
    await this.access.assertCanFileAgainst(requirement.systemId, requirement.companyId, user);

    const code = formatRequirementCode(requirement.requirementNumber);

    const { requirement: converted, ticket } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: buildRequirementTicket(requirement, user.id, dto),
      });

      if (requirement.ownerId) {
        const owner = await tx.user.findUnique({
          where: { id: requirement.ownerId },
          select: { role: true },
        });
        if (owner?.role === UserRole.DEVELOPER) {
          await tx.ticketAssignment.upsert({
            where: {
              ticketId_developerId: { ticketId: created.id, developerId: requirement.ownerId },
            },
            create: {
              ticketId: created.id,
              developerId: requirement.ownerId,
              isActive: true,
              isLead: true,
            },
            update: { isActive: true, isLead: true },
          });
        } else {
          await tx.ticket.update({
            where: { id: created.id },
            data: { systemOwnerId: requirement.ownerId },
          });
        }
      }

      await cloneAttachments(
        tx,
        { requirementId: id },
        { ticketId: created.id },
        user.id,
      );

      await tx.ticketStatusHistory.create({
        data: {
          ticketId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedById: user.id,
          reason: `أُنشئت من المتطلب ${code}`,
        },
      });

      await tx.requirement.update({
        where: { id },
        data: {
          status: RequirementStatus.CONVERTED,
          decidedById: user.id,
          decidedAt: new Date(),
        },
      });
      await tx.requirementStatusHistory.create({
        data: {
          requirementId: id,
          fromStatus: requirement.status,
          toStatus: RequirementStatus.CONVERTED,
          changedById: user.id,
          note: `أُنشئت التذكرة رقم ${created.ticketNumber}`,
        },
      });

      return { requirement: await readRequirement(tx, id), ticket: created };
    });

    await this.audit.log({
      action: 'REQUIREMENT_PROMOTE',
      entity: 'Requirement',
      entityId: id,
      userId: user.id,
      newValues: {
        ticketId: ticket.id,
        requirementNumber: requirement.requirementNumber,
        title: requirement.title,
      },
    });
    await this.audit.log({
      action: 'TICKET_CREATED',
      entity: 'Ticket',
      entityId: ticket.id,
      userId: user.id,
      ticketId: ticket.id,
      newValues: {
        title: ticket.title,
        type: ticket.type,
        status: ticket.status,
        requirementId: id,
        requirementNumber: requirement.requirementNumber,
      },
    });

    if (converted.ownerId && converted.ownerId !== user.id) {
      await this.notifications.notify(
        converted.ownerId,
        {
          type: NotificationType.REQUIREMENT_ASSIGNED,
          title: 'تحوّل متطلبك إلى تذكرة',
          body: `${this.actorName(user)} أنشأ تذكرة من المتطلب «${converted.title}»`,
          ticketId: ticket.id,
          requirementId: converted.id,
          metadata: { requirementNumber: converted.requirementNumber },
        },
        user.id,
      );
    }

    return { requirement: converted, ticket };
  }

  // ----------------------------------------------------------------- helpers

  private async setArchived(id: string, isArchived: boolean, user: MeetingActor) {
    this.meetings.assertCan(user, 'requirement:triage');
    const requirement = await this.meetings.loadVisibleRequirement(id, user);
    if (requirement.isArchived === isArchived) return this.findOne(id, user);

    const updated = await this.prisma.requirement.update({
      where: { id },
      data: { isArchived },
      include: REQUIREMENT_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: isArchived ? 'REQUIREMENT_ARCHIVE' : 'REQUIREMENT_UNARCHIVE',
      entity: 'Requirement',
      entityId: id,
      userId: user.id,
      oldValues: { isArchived: !isArchived },
      newValues: { isArchived },
    });

    return updated;
  }

  /**
   * A converted requirement is history: the ticket carries the work from there,
   * and rewriting the ask afterwards would make the two disagree.
   */
  private assertEditable(requirement: { isArchived: boolean; status: RequirementStatus }): void {
    if (requirement.isArchived) throw new BadRequestException('المتطلب مؤرشف ولا يمكن تعديله');
    if (requirement.status === RequirementStatus.CONVERTED) {
      throw new BadRequestException('المتطلب حُوِّل إلى تذكرة — عدّل التذكرة نفسها');
    }
  }

  private async assertActiveUser(userId: string, message: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!account || !account.isActive) throw new NotFoundException(message);
  }

  private actorName(user: MeetingActor & { firstName?: string; lastName?: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }

  private async announceRaised(
    requirement: { id: string; title: string; requirementNumber: number; companyId: string },
    user: MeetingActor & { firstName?: string; lastName?: string },
  ) {
    const recipients = await this.meetings.triageRecipients(requirement.companyId, user.id);
    if (!recipients.length) return;
    await this.notifications.notifyMany(
      recipients,
      {
        type: NotificationType.REQUIREMENT_RAISED,
        title: 'متطلب جديد على اللوحة',
        body: `${this.actorName(user)} سجّل المتطلب «${requirement.title}»`,
        requirementId: requirement.id,
        metadata: { requirementNumber: requirement.requirementNumber },
      },
      user.id,
    );
  }

  private async announceAssigned(
    requirement: { id: string; title: string; requirementNumber: number },
    ownerId: string,
    user: MeetingActor & { firstName?: string; lastName?: string },
  ) {
    await this.notifications.notify(
      ownerId,
      {
        type: NotificationType.REQUIREMENT_ASSIGNED,
        title: 'أُسند إليك متطلب',
        body: `${this.actorName(user)} أسند إليك المتطلب «${requirement.title}»`,
        requirementId: requirement.id,
        metadata: { requirementNumber: requirement.requirementNumber },
      },
      user.id,
    );
  }

  private searchWhere(search: string): Prisma.RequirementWhereInput {
    const or: Prisma.RequirementWhereInput[] = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { sourceNote: { contains: search, mode: 'insensitive' } },
    ];
    const requirementNumber = parseRequirementNumberQuery(search);
    if (requirementNumber != null) or.push({ requirementNumber });
    return { OR: or };
  }
}
