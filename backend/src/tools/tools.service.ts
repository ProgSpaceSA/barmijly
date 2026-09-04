import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ToolStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Actor, assertCan, can, rolesWith } from '../access/permissions';
import {
  CreateToolDto,
  DecideToolDto,
  FilterToolsDto,
  UpdateToolDto,
} from './dto/tool.dto';

const TOOL_INCLUDE = {
  requestedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  decidedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
} satisfies Prisma.ToolInclude;

type ToolActor = Actor & { firstName?: string; lastName?: string };

/**
 * The dev section's tools catalogue.
 *
 * Deliberately unscoped: a tool is not owned by a company or a system, so
 * `AccessService` has nothing to say here. The only gate is the role matrix —
 * anyone in the dev section may ask, leadership decides.
 *
 * Nothing is ever deleted. A tool we said no to keeps its reason, and a tool we
 * stopped using is RETIRED, the same archive-never-delete rule tickets follow
 * (req.md §21).
 */
@Injectable()
export class ToolsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------- read

  /**
   * The catalogue. A reader without `tool:manage` only ever sees APPROVED rows,
   * enforced here rather than by trusting the caller's `status` param — a
   * developer asking for `?status=DECLINED` gets 403, not somebody else's
   * rejected ask.
   */
  async findAll(user: ToolActor, filters: FilterToolsDto) {
    assertCan(user, 'tool:read');
    const manages = can(user.role, 'tool:manage');

    if (filters.status && filters.status !== ToolStatus.APPROVED && !manages) {
      assertCan(user, 'tool:manage');
    }

    const and: Prisma.ToolWhereInput[] = [];
    if (filters.category) and.push({ categories: { has: filters.category } });
    if (filters.team) and.push({ teams: { has: filters.team } });
    if (filters.search) {
      and.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }

    if (filters.status) {
      and.push({ status: filters.status });
    } else if (!manages) {
      // Catalogue + own open asks. Declined rows stay out of «الكل» — pick
      // status=DECLINED only if a manager needs the archive (403 for others).
      and.push({
        OR: [
          { status: ToolStatus.APPROVED },
          {
            AND: [
              { requestedById: user.id },
              { status: { not: ToolStatus.DECLINED } },
            ],
          },
        ],
      });
    } else {
      // Managers' «الكل»: live kit + pending + retired — not rejected asks.
      and.push({ status: { not: ToolStatus.DECLINED } });
    }

    const where: Prisma.ToolWhereInput = and.length ? { AND: and } : {};

    const [data, approved, pending] = await Promise.all([
      this.prisma.tool.findMany({
        where,
        include: TOOL_INCLUDE,
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.tool.count({ where: { status: ToolStatus.APPROVED } }),
      manages ? this.prisma.tool.count({ where: { status: ToolStatus.REQUESTED } }) : 0,
    ]);

    return { data, total: data.length, approvedCount: approved, pendingCount: pending };
  }

  /** Badge for the hub's «الطلبات» tab. Leadership only — nobody else has a queue. */
  async pendingCount(user: ToolActor) {
    if (!can(user.role, 'tool:manage')) return { count: 0 };
    const count = await this.prisma.tool.count({ where: { status: ToolStatus.REQUESTED } });
    return { count };
  }

  async findOne(id: string, user: ToolActor) {
    assertCan(user, 'tool:read');
    const tool = await this.prisma.tool.findUnique({ where: { id }, include: TOOL_INCLUDE });
    if (!tool) throw new NotFoundException('الأداة غير موجودة');

    // A row that is neither live nor yours is not yours to read.
    const visible =
      tool.status === ToolStatus.APPROVED ||
      tool.requestedById === user.id ||
      can(user.role, 'tool:manage');
    if (!visible) throw new NotFoundException('الأداة غير موجودة');

    return tool;
  }

  // ------------------------------------------------------------------- write

  /**
   * Ask for a tool. Always lands at REQUESTED — there is no path here that puts
   * something straight into the catalogue, including for the role that could
   * approve it a second later. The decision stays a separate, audited act.
   */
  async create(dto: CreateToolDto, user: ToolActor) {
    assertCan(user, 'tool:request');

    const name = dto.name.trim();
    const clash = await this.prisma.tool.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        status: { in: [ToolStatus.REQUESTED, ToolStatus.APPROVED] },
      },
      select: { id: true, status: true },
    });
    if (clash) {
      throw new BadRequestException(
        clash.status === ToolStatus.APPROVED
          ? 'الأداة موجودة في الدليل بالفعل'
          : 'هناك طلب قائم على هذه الأداة',
      );
    }

    const tool = await this.prisma.tool.create({
      data: {
        name,
        website: dto.website.trim(),
        description: dto.description.trim(),
        gettingStarted: dto.gettingStarted.trim(),
        categories: dto.categories,
        teams: dto.teams,
        requestedById: user.id,
      },
      include: TOOL_INCLUDE,
    });

    await this.audit.log({
      action: 'TOOL_REQUESTED',
      entity: 'Tool',
      entityId: tool.id,
      userId: user.id,
      newValues: {
        name: tool.name,
        website: tool.website,
        categories: tool.categories,
        teams: tool.teams,
        status: tool.status,
      },
    });

    const deciders = await this.prisma.user.findMany({
      where: { role: { in: rolesWith('tool:manage') }, isActive: true },
      select: { id: true },
    });
    await this.notifications.notifyMany(
      deciders.map((row) => row.id),
      {
        type: NotificationType.TOOL_REQUESTED,
        title: 'طلب إضافة أداة',
        body: `${this.actorName(user)} طلب إضافة «${tool.name}»`,
        metadata: { toolId: tool.id, toolName: tool.name },
      },
      user.id,
    );

    return tool;
  }

  /** Fix the wording, the link, or the categories. Leadership only. */
  async update(id: string, dto: UpdateToolDto, user: ToolActor) {
    assertCan(user, 'tool:manage');
    const tool = await this.loadOrThrow(id);

    const data: Prisma.ToolUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.website !== undefined) data.website = dto.website.trim();
    if (dto.description !== undefined) data.description = dto.description.trim();
    if (dto.gettingStarted !== undefined) data.gettingStarted = dto.gettingStarted.trim();
    if (dto.categories !== undefined) data.categories = dto.categories;
    if (dto.teams !== undefined) data.teams = dto.teams;

    const updated = await this.prisma.tool.update({
      where: { id },
      data,
      include: TOOL_INCLUDE,
    });

    await this.audit.log({
      action: 'TOOL_UPDATE',
      entity: 'Tool',
      entityId: id,
      userId: user.id,
      oldValues: {
        name: tool.name,
        website: tool.website,
        description: tool.description,
        gettingStarted: tool.gettingStarted,
        categories: tool.categories,
        teams: tool.teams,
      },
      newValues: {
        name: updated.name,
        website: updated.website,
        description: updated.description,
        gettingStarted: updated.gettingStarted,
        categories: updated.categories,
        teams: updated.teams,
      },
    });

    return updated;
  }

  /** Into the catalogue. Only a REQUESTED row can be approved. */
  approve(id: string, user: ToolActor) {
    return this.decide(id, ToolStatus.APPROVED, user, null);
  }

  /** No, and here is why. The row stays so the ask does not come back. */
  decline(id: string, dto: DecideToolDto, user: ToolActor) {
    return this.decide(id, ToolStatus.DECLINED, user, dto.note.trim());
  }

  /** We used it, we stopped. Only an approved tool can be retired. */
  retire(id: string, dto: DecideToolDto, user: ToolActor) {
    return this.decide(id, ToolStatus.RETIRED, user, dto.note.trim());
  }

  // ----------------------------------------------------------------- helpers

  private async decide(
    id: string,
    status: ToolStatus,
    user: ToolActor,
    note: string | null,
  ) {
    assertCan(user, 'tool:manage');
    const tool = await this.loadOrThrow(id);

    if (tool.status === status) throw new BadRequestException('الأداة في هذه الحالة بالفعل');

    if (status === ToolStatus.RETIRED) {
      if (tool.status !== ToolStatus.APPROVED) {
        throw new BadRequestException('يمكن إيقاف الأدوات المعتمدة فقط');
      }
    } else if (tool.status !== ToolStatus.REQUESTED) {
      // Approve and decline are answers to a question. A row that has already
      // been answered is reopened by a fresh request, not by a second verdict.
      throw new BadRequestException('تم البتّ في هذا الطلب من قبل');
    }

    const updated = await this.prisma.tool.update({
      where: { id },
      data: {
        status,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note,
      },
      include: TOOL_INCLUDE,
    });

    await this.audit.log({
      action: `TOOL_${status}`,
      entity: 'Tool',
      entityId: id,
      userId: user.id,
      oldValues: { status: tool.status, name: tool.name },
      newValues: { status, name: tool.name, note },
    });

    await this.notifications.notify(
      tool.requestedById,
      {
        type: NotificationType.TOOL_DECIDED,
        title: DECISION_TITLES[status],
        body: note
          ? `«${tool.name}» — ${note}`
          : `${this.actorName(user)} اعتمد «${tool.name}»`,
        metadata: { toolId: id, toolName: tool.name, status },
      },
      user.id,
    );

    return updated;
  }

  private async loadOrThrow(id: string) {
    const tool = await this.prisma.tool.findUnique({ where: { id } });
    if (!tool) throw new NotFoundException('الأداة غير موجودة');
    return tool;
  }

  private actorName(user: ToolActor) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }
}

const DECISION_TITLES: Record<string, string> = {
  [ToolStatus.APPROVED]: 'تم اعتماد الأداة',
  [ToolStatus.DECLINED]: 'لم تُعتمد الأداة',
  [ToolStatus.RETIRED]: 'أُوقف استخدام الأداة',
};
