import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { Actor, assertCan } from '../access/permissions';
import { CreateGuideDto, UpdateGuideDto } from './dto/guide.dto';

const GUIDE_INCLUDE = {
  createdBy: { select: { id: true, firstName: true, lastName: true, role: true } },
  updatedBy: { select: { id: true, firstName: true, lastName: true, role: true } },
} satisfies Prisma.HubGuideInclude;

/**
 * Company-wide workflow rules on the hub. Same kit for every project — gated
 * by `tool:read` / `tool:manage` so hub managers edit the list.
 */
@Injectable()
export class GuidesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(user: Actor) {
    assertCan(user, 'tool:read');
    return this.prisma.hubGuide.findMany({
      include: GUIDE_INCLUDE,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateGuideDto, user: Actor) {
    assertCan(user, 'tool:manage');
    const sortOrder =
      dto.sortOrder ??
      ((await this.prisma.hubGuide.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ??
        -1) + 1;

    const guide = await this.prisma.hubGuide.create({
      data: {
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        steps: dto.steps.map((s) => s.trim()).filter(Boolean),
        sortOrder,
        createdById: user.id,
        updatedById: user.id,
      },
      include: GUIDE_INCLUDE,
    });

    await this.audit.log({
      action: 'HUB_GUIDE_CREATED',
      entity: 'HubGuide',
      entityId: guide.id,
      userId: user.id,
      newValues: { title: guide.title },
    });

    return guide;
  }

  async update(id: string, dto: UpdateGuideDto, user: Actor) {
    assertCan(user, 'tool:manage');
    const existing = await this.prisma.hubGuide.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Guide not found');

    const guide = await this.prisma.hubGuide.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.summary !== undefined ? { summary: dto.summary.trim() } : {}),
        ...(dto.steps !== undefined
          ? { steps: dto.steps.map((s) => s.trim()).filter(Boolean) }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        updatedById: user.id,
      },
      include: GUIDE_INCLUDE,
    });

    await this.audit.log({
      action: 'HUB_GUIDE_UPDATED',
      entity: 'HubGuide',
      entityId: guide.id,
      userId: user.id,
      oldValues: { title: existing.title },
      newValues: { title: guide.title },
    });

    return guide;
  }

  async remove(id: string, user: Actor) {
    assertCan(user, 'tool:manage');
    const existing = await this.prisma.hubGuide.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Guide not found');

    await this.prisma.hubGuide.delete({ where: { id } });

    await this.audit.log({
      action: 'HUB_GUIDE_DELETED',
      entity: 'HubGuide',
      entityId: id,
      userId: user.id,
      oldValues: { title: existing.title },
    });

    return { id };
  }
}
