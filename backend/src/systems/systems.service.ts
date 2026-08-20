import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';

@Injectable()
export class SystemsService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

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

  create(dto: CreateSystemDto) {
    return this.prisma.system.create({ data: dto, include: { company: true } });
  }

  async update(id: string, dto: UpdateSystemDto) {
    await this.requireSystem(id);
    return this.prisma.system.update({ where: { id }, data: dto, include: { company: true } });
  }

  async deactivate(id: string) {
    await this.requireSystem(id);
    return this.prisma.system.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.requireSystem(id);
    return this.prisma.system.update({ where: { id }, data: { isActive: true } });
  }

  async addUser(systemId: string, userId: string) {
    await this.requireSystem(systemId);
    return this.prisma.userSystem.upsert({
      where: { userId_systemId: { userId, systemId } },
      update: {},
      create: { userId, systemId },
    });
  }

  async removeUser(systemId: string, userId: string) {
    return this.prisma.userSystem.delete({
      where: { userId_systemId: { userId, systemId } },
    });
  }
}
