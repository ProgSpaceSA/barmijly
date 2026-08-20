import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  /** req.md §16: each company sees its own — the group tree is not public. */
  async findAll(user: any) {
    const scope = await this.access.companyListWhere(user);
    const systemScope = await this.access.systemListWhere(user);
    return this.prisma.company.findMany({
      where: scope,
      include: {
        departments: { orderBy: { name: 'asc' } },
        // Nested systems follow the same rule as GET /systems.
        systems: { where: systemScope, orderBy: { name: 'asc' } },
        _count: { select: { users: true, tickets: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, user: any) {
    const systemScope = await this.access.systemListWhere(user);
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        departments: true,
        systems: { where: systemScope },
        _count: { select: { users: true, tickets: true } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');
    await this.access.assertCanViewCompany(id, user);
    return company;
  }

  /** Existence check for internal callers that have already authorised. */
  private async requireCompany(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  create(dto: CreateCompanyDto) {
    return this.prisma.company.create({ data: dto });
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.requireCompany(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async uploadLogo(id: string, file: Express.Multer.File) {
    await this.requireCompany(id);
    const logoUrl = `/uploads/${file.filename}`;
    return this.prisma.company.update({ where: { id }, data: { logoUrl } });
  }

  async deactivate(id: string) {
    await this.requireCompany(id);
    return this.prisma.company.update({ where: { id }, data: { isActive: false } });
  }
}
