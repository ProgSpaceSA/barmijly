import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UserRole, NotificationType } from '@prisma/client';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
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
      await this.notifications.notifyMany(dto.mentions.filter((id: string) => id !== user.id), {
        type: NotificationType.COMMENT_ADDED,
        title: 'You were mentioned in a comment',
        body: `${user.firstName} ${user.lastName} mentioned you in "${ticket.title}"`,
        ticketId,
      });
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
