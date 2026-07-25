import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UserRole, NotificationType } from '@prisma/client';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async create(ticketId: string, dto: CreateCommentDto, user: any) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (dto.visibility === 'INTERNAL' && user.role === UserRole.TICKET_REQUESTER) {
      throw new ForbiddenException('Cannot create internal comments');
    }

    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: user.id,
        content: dto.content,
        visibility: dto.visibility || 'PUBLIC',
        mentions: dto.mentions || [],
      },
      include: { author: { select: { id: true, firstName: true, lastName: true } } },
    });

    if (ticket.creatorId !== user.id) {
      await this.notifications.notify(ticket.creatorId, {
        type: NotificationType.COMMENT_ADDED,
        title: 'New comment on your ticket',
        body: `${user.firstName} ${user.lastName} commented on "${ticket.title}"`,
        ticketId,
      });
    }

    if (dto.mentions && dto.mentions.length > 0) {
      const mentionedIds = dto.mentions.filter((id: string) => id !== user.id);

      await this.notifications.notifyMany(mentionedIds, {
        type: NotificationType.COMMENT_ADDED,
        title: 'You were mentioned in a comment',
        body: `${user.firstName} ${user.lastName} mentioned you in "${ticket.title}"`,
        ticketId,
      });

      const mentionedUsers = await this.prisma.user.findMany({
        where: { id: { in: mentionedIds } },
        select: { email: true },
      });

      const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      const ticketUrl = `${frontendUrl}/tickets/${ticketId}`;
      const mentionerName = `${user.firstName} ${user.lastName}`;

      for (const u of mentionedUsers) {
        await this.email.sendMentionEmail(u.email, mentionerName, ticket.title, ticketUrl);
      }
    }

    return comment;
  }

  async update(id: string, content: string, user: any) {
    const comment = await this.prisma.ticketComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id) throw new ForbiddenException('Not your comment');
    return this.prisma.ticketComment.update({ where: { id }, data: { content } });
  }

  async delete(id: string, user: any) {
    const comment = await this.prisma.ticketComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    const managerRoles: string[] = [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER];
    const canDelete = comment.authorId === user.id || managerRoles.includes(user.role);
    if (!canDelete) throw new ForbiddenException('Cannot delete this comment');
    return this.prisma.ticketComment.delete({ where: { id } });
  }
}
