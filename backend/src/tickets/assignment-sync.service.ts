import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Ticket membership: who is working a ticket, and which one of them leads it.
 *
 * Two ways in, deliberately:
 *  - **derived** — holding a task on a ticket makes you an active assignee, and
 *    losing your last task takes you back off. That keeps the roster honest
 *    without anyone maintaining it by hand.
 *  - **manual** — leadership adds and removes people directly, at any status.
 *
 * The lead is the exception to the derivation. It is set explicitly and is never
 * removed by a task sync, because the person answerable for the ticket is not
 * always the person holding a task on it.
 */
@Injectable()
export class AssignmentSyncService {
  constructor(private prisma: PrismaService) {}

  /**
   * Reconciles the roster with the ticket's tasks.
   *
   * Call it inside the same transaction as the task write that triggered it, so
   * a task and its assignee never disagree.
   */
  async syncFromTasks(ticketId: string, tx: Db = this.prisma): Promise<void> {
    const holders = await tx.ticketTask.findMany({
      where: { ticketId },
      distinct: ['assignedToId'],
      select: { assignedToId: true },
    });
    const holderIds = holders.map((h) => h.assignedToId);

    for (const developerId of holderIds) {
      await tx.ticketAssignment.upsert({
        where: { ticketId_developerId: { ticketId, developerId } },
        create: { ticketId, developerId, isActive: true },
        update: { isActive: true },
      });
    }

    // The lead keeps their seat even with no tasks left; everyone else was only
    // on the ticket because of the work they held.
    await tx.ticketAssignment.updateMany({
      where: {
        ticketId,
        isActive: true,
        isLead: false,
        developerId: { notIn: holderIds.length ? holderIds : ['-'] },
      },
      data: { isActive: false },
    });

    const hasLead = await tx.ticketAssignment.count({
      where: { ticketId, isActive: true, isLead: true },
    });
    if (!hasLead && holderIds.length > 0) {
      await this.setLead(ticketId, holderIds[0], tx);
    }
  }

  /** Adds one developer to the roster without disturbing anyone else. */
  async addAssignee(ticketId: string, developerId: string, tx: Db = this.prisma) {
    const hasLead = await tx.ticketAssignment.count({
      where: { ticketId, isActive: true, isLead: true },
    });
    const makeLead = hasLead === 0;

    return tx.ticketAssignment.upsert({
      where: { ticketId_developerId: { ticketId, developerId } },
      create: { ticketId, developerId, isActive: true, isLead: makeLead },
      update: { isActive: true, ...(makeLead ? { isLead: true } : {}) },
    });
  }

  /**
   * Takes one developer off the roster.
   *
   * Refuses on anyone still holding work, because removing them would leave
   * orphaned tasks that the next sync would silently undo. The lead may leave
   * like anyone else — leadership can assign a new lead afterward.
   */
  async removeAssignee(ticketId: string, developerId: string, tx: Db = this.prisma) {
    const assignment = await tx.ticketAssignment.findUnique({
      where: { ticketId_developerId: { ticketId, developerId } },
    });
    if (!assignment || !assignment.isActive) {
      throw new NotFoundException('Developer is not assigned to this ticket');
    }

    const openTasks = await tx.ticketTask.count({ where: { ticketId, assignedToId: developerId } });
    if (openTasks > 0) {
      throw new BadRequestException(`لا يمكن إزالة المطور: لديه ${openTasks} مهمة على التذكرة`);
    }

    return tx.ticketAssignment.update({
      where: { ticketId_developerId: { ticketId, developerId } },
      data: { isActive: false, isLead: false },
    });
  }

  /**
   * Hands the lead role over.
   *
   * Demote before promote, in one transaction — the partial unique index that
   * guarantees one lead per ticket fires the other way round.
   */
  async setLead(ticketId: string, developerId: string, tx: Db = this.prisma): Promise<void> {
    await tx.ticketAssignment.updateMany({
      where: { ticketId, isLead: true, developerId: { not: developerId } },
      data: { isLead: false },
    });

    await tx.ticketAssignment.upsert({
      where: { ticketId_developerId: { ticketId, developerId } },
      create: { ticketId, developerId, isActive: true, isLead: true },
      update: { isActive: true, isLead: true },
    });
  }

  /** The active roster, lead first. */
  async listAssignees(ticketId: string, tx: Db = this.prisma) {
    return tx.ticketAssignment.findMany({
      where: { ticketId, isActive: true },
      include: { developer: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: [{ isLead: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /** Ticket-level transitions belong to the lead, not to every contributor. */
  async requireLead(ticketId: string, userId: string): Promise<void> {
    const lead = await this.prisma.ticketAssignment.findFirst({
      where: { ticketId, developerId: userId, isActive: true, isLead: true },
    });
    if (!lead) {
      throw new ForbiddenException('إجراءات التذكرة من صلاحية قائد العمل');
    }
  }

  async hasActiveAssignment(ticketId: string, tx: Db = this.prisma): Promise<boolean> {
    const count = await tx.ticketAssignment.count({ where: { ticketId, isActive: true } });
    return count > 0;
  }
}
