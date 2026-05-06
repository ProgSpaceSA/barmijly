import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
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
    const invitation = await this.prisma.emailInvitation.findUnique({
      where: { token: dto.token },
    });
    if (!invitation) throw new BadRequestException('Invalid token');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Token already used');
    if (invitation.expiresAt < new Date()) throw new BadRequestException('Token expired');

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.update({
      where: { id: invitation.receiverId! },
      data: { password: hash },
    });

    await this.prisma.emailInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' },
    });

    return this.signToken(user);
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
      include: { company: true, department: true, systems: { include: { system: true } } },
    });
  }

  private signToken(user: { id: string; email: string; role: string }) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
