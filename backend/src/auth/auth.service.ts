import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) return null;
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return null;
    return user;
  }

  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is inactive');
    return this.signToken(user);
  }

  async setPassword(dto: SetPasswordDto) {
    const invitation = await this.prisma.emailInvitation.findUnique({ where: { token: dto.token } });
    if (!invitation) throw new BadRequestException('Invalid token');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Token already used');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Token expired');

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.update({
      where: { id: invitation.receiverId! },
      data: { password: hash },
    });
    await this.prisma.emailInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED' } });
    return this.signToken(user);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // Always return success to avoid email enumeration
    if (!user || !user.isActive) return { message: 'If this email exists, a reset link has been sent' };

    // Invalidate any existing tokens for this user
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const token = uuid();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30);

    await this.prisma.passwordResetToken.create({ data: { token, userId: user.id, expiresAt } });

    const frontendUrl = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
    await this.email.sendPasswordReset(user.email, user.firstName, token, frontendUrl);

    return { message: 'If this email exists, a reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token: dto.token } });
    if (!record) throw new BadRequestException('الرابط غير صالح');
    if (record.usedAt) throw new BadRequestException('تم استخدام هذا الرابط من قبل');
    if (record.expiresAt < new Date()) throw new BadRequestException('انتهت صلاحية الرابط');

    const hash = await bcrypt.hash(dto.password, 10);
    await Promise.all([
      this.prisma.user.update({ where: { id: record.userId }, data: { password: hash } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return { message: 'تم تغيير كلمة المرور بنجاح' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.password) throw new BadRequestException('User not found');
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');
    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
    return { message: 'Password changed successfully' };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        company: true,
        department: true,
        systems: { include: { system: true } },
        companies: { include: { company: true } },
      },
    });
  }

  private signToken(user: { id: string; email: string; role: string; firstName?: string; lastName?: string; companyId?: string | null }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwt.sign(payload),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: user.companyId ?? null,
      },
    };
  }
}
