import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { UserRole, NotificationType } from '@prisma/client';

const MANAGERS = [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT];

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async create(ticketId: string, dto: CreateTaskDto, user: any) {
    if (!MANAGERS.includes(user.role)) throw new ForbiddenException('Only managers can create tasks');

    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const task = await this.prisma.ticketTask.create({
      data: { ticketId, title: dto.title, description: dto.description, assignedToId: dto.assignedToId, createdById: user.id, ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}) },
      include: {
        assignedTo:  { select: { id: true, firstName: true, lastName: true } },
        createdBy:   { select: { id: true, firstName: true, lastName: true } },
        attachments: true,
      },
    });

    if (dto.assignedToId !== user.id) {
      await this.notifications.notify(dto.assignedToId, {
        type: NotificationType.TASK_ASSIGNED,
        title: 'تم تكليفك بمهمة جديدة',
        body: `${user.firstName} ${user.lastName} كلّفك بمهمة في التذكرة "${ticket.title}"`,
        ticketId,
      });

      const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
      const developer = await this.prisma.user.findUnique({
        where: { id: dto.assignedToId },
        select: { email: true, firstName: true },
      });
      if (developer?.email) {
        this.email.sendTaskAssigned(
          developer.email,
          developer.firstName,
          task.title,
          ticket.title,
          `${frontendUrl}/tickets/${ticketId}`,
          `${user.firstName} ${user.lastName}`,
        );
      }
    }

    return task;
  }

  async findByTicket(ticketId: string) {
    return this.prisma.ticketTask.findMany({
      where: { ticketId },
      include: {
        assignedTo:  { select: { id: true, firstName: true, lastName: true } },
        createdBy:   { select: { id: true, firstName: true, lastName: true } },
        attachments: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(id: string, dto: UpdateTaskDto, user: any) {
    const task = await this.prisma.ticketTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    const isManager = MANAGERS.includes(user.role);
    const isAssignee = task.assignedToId === user.id;

    if (!isManager && !isAssignee) throw new ForbiddenException('Access denied');

    // Developers can only change status, not title/description
    const data: any = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (isManager) {
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
    }

    return this.prisma.ticketTask.update({
      where: { id },
      data,
      include: {
        assignedTo:  { select: { id: true, firstName: true, lastName: true } },
        createdBy:   { select: { id: true, firstName: true, lastName: true } },
        attachments: true,
      },
    });
  }

  async remove(id: string, user: any) {
    if (!MANAGERS.includes(user.role)) throw new ForbiddenException('Only managers can delete tasks');
    const task = await this.prisma.ticketTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.ticketTask.delete({ where: { id } });
  }
}
