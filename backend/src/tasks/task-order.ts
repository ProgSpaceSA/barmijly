import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';

/** The only fields the ordering and blocking rules read off a task row. */
export type OrderedTask = {
  id: string;
  order: number;
  title: string;
  status: TaskStatus;
  isBlocking: boolean;
};

/** What the client is told about the task standing in the way. */
export type Blocker = { id: string; title: string; order: number };

/**
 * The unfinished blocking task standing above `task`, or `null`.
 *
 * A blocking task holds the whole list under it: nothing with a higher `order`
 * starts until it is COMPLETED, which is what makes the tail of the list run top
 * to bottom. Only the nearest blocker is reported — clearing it can still leave
 * an earlier one, and the next call says so.
 */
export function findBlocker<T extends OrderedTask>(
  siblings: readonly T[],
  task: { id: string; order: number },
): T | null {
  let nearest: T | null = null;
  for (const sibling of siblings) {
    if (sibling.id === task.id) continue;
    if (!sibling.isBlocking || sibling.status === TaskStatus.COMPLETED) continue;
    if (sibling.order >= task.order) continue;
    if (!nearest || sibling.order > nearest.order) nearest = sibling;
  }
  return nearest;
}

/** Refuses to move a task that a blocker above it has not released yet. */
export function assertNotBlocked(
  siblings: readonly OrderedTask[],
  task: { id: string; order: number },
): void {
  const blocker = findBlocker(siblings, task);
  if (blocker) {
    throw new BadRequestException(
      `لا يمكن العمل على هذه المهمة قبل إكمال المهمة الحاجبة «${blocker.title}»`,
    );
  }
}

/**
 * Attaches `blockedBy` to every task so the UI can lock the row and name the
 * reason without re-deriving the rule.
 *
 * `pool` is every task that could block one of them: a ticket's own list is its
 * own pool, while «my tasks» needs a separate query — the blocker there usually
 * belongs to someone else.
 */
export function attachBlockers<T extends { id: string; ticketId: string; order: number }>(
  tasks: T[],
  pool: readonly (OrderedTask & { ticketId: string })[],
): (T & { blockedBy: Blocker | null })[] {
  const byTicket = new Map<string, (OrderedTask & { ticketId: string })[]>();
  for (const row of pool) {
    if (!row.isBlocking || row.status === TaskStatus.COMPLETED) continue;
    const list = byTicket.get(row.ticketId);
    if (list) list.push(row);
    else byTicket.set(row.ticketId, [row]);
  }

  return tasks.map((task) => {
    const blocker = findBlocker(byTicket.get(task.ticketId) ?? [], task);
    return {
      ...task,
      blockedBy: blocker ? { id: blocker.id, title: blocker.title, order: blocker.order } : null,
    };
  });
}
