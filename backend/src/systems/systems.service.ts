import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSystemDto } from './dto/create-system.dto';
import { UpdateSystemDto } from './dto/update-system.dto';

@Injectable()
export class SystemsService {
  constructor(private prisma: PrismaService) {}

  findAll(companyId?: string) {
    return this.prisma.system.findMany({
      where: { ...(companyId && { companyId }), isActive: true },
      include: { company: true, _count: { select: { tickets: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const system = await this.prisma.system.findUnique({
      where: { id },
      include: { company: true, userSystems: { include: { user: true } } },
    });
    if (!system) throw new NotFoundException('System not found');
    return system;
  }

  create(dto: CreateSystemDto) {
    return this.prisma.system.create({ data: dto, include: { company: true } });
  }

  async update(id: string, dto: UpdateSystemDto) {
    await this.findOne(id);
    return this.prisma.system.update({ where: { id }, data: dto, include: { company: true } });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.system.update({ where: { id }, data: { isActive: false } });
  }

  async addUser(systemId: string, userId: string) {
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
