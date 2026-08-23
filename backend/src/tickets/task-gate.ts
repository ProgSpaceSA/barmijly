import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OPEN_TASK_STATUSES } from './transitions';

/**
 * AWAITING_TESTING is a claim that the work is finished. Open tasks say
 * otherwise, so the transition is refused while any remain.
 *
 * A ticket with no tasks passes untouched — the gate only bites once someone has
 * broken the work down. Leadership bypasses it through `force-status`, which is
 * audited; that is deliberate, not an oversight.
 *
 * Counts live rows rather than the `tasksEstimatedHours` rollup: a gate must not
 * trust a denormalised cache.
 */
export async function assertNoOpenTasks(prisma: PrismaService, ticketId: string): Promise<void> {
  const open = await prisma.ticketTask.count({
    where: { ticketId, status: { in: OPEN_TASK_STATUSES } },
  });

  if (open > 0) {
    throw new BadRequestException(
      `لا يمكن إرسال التذكرة للاختبار: ${open} مهمة غير مكتملة`,
    );
  }
}
