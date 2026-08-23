import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Keeps `Ticket.tasksEstimatedHours` / `Ticket.tasksWeightTotal` in step with the
 * ticket's tasks.
 *
 * The numbers are denormalised rather than summed on read because the ticket
 * *list*, the reports and the daily digest all want them, and Prisma cannot
 * aggregate a relation across a list query. Drift is contained by keeping this
 * the single writer and calling it inside the same transaction as every task
 * write. If a raw SQL fix ever touches `TicketTask` behind the API,
 * `recompute()` is the repair path — it is idempotent and safe to run at any
 * time.
 */
@Injectable()
export class TaskRollupService {
  constructor(private prisma: PrismaService) {}

  /**
   * Recalculates both rollups from the tasks currently on the ticket.
   * Pass the surrounding transaction client so the rollup lands atomically with
   * the task write that triggered it.
   */
  async recompute(
    ticketId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const totals = await tx.ticketTask.aggregate({
      where: { ticketId },
      _sum: { estimatedHours: true, difficultyLevel: true },
    });

    await tx.ticket.update({
      where: { id: ticketId },
      data: {
        tasksEstimatedHours: totals._sum.estimatedHours ?? null,
        tasksWeightTotal: totals._sum.difficultyLevel ?? null,
      },
    });
  }
}
