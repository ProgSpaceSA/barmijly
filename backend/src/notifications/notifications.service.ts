import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import type { Actor } from '../access/permissions';
import { NotificationType, Prisma } from '@prisma/client';

interface NotifyPayload {
  type: NotificationType;
  title: string;
  body: string;
  ticketId?: string;
  metadata?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  async notify(userId: string, payload: NotifyPayload, actorId: string) {
    if (userId === actorId) return;
    return this.prisma.notification.create({
      data: { userId, ...payload },
    });
  }

  async notifyMany(userIds: string[], payload: NotifyPayload, actorId: string) {
    const unique = [...new Set(userIds)].filter((id) => id && id !== actorId);
    if (!unique.length) return { count: 0 };
    return this.prisma.notification.createMany({
      data: unique.map((userId) => ({ userId, ...payload })),
    });
  }

  async findAll(user: Actor, unreadOnly = false, page = 1, limit = 20) {
    const where = await this.scopedWhere(user, unreadOnly);
    const skip  = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              ticketNumber: true,
              estimatedDeadline: true,
              status: true,
              company: { select: { id: true, name: true, logoUrl: true } },
              system: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async markTicketRead(ticketId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, ticketId, isRead: false },
      data: { isRead: true },
    });
  }

  async countUnread(user: Actor) {
    return this.prisma.notification.count({ where: await this.scopedWhere(user, true) });
  }

  /**
   * Notifications addressed to the user, minus any whose ticket has since moved
   * out of their reach.
   *
   * Being the addressee is the primary filter, but a portfolio can be taken
   * away after the fact, and the row carries the ticket title. Notifications
   * with no ticket attached are always kept.
   */
  private async scopedWhere(user: Actor, unreadOnly: boolean): Promise<Prisma.NotificationWhereInput> {
    const base: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(unreadOnly && { isRead: false }),
    };

    const scope = await this.access.ticketScope(user);
    if (!scope) return base;

    return { ...base, OR: [{ ticketId: null }, { ticket: scope }] };
  }
}
