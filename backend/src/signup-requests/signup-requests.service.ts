import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvitationsService } from '../invitations/invitations.service';
import { CreateSignupRequestDto } from './dto/create-signup-request.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class SignupRequestsService {
  constructor(
    private prisma: PrismaService,
    private invitations: InvitationsService,
  ) {}

  async create(dto: CreateSignupRequestDto) {
    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new BadRequestException('هذا البريد الإلكتروني مسجل مسبقاً');

    const existingRequest = await this.prisma.signupRequest.findUnique({ where: { email: dto.email } });
    if (existingRequest) {
      if (existingRequest.status === 'PENDING') throw new BadRequestException('طلبك قيد المراجعة بالفعل');
      if (existingRequest.status === 'APPROVED') throw new BadRequestException('هذا البريد الإلكتروني مسجل مسبقاً');
      // REJECTED — allow reapplying by deleting old request
      await this.prisma.signupRequest.delete({ where: { id: existingRequest.id } });
    }

    return this.prisma.signupRequest.create({ data: dto });
  }

  findAll() {
    return this.prisma.signupRequest.findMany({
      include: {
        reviewedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(id: string, reviewer: any) {
    const req = await this.prisma.signupRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');
    if (req.status !== 'PENDING') throw new BadRequestException('الطلب تمت معالجته مسبقاً');

    await this.invitations.create(
      { email: req.email, role: UserRole.DEVELOPER, firstName: req.firstName, lastName: req.lastName },
      reviewer,
    );

    return this.prisma.signupRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedById: reviewer.id, reviewedAt: new Date() },
    });
  }

  async reject(id: string, reviewer: any) {
    const req = await this.prisma.signupRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('الطلب غير موجود');
    if (req.status !== 'PENDING') throw new BadRequestException('الطلب تمت معالجته مسبقاً');

    return this.prisma.signupRequest.update({
      where: { id },
      data: { status: 'REJECTED', reviewedById: reviewer.id, reviewedAt: new Date() },
    });
  }
}
