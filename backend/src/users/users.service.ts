import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: { role?: UserRole; companyId?: string; isActive?: boolean }) {
    return this.prisma.user.findMany({
      where: {
        ...(filters.role && { role: filters.role }),
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      include: { company: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        company: true,
        department: true,
        systems: { include: { system: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const { systemIds, ...data } = dto;
    return this.prisma.user.create({
      data: {
        ...data,
        ...(systemIds && {
          systems: {
            create: systemIds.map((systemId) => ({ systemId })),
          },
        }),
      },
      include: { company: true, department: true, systems: { include: { system: true } } },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const { systemIds, ...data } = dto;

    if (systemIds !== undefined) {
      await this.prisma.userSystem.deleteMany({ where: { userId: id } });
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(systemIds && {
          systems: {
            create: systemIds.map((systemId) => ({ systemId })),
          },
        }),
      },
      include: { company: true, department: true, systems: { include: { system: true } } },
    });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  async getDevelopers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.DEVELOPER, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  }
}
