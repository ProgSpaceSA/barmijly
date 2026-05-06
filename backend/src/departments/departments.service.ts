import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  findAll(companyId?: string) {
    return this.prisma.department.findMany({
      where: { ...(companyId && { companyId }) },
      include: { company: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: { company: true, users: true },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto, include: { company: true } });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: dto, include: { company: true } });
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.department.update({ where: { id }, data: { isActive: false } });
  }
}
