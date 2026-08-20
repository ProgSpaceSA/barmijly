import {
  Injectable, BadRequestException, NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { can } from '../access/permissions';
import { User, UserRole } from '@prisma/client';
import { v4 as uuid } from 'uuid';

/** Roles that carry administrative reach and cannot be handed out casually. */
const PRIVILEGED_ROLES: UserRole[] = [
  UserRole.PROGRAMMING_HEAD,
  UserRole.PROJECT_MANAGER,
  UserRole.SENIOR_MANAGEMENT,
];

@Injectable()
export class InvitationsService {
  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async create(dto: CreateInvitationDto, sender: User) {
    // An invitation creates a live account with the stated role, so handing out
    // a privileged one is the same escalation as editing a role in place.
    if (PRIVILEGED_ROLES.includes(dto.role) && !can(sender.role, 'user:assign-role')) {
      throw new ForbiddenException('Only the head of programming can invite a privileged role');
    }

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) throw new BadRequestException('User with this email already exists');

    const { email, role, companyIds, departmentId, systemIds, firstName, lastName } = dto;
    const primaryCompanyId = companyIds?.[0] ?? null;

    const newUser = await this.prisma.user.create({
      data: {
        email,
        role,
        firstName: firstName || '',
        lastName: lastName || '',
        companyId: primaryCompanyId,
        departmentId,
        ...(systemIds && {
          systems: { create: systemIds.map((sid) => ({ systemId: sid })) },
        }),
        ...(companyIds?.length && {
          companies: { create: companyIds.map((cid) => ({ companyId: cid })) },
        }),
      },
    });

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    const token = uuid();

    const invitation = await this.prisma.emailInvitation.create({
      data: {
        email,
        role,
        token,
        expiresAt,
        senderId: sender.id,
        receiverId: newUser.id,
        companyId: primaryCompanyId,
      },
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    await this.email.sendInvitation(email, token, role, frontendUrl);

    return invitation;
  }

  async resend(id: string) {
    const invitation = await this.prisma.emailInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING' && invitation.status !== 'EXPIRED') {
      throw new BadRequestException('Invitation cannot be resent');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    const token = uuid();

    await this.prisma.emailInvitation.update({
      where: { id },
      data: { token, expiresAt, status: 'PENDING' },
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    await this.email.sendInvitation(invitation.email, token, invitation.role, frontendUrl);

    return { message: 'Invitation resent' };
  }

  async revoke(id: string) {
    const invitation = await this.prisma.emailInvitation.findUnique({ where: { id } });
    if (!invitation) throw new NotFoundException('Invitation not found');
    return this.prisma.emailInvitation.update({ where: { id }, data: { status: 'REVOKED' } });
  }

  findAll() {
    return this.prisma.emailInvitation.findMany({
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
        receiver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
