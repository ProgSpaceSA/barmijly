import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationType } from '@prisma/client';

interface NotifyPayload {
  type: NotificationType;
  title: string;
  body: string;
  ticketId?: string;
  metadata?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async notify(userId: string, payload: NotifyPayload) {
    return this.prisma.notification.create({
      data: { userId, ...payload },
    });
  }

  async notifyMany(userIds: string[], payload: NotifyPayload) {
    return this.prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...payload })),
    });
  }

  async findAll(userId: string, unreadOnly = false, page = 1, limit = 20) {
    const where = { userId, ...(unreadOnly && { isRead: false }) };
    const skip  = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
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

  async countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }
}
