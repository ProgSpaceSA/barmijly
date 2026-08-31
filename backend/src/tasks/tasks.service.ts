import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { assertCan, can } from '../access/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { AssignmentSyncService } from '../tickets/assignment-sync.service';
import { TaskRollupService } from '../tickets/task-rollup.service';
import { taskClockFields } from '../tickets/transitions';
import { moveTo } from '../testing/cases.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { assertNotBlocked, attachBlockers } from './task-order';
import { NotificationType, TaskStatus } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaService;

/** Shape returned to the client — assignee, creator and files, never a bare row. */
const TASK_INCLUDE = {
  assignedTo:  { select: { id: true, firstName: true, lastName: true } },
  createdBy:   { select: { id: true, firstName: true, lastName: true } },
  attachments: true,
} as const;

/**
 * List order. `createdAt` breaks the tie two simultaneous creates can leave;
 * the next reorder or delete pulls the list back to contiguous positions.
 */
const TASK_ORDER = [{ order: 'asc' as const }, { createdAt: 'asc' as const }];

/** Just enough of a sibling to answer «is this task blocked?». */
const BLOCK_FIELDS = {
  id: true,
  ticketId: true,
  order: true,
  title: true,
  status: true,
  isBlocking: true,
} as const;

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private notifications: NotificationsService,
    private audit: AuditService,
    private email: EmailService,
    private assignments: AssignmentSyncService,
    private rollup: TaskRollupService,
    private config: ConfigService,
  ) {}

  async create(ticketId: string, dto: CreateTaskDto, user: any) {
    const isManager = can(user.role, 'task:manage');
    if (!isManager) assertCan(user, 'task:create-own');

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        company: { select: { name: true } },
        system: { select: { name: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.access.assertCanViewTicket(ticketId, user);

    // A developer breaks down their own work, and only their own: handing work
    // to someone else is a scoping decision, and it stays with leadership.
    if (!isManager) {
      if (dto.assignedToId !== user.id) {
        throw new ForbiddenException('يمكنك إنشاء مهام لنفسك فقط');
      }
      const onTicket = await this.prisma.ticketAssignment.findFirst({
        where: { ticketId, developerId: user.id, isActive: true },
      });
      if (!onTicket) throw new ForbiddenException('يمكنك إضافة مهام على التذاكر المسندة إليك فقط');
    }

    // The assignee gets the ticket in their queue, so they must be someone who
    // is allowed to see it.
    const [eligible] = await this.access.filterMentionable(ticket, [dto.assignedToId]);
    if (!eligible) throw new ForbiddenException('Assignee cannot access this ticket');

    const task = await this.prisma.$transaction(async (tx) => {
      // New work lands at the bottom of the list; a manager drags it up.
      const below = await tx.ticketTask.count({ where: { ticketId } });
      const created = await tx.ticketTask.create({
        data: {
          ticketId,
          title: dto.title,
          description: dto.description,
          assignedToId: dto.assignedToId,
          createdById: user.id,
          estimatedHours: dto.estimatedHours,
          difficultyLevel: dto.difficultyLevel,
          order: below,
          // A blocker gates work that is not the author's own, so setting one
          // is a scoping call and stays with whoever manages the ticket.
          isBlocking: isManager ? dto.isBlocking ?? false : false,
          ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
        },
        include: TASK_INCLUDE,
      });
      // Holding a task puts you on the ticket. Same transaction as the task
      // write, so a task and its assignee can never disagree.
      await this.assignments.syncFromTasks(ticketId, tx);
      await this.rollup.recompute(ticketId, tx);
      return created;
    });

    await this.audit.log({
      action: 'TASK_CREATE',
      entity: 'TicketTask',
      entityId: task.id,
      userId: user.id,
      ticketId,
      newValues: {
        title: task.title,
        assignedToId: task.assignedToId,
        estimatedHours: task.estimatedHours,
        difficultyLevel: task.difficultyLevel,
        order: task.order,
        isBlocking: task.isBlocking,
      },
    });

    if (dto.assignedToId !== user.id) {
      await this.notifications.notify(dto.assignedToId, {
        type: NotificationType.TASK_ASSIGNED,
        title: 'تم تكليفك بمهمة جديدة',
        body: `${user.firstName} ${user.lastName} كلّفك بمهمة في التذكرة "${ticket.title}"`,
        ticketId,
      }, user.id);

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
          ticket.ticketNumber,
          {
            companyName: ticket.company.name,
            systemName: ticket.system.name,
          },
        );
      }
    }

    return task;
  }

  async findMyTasks(user: any) {
    const mine = await this.prisma.ticketTask.findMany({
      where: { assignedToId: user.id },
      include: {
        ticket: {
          select: {
            id: true,
            title: true,
            ticketNumber: true,
            status: true,
            estimatedDeadline: true,
            company: { select: { id: true, name: true, logoUrl: true } },
          },
        },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'asc' },
      ],
    });

    // The blocker above one of my tasks is usually somebody else's, so it takes
    // a query of its own rather than falling out of the rows I hold.
    const blockers = await this.prisma.ticketTask.findMany({
      where: {
        ticketId: { in: [...new Set(mine.map((row) => row.ticketId))] },
        isBlocking: true,
        status: { not: TaskStatus.COMPLETED },
      },
      select: BLOCK_FIELDS,
    });

    return attachBlockers(mine, blockers);
  }

  async findByTicket(ticketId: string, user: any) {
    await this.access.assertCanViewTicket(ticketId, user);
    const tasks = await this.prisma.ticketTask.findMany({
      where: { ticketId },
      include: TASK_INCLUDE,
      orderBy: TASK_ORDER,
    });
    return attachBlockers(tasks, tasks);
  }

  /**
   * Moves a task and rewrites only the positions that actually changed.
   *
   * Rewriting the whole list would work, but every write bumps `updatedAt` and
   * the dashboard feed sorts on it — one drag would throw every task on the
   * ticket to the top of everyone's queue.
   */
  async reorder(id: string, order: number, user: any) {
    // Order decides what runs first, so it belongs to whoever scopes the
    // ticket. A developer reorders nothing, not even their own tasks.
    assertCan(user, 'task:manage');

    const task = await this.prisma.ticketTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertCanViewTicket(task.ticketId, user);

    const siblings = await this.siblings(task.ticketId);
    const reordered = moveTo(siblings.map((row) => row.id), id, order);
    const positions = new Map(siblings.map((row) => [row.id, row.order]));
    const moved = reordered
      .map((rowId, index) => ({ rowId, index }))
      .filter(({ rowId, index }) => positions.get(rowId) !== index);

    if (moved.length) {
      await this.prisma.$transaction(
        moved.map(({ rowId, index }) =>
          this.prisma.ticketTask.update({ where: { id: rowId }, data: { order: index } }),
        ),
      );

      await this.audit.log({
        action: 'TASK_REORDER',
        entity: 'TicketTask',
        entityId: id,
        userId: user.id,
        ticketId: task.ticketId,
        oldValues: { title: task.title, order: task.order },
        newValues: { title: task.title, order: reordered.indexOf(id) },
      });
    }

    return this.findByTicket(task.ticketId, user);
  }

  async update(id: string, dto: UpdateTaskDto, user: any) {
    const task = await this.prisma.ticketTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');

    const isManager = can(user.role, 'task:manage');
    const isAssignee = task.assignedToId === user.id;

    if (!isManager && !isAssignee) throw new ForbiddenException('Access denied');
    await this.access.assertCanViewTicket(task.ticketId, user);

    // The assignee owns how the work is going — status, and their own estimate.
    // What the work *is*, who it belongs to and when it is due stay with the
    // manager who scoped it.
    const data: any = {};
    if (dto.status !== undefined) {
      // Starting or finishing a task is the claim the blocker above it exists
      // to refuse. Sending it back to NEW is always allowed — that is how a
      // mistaken start is undone.
      if (dto.status !== TaskStatus.NEW) {
        assertNotBlocked(await this.siblings(task.ticketId), task);
      }
      data.status = dto.status;
      Object.assign(data, taskClockFields(task, dto.status));
    }
    if (dto.estimatedHours !== undefined) data.estimatedHours = dto.estimatedHours;
    if (dto.difficultyLevel !== undefined) data.difficultyLevel = dto.difficultyLevel;
    if (isManager) {
      if (dto.title !== undefined) data.title = dto.title;
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      if (dto.assignedToId !== undefined && dto.assignedToId !== task.assignedToId) {
        // A reassignment hands the ticket to someone new, so it is the same
        // eligibility question create() asks.
        const ticket = await this.prisma.ticket.findUnique({ where: { id: task.ticketId } });
        if (!ticket) throw new NotFoundException('Ticket not found');
        const [eligible] = await this.access.filterMentionable(ticket, [dto.assignedToId]);
        if (!eligible) throw new ForbiddenException('Assignee cannot access this ticket');
        data.assignedToId = dto.assignedToId;
      }
      if (dto.isBlocking !== undefined) data.isBlocking = dto.isBlocking;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.ticketTask.update({ where: { id }, data, include: TASK_INCLUDE });
      if (data.assignedToId) await this.assignments.syncFromTasks(task.ticketId, tx);
      if (data.estimatedHours !== undefined || data.difficultyLevel !== undefined) {
        await this.rollup.recompute(task.ticketId, tx);
      }
      return next;
    });

    // Always keep title + assignee so the timeline can name the task and its
    // holder; then record only the fields that actually moved, with before/after.
    const taskAuditValue = (key: string, value: unknown) => {
      if (key === 'dueDate' && value instanceof Date) return value.toISOString().slice(0, 10);
      if (key === 'dueDate' && typeof value === 'string' && value) return value.slice(0, 10);
      return value ?? null;
    };
    const oldValues: Record<string, unknown> = {
      title: task.title,
      assignedToId: task.assignedToId,
    };
    const newValues: Record<string, unknown> = {
      title: data.title !== undefined ? data.title : task.title,
      assignedToId: data.assignedToId !== undefined ? data.assignedToId : task.assignedToId,
    };
    for (const key of Object.keys(data)) {
      oldValues[key] = taskAuditValue(key, (task as Record<string, unknown>)[key]);
      newValues[key] = taskAuditValue(key, data[key]);
    }

    await this.audit.log({
      action: data.status !== undefined ? 'TASK_STATUS_CHANGE' : 'TASK_UPDATE',
      entity: 'TicketTask',
      entityId: id,
      userId: user.id,
      ticketId: task.ticketId,
      oldValues,
      newValues,
    });

    if (data.assignedToId) {
      await this.notifications.notify(data.assignedToId, {
        type: NotificationType.TASK_ASSIGNED,
        title: 'تم تكليفك بمهمة',
        body: `${user.firstName} ${user.lastName} نقل إليك مهمة «${updated.title}»`,
        ticketId: task.ticketId,
      }, user.id);
    }

    // The client writes this row straight into its cache, so it has to carry
    // the block state or the row would look free until the next refetch — and
    // completing a blocker releases the rows under it in the same breath.
    const [withBlocker] = attachBlockers([updated], await this.siblings(task.ticketId));
    return withBlocker;
  }

  async remove(id: string, user: any) {
    const isManager = can(user.role, 'task:manage');
    if (!isManager) assertCan(user, 'task:create-own');

    const task = await this.prisma.ticketTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Task not found');
    await this.access.assertCanViewTicket(task.ticketId, user);

    // Deleting your own not-yet-started task is tidying up. Anything else is a
    // record of work that happened, and only a manager removes that. Kept as a
    // row check rather than another action — the rule is inherently per-row.
    if (!isManager) {
      const ownAndUntouched =
        task.createdById === user.id &&
        task.assignedToId === user.id &&
        task.status === TaskStatus.NEW;
      if (!ownAndUntouched) {
        throw new ForbiddenException('يمكنك حذف مهامك التي لم تبدأ فقط');
      }
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const gone = await tx.ticketTask.delete({ where: { id } });
      // Close the gap the row left, so «المهمة ٣» on screen and `order = 3` in
      // the database never mean two different rows.
      await this.rebalance(task.ticketId, tx);
      // Losing your last task takes you back off the roster, unless you lead it.
      await this.assignments.syncFromTasks(task.ticketId, tx);
      await this.rollup.recompute(task.ticketId, tx);
      return gone;
    });

    await this.audit.log({
      action: 'TASK_DELETE',
      entity: 'TicketTask',
      entityId: id,
      userId: user.id,
      ticketId: task.ticketId,
      oldValues: { title: task.title, assignedToId: task.assignedToId, status: task.status },
    });

    return deleted;
  }

  /** The ticket's whole list in order, trimmed to what the block rules read. */
  private siblings(ticketId: string, tx: Db = this.prisma) {
    return tx.ticketTask.findMany({
      where: { ticketId },
      orderBy: TASK_ORDER,
      select: BLOCK_FIELDS,
    });
  }

  /** Pulls the list back to contiguous positions from 0, touching only movers. */
  private async rebalance(ticketId: string, tx: Db = this.prisma) {
    const rows = await tx.ticketTask.findMany({
      where: { ticketId },
      orderBy: TASK_ORDER,
      select: { id: true, order: true },
    });

    for (const [index, row] of rows.entries()) {
      if (row.order === index) continue;
      await tx.ticketTask.update({ where: { id: row.id }, data: { order: index } });
    }
  }
}
