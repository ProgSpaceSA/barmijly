import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackStatus, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Actor, assertCan, can, rolesWith } from '../access/permissions';
import { CreateFeedbackDto, FilterFeedbackDto, UpdateFeedbackDto } from './dto/feedback.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true, role: true } } as const;

const FEEDBACK_INCLUDE = {
  createdBy: PERSON,
  assignee: PERSON,
} satisfies Prisma.FeedbackInclude;

const OPEN_STATUSES: FeedbackStatus[] = [FeedbackStatus.OPEN, FeedbackStatus.IN_PROGRESS];

type FeedbackActor = Actor & { firstName?: string; lastName?: string };

/**
 * Complaints, improvements, and inquiries.
 *
 * Deliberately unscoped to company/system: a salary question is not a ticket.
 * Visibility is the gate — the author, the named person, and leadership. A
 * row with no assignee is leadership's, not a public board.
 *
 * Nothing is deleted. CLOSED is the archive, same as tickets (req.md §21).
 */
@Injectable()
export class FeedbackService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------- read

  async findAll(user: FeedbackActor, filters: FilterFeedbackDto) {
    assertCan(user, 'feedback:read');
    const triage = can(user.role, 'feedback:triage');

    const and: Prisma.FeedbackWhereInput[] = [this.visibleWhere(user, triage)];

    if (filters.kind) and.push({ kind: filters.kind });
    if (filters.status) and.push({ status: filters.status });
    if (filters.search) {
      and.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { body: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.unassigned) and.push({ assigneeId: null });
    else if (filters.mine) and.push({ assigneeId: user.id });
    else if (filters.assigneeId) and.push({ assigneeId: filters.assigneeId });

    const where: Prisma.FeedbackWhereInput = { AND: and };

    const [data, total, inboxCount] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        include: FEEDBACK_INCLUDE,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.feedback.count({ where }),
      this.countInbox(user, triage),
    ]);

    return { data, total, inboxCount };
  }

  /** Badge: open rows assigned to the caller, plus unassigned if they triage. */
  async inboxCount(user: FeedbackActor) {
    if (!can(user.role, 'feedback:read')) return { count: 0 };
    const count = await this.countInbox(user, can(user.role, 'feedback:triage'));
    return { count };
  }

  async findOne(id: string, user: FeedbackActor) {
    assertCan(user, 'feedback:read');
    const row = await this.prisma.feedback.findUnique({
      where: { id },
      include: FEEDBACK_INCLUDE,
    });
    if (!row || !this.canSee(row, user)) throw new NotFoundException('الطلب غير موجود');
    return row;
  }

  // ------------------------------------------------------------------- write

  async create(dto: CreateFeedbackDto, user: FeedbackActor) {
    assertCan(user, 'feedback:create');

    const assigneeId = dto.assigneeId || null;
    if (assigneeId) await this.assertActiveUser(assigneeId);

    const row = await this.prisma.feedback.create({
      data: {
        title: dto.title.trim(),
        body: dto.body.trim(),
        kind: dto.kind,
        proposedSolution: dto.proposedSolution?.trim() || null,
        createdById: user.id,
        assigneeId,
      },
      include: FEEDBACK_INCLUDE,
    });

    await this.audit.log({
      action: 'FEEDBACK_CREATED',
      entity: 'Feedback',
      entityId: row.id,
      userId: user.id,
      newValues: {
        title: row.title,
        kind: row.kind,
        assigneeId: row.assigneeId,
      },
    });

    await this.notifyCreated(row, user);
    return row;
  }

  /**
   * Status, assignee, or a resolution note. The named person may move their
   * own row; reassignment is leadership only.
   */
  async update(id: string, dto: UpdateFeedbackDto, user: FeedbackActor) {
    const row = await this.loadVisible(id, user);
    const triage = can(user.role, 'feedback:triage');
    const assignedHere = row.assigneeId === user.id;

    if (!triage && !assignedHere) {
      assertCan(user, 'feedback:triage');
    }

    const data: Prisma.FeedbackUncheckedUpdateInput = {};

    if (dto.assigneeId !== undefined) {
      assertCan(user, 'feedback:triage');
      if (dto.assigneeId) await this.assertActiveUser(dto.assigneeId);
      data.assigneeId = dto.assigneeId;
    }
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.resolutionNote !== undefined) {
      data.resolutionNote = dto.resolutionNote.trim() || null;
    }

    if (!Object.keys(data).length) return row;

    const updated = await this.prisma.feedback.update({
      where: { id },
      data,
      include: FEEDBACK_INCLUDE,
    });

    await this.audit.log({
      action: 'FEEDBACK_UPDATE',
      entity: 'Feedback',
      entityId: id,
      userId: user.id,
      oldValues: {
        status: row.status,
        assigneeId: row.assigneeId,
        resolutionNote: row.resolutionNote,
      },
      newValues: {
        status: updated.status,
        assigneeId: updated.assigneeId,
        resolutionNote: updated.resolutionNote,
      },
    });

    if (updated.status !== row.status || updated.assigneeId !== row.assigneeId) {
      await this.notifyUpdated(updated, user, row.status);
    }

    return updated;
  }

  // ----------------------------------------------------------------- helpers

  private visibleWhere(user: FeedbackActor, triage: boolean): Prisma.FeedbackWhereInput {
    if (triage) return {};
    return { OR: [{ createdById: user.id }, { assigneeId: user.id }] };
  }

  private canSee(
    row: { createdById: string; assigneeId: string | null },
    user: FeedbackActor,
  ) {
    return (
      can(user.role, 'feedback:triage') ||
      row.createdById === user.id ||
      row.assigneeId === user.id
    );
  }

  private async loadVisible(id: string, user: FeedbackActor) {
    assertCan(user, 'feedback:read');
    const row = await this.prisma.feedback.findUnique({ where: { id } });
    if (!row || !this.canSee(row, user)) throw new NotFoundException('الطلب غير موجود');
    return row;
  }

  private async countInbox(user: FeedbackActor, triage: boolean) {
    return this.prisma.feedback.count({
      where: {
        status: { in: OPEN_STATUSES },
        OR: [{ assigneeId: user.id }, ...(triage ? [{ assigneeId: null }] : [])],
      },
    });
  }

  private async assertActiveUser(id: string) {
    const person = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!person?.isActive) throw new BadRequestException('المسؤول غير موجود');
  }

  private async notifyCreated(
    row: { id: string; title: string; assigneeId: string | null },
    user: FeedbackActor,
  ) {
    const payload = {
      type: NotificationType.FEEDBACK_CREATED,
      title: 'طلب شكوى أو تحسين',
      body: `${this.actorName(user)} قدّم «${row.title}»`,
      metadata: { feedbackId: row.id },
    };

    if (row.assigneeId) {
      await this.notifications.notify(row.assigneeId, payload, user.id);
      return;
    }

    const leaders = await this.prisma.user.findMany({
      where: { role: { in: rolesWith('feedback:triage') }, isActive: true },
      select: { id: true },
    });
    await this.notifications.notifyMany(
      leaders.map((leader) => leader.id),
      payload,
      user.id,
    );
  }

  private async notifyUpdated(
    row: { id: string; title: string; status: FeedbackStatus; createdById: string },
    user: FeedbackActor,
    previous: FeedbackStatus,
  ) {
    await this.notifications.notify(
      row.createdById,
      {
        type: NotificationType.FEEDBACK_UPDATED,
        title: 'تحديث على طلبك',
        body:
          row.status !== previous
            ? `«${row.title}» أصبحت ${STATUS_PHRASE[row.status]}`
            : `${this.actorName(user)} حدّث «${row.title}»`,
        metadata: { feedbackId: row.id },
      },
      user.id,
    );
  }

  private actorName(user: FeedbackActor) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }
}

const STATUS_PHRASE: Record<FeedbackStatus, string> = {
  [FeedbackStatus.OPEN]: 'مفتوحة',
  [FeedbackStatus.IN_PROGRESS]: 'قيد المتابعة',
  [FeedbackStatus.RESOLVED]: 'مُنجزة',
  [FeedbackStatus.CLOSED]: 'مغلقة',
};
