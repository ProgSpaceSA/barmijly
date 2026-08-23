import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { canManageStructure } from '../access/permissions';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';

@Injectable()
export class SystemsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private audit: AuditService,
  ) {}

  /** req.md §16: a user only ever sees the systems they are authorised for. */
  async findAll(user: any, companyId?: string) {
    const scope = await this.access.systemListWhere(user);
    return this.prisma.system.findMany({
      where: { ...scope, ...(companyId && { companyId }), isActive: true },
      include: { company: true, _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user: any) {
    const system = await this.prisma.system.findUnique({
      where: { id },
      include: { company: true, userSystems: { include: { user: true } } },
    });
    if (!system) throw new NotFoundException('System not found');
    await this.access.assertCanViewSystem(id, user);
    return system;
  }

  /** Existence check for internal callers that have already authorised. */
  private async requireSystem(id: string) {
    const system = await this.prisma.system.findUnique({ where: { id } });
    if (!system) throw new NotFoundException('System not found');
    return system;
  }

  async create(dto: CreateSystemDto, actor?: any) {
    if (actor) {
      await this.access.assertCanCreateSystem(actor, dto.companyId);
    }
    const system = await this.prisma.system.create({ data: dto, include: { company: true } });
    if (actor?.id) {
      await this.audit.log({
        action: 'SYSTEM_CREATE',
        entity: 'System',
        entityId: system.id,
        userId: actor.id,
        newValues: { name: system.name, companyId: system.companyId },
      });
    }
    return system;
  }

  async update(id: string, dto: UpdateSystemDto, actor?: any) {
    if (actor && !canManageStructure(actor.role)) {
      throw new ForbiddenException('Access denied');
    }
    await this.requireSystem(id);
    return this.prisma.system.update({ where: { id }, data: dto, include: { company: true } });
  }

  async deactivate(id: string, actor?: any) {
    if (actor && !canManageStructure(actor.role)) {
      throw new ForbiddenException('Access denied');
    }
    await this.requireSystem(id);
    return this.prisma.system.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string, actor?: any) {
    if (actor && !canManageStructure(actor.role)) {
      throw new ForbiddenException('Access denied');
    }
    await this.requireSystem(id);
    return this.prisma.system.update({ where: { id }, data: { isActive: true } });
  }

  async addUser(systemId: string, userId: string, actor?: any) {
    const system = await this.requireSystem(systemId);
    if (actor) {
      await this.access.assertCanManageRoster(actor, systemId);
    }

    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) throw new NotFoundException('User not found');
    if (!target.isActive) throw new ForbiddenException('User is not active');
    if (target.role !== UserRole.DEVELOPER && target.role !== UserRole.QA) {
      throw new ForbiddenException('Only developers and QA can be added to a system roster');
    }

    const row = await this.prisma.userSystem.upsert({
      where: { userId_systemId: { userId, systemId } },
      update: {},
      create: { userId, systemId },
    });

    if (actor?.id) {
      await this.audit.log({
        action: 'SYSTEM_ROSTER_ADD',
        entity: 'System',
        entityId: systemId,
        userId: actor.id,
        newValues: { userId, systemName: system.name, companyId: system.companyId },
      });
    }

    return row;
  }

  async removeUser(systemId: string, userId: string, actor?: any) {
    const system = await this.requireSystem(systemId);
    if (actor) {
      await this.access.assertCanManageRoster(actor, systemId);
    }

    const row = await this.prisma.userSystem.delete({
      where: { userId_systemId: { userId, systemId } },
    });

    if (actor?.id) {
      await this.audit.log({
        action: 'SYSTEM_ROSTER_REMOVE',
        entity: 'System',
        entityId: systemId,
        userId: actor.id,
        oldValues: { userId, systemName: system.name, companyId: system.companyId },
      });
    }

    return row;
  }
}
