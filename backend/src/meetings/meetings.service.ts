import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MeetingStatus, NotificationType, Prisma, RequirementSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { cloneAttachments } from '../attachments/attachment-clone';
import { MeetingAccessService, MeetingActor } from './meetings.access';
import { formatMeetingCode, parseMeetingNumberQuery } from './meeting-code';
import { REQUIREMENT_DETAIL_INCLUDE } from '../requirements/requirement-include';
import {
  AddAttendeeDto,
  CapturePointDto,
  CreateMeetingDto,
  CreatePointDto,
  FilterMeetingsDto,
  ReorderPointDto,
  SetMeetingSystemsDto,
  UpdateMeetingDto,
  UpdatePointDto,
} from './dto/meeting.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

const MEETING_INCLUDE = {
  organizer: PERSON,
  company: { select: { id: true, name: true, logoUrl: true } },
  systems: { include: { system: { select: { id: true, name: true } } } },
  _count: { select: { points: true, attendees: true } },
} as const satisfies Prisma.MeetingInclude;

const MEETING_DETAIL_INCLUDE = {
  ...MEETING_INCLUDE,
  attendees: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
  },
  points: {
    orderBy: { order: 'asc' },
    include: {
      raisedBy: PERSON,
      requirements: {
        select: { id: true, requirementNumber: true, title: true, status: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  attachments: true,
} as const satisfies Prisma.MeetingInclude;

/** A title is one line; the body may be a paragraph. */
function titleFromBody(body: string): string {
  const line = body.trim().split(/\r?\n/)[0].trim();
  return line.length > 200 ? `${line.slice(0, 197)}…` : line || body.trim().slice(0, 200);
}

/**
 * Meetings and their minutes.
 *
 * A meeting is the event; the minutes are ordered `MeetingPoint` rows, not a
 * text field, so a single line can be *captured* into a tracked Requirement
 * without anybody re-typing it. Capture is the only place this module writes a
 * requirement — everything after that lives in `RequirementsService`, and
 * promotion into a ticket still lands at DRAFT (req.md §8, §21).
 */
@Injectable()
export class MeetingsService {
  constructor(
    private prisma: PrismaService,
    private meetings: MeetingAccessService,
    private access: AccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------- read

  async findAll(user: MeetingActor, filters: FilterMeetingsDto) {
    const page = Math.max(1, parseInt(filters.page || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(filters.limit || '20', 10) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.MeetingWhereInput = {
      isArchived: filters.isArchived ?? false,
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.systemId && { systems: { some: { systemId: filters.systemId } } }),
      ...(filters.status && { status: filters.status }),
      ...(filters.type && { type: filters.type }),
      // Uses the authenticated user, never a caller-supplied id.
      ...(filters.mine && {
        OR: [{ organizerId: user.id }, { attendees: { some: { userId: user.id } } }],
      }),
      ...(filters.search && this.searchWhere(filters.search)),
      ...(filters.heldFrom || filters.heldTo
        ? {
            heldAt: {
              ...(filters.heldFrom ? { gte: new Date(filters.heldFrom) } : {}),
              ...(filters.heldTo ? { lte: new Date(filters.heldTo) } : {}),
            },
          }
        : {}),
    };

    const scope = await this.meetings.meetingScope(user);
    const scoped: Prisma.MeetingWhereInput = Object.keys(scope).length
      ? { AND: [where, scope] }
      : where;

    const [data, total] = await Promise.all([
      this.prisma.meeting.findMany({
        where: scoped,
        include: MEETING_INCLUDE,
        orderBy: [{ heldAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.meeting.count({ where: scoped }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string, user: MeetingActor) {
    return this.meetings.loadVisibleMeeting(id, user, { include: MEETING_DETAIL_INCLUDE });
  }

  // ------------------------------------------------------------------- write

  async create(dto: CreateMeetingDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    await this.access.assertCanViewCompany(dto.companyId, user);

    const systemIds = await this.resolveSystems(dto.systemIds ?? [], dto.companyId, user);

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        companyId: dto.companyId,
        organizerId: user.id,
        heldAt: dto.heldAt ? new Date(dto.heldAt) : null,
        durationMins: dto.durationMins,
        location: dto.location,
        systems: { create: systemIds.map((systemId) => ({ systemId })) },
        // The organiser was in the room; adding them by hand every time is busywork.
        attendees: { create: [{ userId: user.id }] },
      },
      include: MEETING_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: 'MEETING_CREATE',
      entity: 'Meeting',
      entityId: meeting.id,
      userId: user.id,
      newValues: {
        title: meeting.title,
        meetingNumber: meeting.meetingNumber,
        type: meeting.type,
        status: meeting.status,
        companyId: meeting.companyId,
        heldAt: meeting.heldAt,
        systemIds,
      },
    });

    return meeting;
  }

  async update(id: string, dto: UpdateMeetingDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    this.assertEditable(meeting);

    const data: Prisma.MeetingUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.heldAt !== undefined) data.heldAt = dto.heldAt ? new Date(dto.heldAt) : null;
    if (dto.durationMins !== undefined) data.durationMins = dto.durationMins ?? null;
    if (dto.location !== undefined) data.location = dto.location ?? null;

    const updated = await this.prisma.meeting.update({
      where: { id },
      data,
      include: MEETING_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: 'MEETING_UPDATE',
      entity: 'Meeting',
      entityId: id,
      userId: user.id,
      oldValues: {
        title: meeting.title,
        description: meeting.description,
        type: meeting.type,
        heldAt: meeting.heldAt,
        durationMins: meeting.durationMins,
        location: meeting.location,
      },
      newValues: {
        title: updated.title,
        description: updated.description,
        type: updated.type,
        heldAt: updated.heldAt,
        durationMins: updated.durationMins,
        location: updated.location,
      },
    });

    return updated;
  }

  /** SCHEDULED → HELD. Stamps `heldAt` when the meeting never carried a date. */
  async hold(id: string, user: MeetingActor) {
    return this.moveTo(id, MeetingStatus.HELD, user);
  }

  /** SCHEDULED → CANCELLED. A meeting that already happened cannot un-happen. */
  async cancel(id: string, user: MeetingActor) {
    return this.moveTo(id, MeetingStatus.CANCELLED, user);
  }

  async archive(id: string, user: MeetingActor) {
    return this.setArchived(id, true, user);
  }

  async unarchive(id: string, user: MeetingActor) {
    return this.setArchived(id, false, user);
  }

  // --------------------------------------------------------------- attendees

  async addAttendee(id: string, dto: AddAttendeeDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    this.assertEditable(meeting);

    const name = dto.name?.trim();
    if (!dto.userId && !name) {
      throw new BadRequestException('اختر مستخدماً من النظام أو اكتب اسم الحاضر');
    }

    if (dto.userId) {
      const account = await this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { id: true, isActive: true },
      });
      if (!account || !account.isActive) throw new NotFoundException('Attendee not found');

      const already = await this.prisma.meetingAttendee.findFirst({
        where: { meetingId: id, userId: dto.userId },
        select: { id: true },
      });
      if (already) throw new BadRequestException('الحاضر مُسجّل بالفعل في هذا الاجتماع');
    }

    const attendee = await this.prisma.meetingAttendee.create({
      data: {
        meetingId: id,
        userId: dto.userId,
        // An internal attendee reads their name off the account.
        name: dto.userId ? null : name,
        jobTitle: dto.jobTitle?.trim() || null,
        organization: dto.organization?.trim() || null,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });

    await this.audit.log({
      action: 'MEETING_ATTENDEE_ADD',
      entity: 'Meeting',
      entityId: id,
      userId: user.id,
      newValues: {
        attendeeId: attendee.id,
        userId: attendee.userId,
        name: attendee.name,
        organization: attendee.organization,
      },
    });

    return attendee;
  }

  async removeAttendee(id: string, attendeeId: string, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    this.assertEditable(meeting);

    const attendee = await this.prisma.meetingAttendee.findUnique({ where: { id: attendeeId } });
    if (!attendee || attendee.meetingId !== id) throw new NotFoundException('Attendee not found');

    await this.prisma.meetingAttendee.delete({ where: { id: attendeeId } });

    await this.audit.log({
      action: 'MEETING_ATTENDEE_REMOVE',
      entity: 'Meeting',
      entityId: id,
      userId: user.id,
      oldValues: { attendeeId, userId: attendee.userId, name: attendee.name },
    });

    return { id: attendeeId };
  }

  /** Replaces the whole system set — the picker sends everything that stays. */
  async setSystems(id: string, dto: SetMeetingSystemsDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    this.assertEditable(meeting);

    const systemIds = await this.resolveSystems(dto.systemIds, meeting.companyId, user);
    const before = await this.prisma.meetingSystem.findMany({
      where: { meetingId: id },
      select: { systemId: true },
    });

    await this.prisma.$transaction([
      this.prisma.meetingSystem.deleteMany({ where: { meetingId: id } }),
      this.prisma.meetingSystem.createMany({
        data: systemIds.map((systemId) => ({ meetingId: id, systemId })),
      }),
    ]);

    await this.audit.log({
      action: 'MEETING_SYSTEMS_SET',
      entity: 'Meeting',
      entityId: id,
      userId: user.id,
      oldValues: { systemIds: before.map((row) => row.systemId) },
      newValues: { systemIds },
    });

    return this.prisma.meetingSystem.findMany({
      where: { meetingId: id },
      include: { system: { select: { id: true, name: true } } },
    });
  }

  // ------------------------------------------------------------------ points

  /** Appends a minutes line at the end of the list. */
  async addPoint(id: string, dto: CreatePointDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    this.assertEditable(meeting);
    await this.assertRaiserExists(dto.raisedById);

    const last = await this.prisma.meetingPoint.findFirst({
      where: { meetingId: id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const point = await this.prisma.meetingPoint.create({
      data: {
        meetingId: id,
        body: dto.body ?? '',
        kind: dto.kind,
        raisedById: dto.raisedById,
        raisedByName: dto.raisedById ? null : dto.raisedByName?.trim() || null,
        order: (last?.order ?? -1) + 1,
      },
      include: { raisedBy: PERSON, requirements: { select: { id: true } } },
    });

    await this.audit.log({
      action: 'MEETING_POINT_ADD',
      entity: 'MeetingPoint',
      entityId: point.id,
      userId: user.id,
      newValues: { meetingId: id, order: point.order, kind: point.kind, body: point.body },
    });

    return point;
  }

  async updatePoint(id: string, pointId: string, dto: UpdatePointDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const point = await this.meetings.loadVisiblePoint(pointId, user, id);
    this.assertEditable(point.meeting);
    if (dto.raisedById) await this.assertRaiserExists(dto.raisedById);

    const data: Prisma.MeetingPointUncheckedUpdateInput = {};
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.raisedById !== undefined) {
      data.raisedById = dto.raisedById || null;
      if (dto.raisedById) data.raisedByName = null;
    }
    if (dto.raisedByName !== undefined && !dto.raisedById) {
      data.raisedByName = dto.raisedByName?.trim() || null;
    }

    const updated = await this.prisma.meetingPoint.update({
      where: { id: pointId },
      data,
      include: {
        raisedBy: PERSON,
        requirements: {
          select: { id: true, requirementNumber: true, title: true, status: true },
        },
      },
    });

    await this.audit.log({
      action: 'MEETING_POINT_UPDATE',
      entity: 'MeetingPoint',
      entityId: pointId,
      userId: user.id,
      oldValues: { body: point.body, kind: point.kind, raisedById: point.raisedById },
      newValues: { body: updated.body, kind: updated.kind, raisedById: updated.raisedById },
    });

    return updated;
  }

  /**
   * Moves a line and rewrites every sibling to a contiguous position.
   *
   * Gaps would work, but they make «البند ٣» in the UI and `order = 7` in the
   * row two different numbers, and the next reorder has to reconcile them —
   * same reasoning as `StepsService.reorder`.
   */
  async reorderPoints(id: string, dto: ReorderPointDto, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const point = await this.meetings.loadVisiblePoint(dto.pointId, user, id);
    this.assertEditable(point.meeting);

    const siblings = await this.prisma.meetingPoint.findMany({
      where: { meetingId: id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const reordered = moveTo(
      siblings.map((row) => row.id),
      dto.pointId,
      dto.order,
    );
    await this.prisma.$transaction(
      reordered.map((rowId, index) =>
        this.prisma.meetingPoint.update({ where: { id: rowId }, data: { order: index } }),
      ),
    );

    await this.audit.log({
      action: 'MEETING_POINT_REORDER',
      entity: 'MeetingPoint',
      entityId: dto.pointId,
      userId: user.id,
      oldValues: { order: point.order },
      newValues: { order: reordered.indexOf(dto.pointId), meetingId: id },
    });

    return this.listPoints(id);
  }

  /**
   * Deletes a minutes line and closes the gap it left.
   *
   * A line that was already captured keeps its requirement: the requirement is
   * the tracked thing and archiving is the only way it leaves the board, so the
   * link is cleared rather than the ask deleted along with the typo.
   */
  async removePoint(id: string, pointId: string, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const point = await this.meetings.loadVisiblePoint(pointId, user, id);
    this.assertEditable(point.meeting);

    await this.prisma.$transaction(async (tx) => {
      await tx.requirement.updateMany({
        where: { meetingPointId: pointId },
        data: { meetingPointId: null },
      });
      await tx.meetingPoint.delete({ where: { id: pointId } });

      const remaining = await tx.meetingPoint.findMany({
        where: { meetingId: id },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      for (const [index, row] of remaining.entries()) {
        await tx.meetingPoint.update({ where: { id: row.id }, data: { order: index } });
      }
    });

    await this.audit.log({
      action: 'MEETING_POINT_REMOVE',
      entity: 'MeetingPoint',
      entityId: pointId,
      userId: user.id,
      oldValues: { meetingId: id, order: point.order, kind: point.kind, body: point.body },
    });

    return this.listPoints(id);
  }

  /**
   * Captures a minutes line as a tracked requirement.
   *
   * The line stays where it is — a point is the record of what was said, and the
   * requirement is the thing that gets chased. `source` is always MEETING here,
   * which is what lets the requirement page link back to the minutes it came
   * from instead of a free-text note.
   */
  async capturePoint(
    id: string,
    pointId: string,
    dto: CapturePointDto,
    user: MeetingActor,
  ) {
    this.meetings.assertCan(user, 'requirement:create');
    const point = await this.meetings.loadVisiblePoint(pointId, user, id);
    if (point.meeting.isArchived) throw new BadRequestException('الاجتماع مؤرشف');
    // A blank line has nothing to track; the title would come out empty.
    if (!point.body.trim() && !dto.title?.trim()) {
      throw new BadRequestException('اكتب نص البند قبل التقاطه');
    }

    if (dto.systemId) {
      await this.access.assertCanFileAgainst(dto.systemId, point.meeting.companyId, user);
    }
    if (dto.ownerId) await this.assertOwnerExists(dto.ownerId);

    const requirement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.requirement.create({
        data: {
          title: dto.title?.trim() || titleFromBody(point.body),
          description: dto.description ?? point.body,
          source: RequirementSource.MEETING,
          meetingPointId: point.id,
          companyId: point.meeting.companyId,
          systemId: dto.systemId ?? null,
          priority: dto.priority ?? null,
          ownerId: dto.ownerId ?? null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          requestedById: point.raisedById,
          requestedByName: point.raisedByName,
          createdById: user.id,
        },
      });
      // Opening row, so the history reads as a full story rather than starting
      // at the first change somebody happened to make.
      await tx.requirementStatusHistory.create({
        data: {
          requirementId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedById: user.id,
          note: `التُقط من محضر ${formatMeetingCode(point.meeting.meetingNumber)}`,
        },
      });
      await cloneAttachments(
        tx,
        { meetingId: id },
        { requirementId: created.id },
        user.id,
      );
      // Read back last, so the reply carries the opening history row the
      // requirement page renders.
      return tx.requirement.findUniqueOrThrow({
        where: { id: created.id },
        include: REQUIREMENT_DETAIL_INCLUDE,
      });
    });

    await this.audit.log({
      action: 'REQUIREMENT_CAPTURE',
      entity: 'Requirement',
      entityId: requirement.id,
      userId: user.id,
      newValues: {
        title: requirement.title,
        requirementNumber: requirement.requirementNumber,
        source: requirement.source,
        meetingPointId: point.id,
        meetingId: id,
        systemId: requirement.systemId,
      },
    });
    await this.audit.log({
      action: 'MEETING_POINT_CAPTURE',
      entity: 'MeetingPoint',
      entityId: point.id,
      userId: user.id,
      newValues: {
        requirementId: requirement.id,
        requirementNumber: requirement.requirementNumber,
        meetingId: id,
      },
    });

    await this.announceRaised(requirement, user);
    if (requirement.ownerId) await this.announceAssigned(requirement, requirement.ownerId, user);

    return requirement;
  }

  // ----------------------------------------------------------------- helpers

  private listPoints(meetingId: string) {
    return this.prisma.meetingPoint.findMany({
      where: { meetingId },
      orderBy: { order: 'asc' },
      include: {
        raisedBy: PERSON,
        requirements: {
          select: { id: true, requirementNumber: true, title: true, status: true },
        },
      },
    });
  }

  private async moveTo(id: string, next: MeetingStatus, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    if (meeting.isArchived) throw new BadRequestException('الاجتماع مؤرشف ولا يمكن تعديله');
    if (meeting.status === next) return this.findOne(id, user);
    if (meeting.status !== MeetingStatus.SCHEDULED) {
      throw new BadRequestException('لا يمكن تغيير حالة اجتماع بعد انعقاده أو إلغائه');
    }

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: {
        status: next,
        ...(next === MeetingStatus.HELD && !meeting.heldAt ? { heldAt: new Date() } : {}),
      },
      include: MEETING_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: next === MeetingStatus.HELD ? 'MEETING_HELD' : 'MEETING_CANCEL',
      entity: 'Meeting',
      entityId: id,
      userId: user.id,
      oldValues: { status: meeting.status, heldAt: meeting.heldAt },
      newValues: { status: updated.status, heldAt: updated.heldAt },
    });

    return updated;
  }

  /** Meetings archive; they are never hard-deleted (req.md §21). */
  private async setArchived(id: string, isArchived: boolean, user: MeetingActor) {
    this.meetings.assertCanManage(user);
    const meeting = await this.meetings.loadVisibleMeeting(id, user);
    if (meeting.isArchived === isArchived) return this.findOne(id, user);

    const updated = await this.prisma.meeting.update({
      where: { id },
      data: { isArchived },
      include: MEETING_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: isArchived ? 'MEETING_ARCHIVE' : 'MEETING_UNARCHIVE',
      entity: 'Meeting',
      entityId: id,
      userId: user.id,
      oldValues: { isArchived: !isArchived },
      newValues: { isArchived },
    });

    return updated;
  }

  /**
   * A cancelled or archived meeting is a record, not a workspace. Minutes on one
   * would never be read, and editing the record of a meeting that was called off
   * is how a history stops being a history.
   */
  private assertEditable(meeting: { status: MeetingStatus; isArchived: boolean }): void {
    if (meeting.isArchived) throw new BadRequestException('الاجتماع مؤرشف ولا يمكن تعديله');
    if (meeting.status === MeetingStatus.CANCELLED) {
      throw new BadRequestException('الاجتماع ملغى ولا يمكن تعديله');
    }
  }

  /** Every system must live in the meeting's company and be one the caller holds. */
  private async resolveSystems(
    systemIds: string[],
    companyId: string,
    user: MeetingActor,
  ): Promise<string[]> {
    const unique = [...new Set(systemIds.filter(Boolean))];
    for (const systemId of unique) {
      await this.access.assertCanFileAgainst(systemId, companyId, user);
    }
    return unique;
  }

  private async assertRaiserExists(userId?: string | null) {
    if (!userId) return;
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('User not found');
  }

  private async assertOwnerExists(userId: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!account || !account.isActive) throw new NotFoundException('Owner not found');
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

  private searchWhere(search: string): Prisma.MeetingWhereInput {
    const or: Prisma.MeetingWhereInput[] = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      { location: { contains: search, mode: 'insensitive' } },
    ];
    const meetingNumber = parseMeetingNumberQuery(search);
    if (meetingNumber != null) or.push({ meetingNumber });
    return { OR: or };
  }
}

/**
 * Pure list move, shared in spirit with `cases.service`'s `moveTo`: pull the row
 * out, clamp the target, put it back. Kept local so the meetings module does not
 * reach into the QA surface for four lines of array maths.
 */
export function moveTo(ids: string[], id: string, target: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const rest = [...ids.slice(0, from), ...ids.slice(from + 1)];
  const to = Math.max(0, Math.min(target, rest.length));
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}
