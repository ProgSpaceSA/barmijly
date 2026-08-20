import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  /** Departments belong to a company, so they inherit the company scope. */
  async findAll(user: any, companyId?: string) {
    const companyIds = await this.access.visibleCompanyIds(user);
    return this.prisma.department.findMany({
      where: {
        ...(companyIds === null ? {} : { companyId: { in: companyIds } }),
        ...(companyId && { companyId }),
      },
      include: { company: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user: any) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: { company: true, users: true },
    });
    if (!dept) throw new NotFoundException('Department not found');
    await this.access.assertCanViewCompany(dept.companyId, user);
    return dept;
  }

  /** Existence check for internal callers that have already authorised. */
  private async requireDepartment(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  create(dto: CreateDepartmentDto) {
    return this.prisma.department.create({ data: dto, include: { company: true } });
  }

  async update(id: string, dto: UpdateDepartmentDto) {
    await this.requireDepartment(id);
    return this.prisma.department.update({ where: { id }, data: dto, include: { company: true } });
  }

  async deactivate(id: string) {
    await this.requireDepartment(id);
    return this.prisma.department.update({ where: { id }, data: { isActive: false } });
  }
}
