import { BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { assertNotBlocked, attachBlockers, findBlocker } from './task-order';

const task = (over: Partial<{
  id: string;
  ticketId: string;
  order: number;
  title: string;
  status: TaskStatus;
  isBlocking: boolean;
}> = {}) => ({
  id: 'task-1',
  ticketId: 'ticket-1',
  order: 0,
  title: 'مهمة',
  status: TaskStatus.NEW,
  isBlocking: false,
  ...over,
});

describe('findBlocker', () => {
  it('reports the nearest unfinished blocker above the task', () => {
    // Clearing the near one can still leave the far one, and the next call
    // says so — reporting both at once would name a gate nobody hit yet.
    const siblings = [
      task({ id: 'far', order: 0, isBlocking: true, title: 'التحليل' }),
      task({ id: 'near', order: 1, isBlocking: true, title: 'مراجعة التصميم' }),
      task({ id: 'mine', order: 2 }),
    ];

    expect(findBlocker(siblings, { id: 'mine', order: 2 })?.id).toBe('near');
  });

  it('ignores a completed blocker', () => {
    const siblings = [
      task({ id: 'gate', order: 0, isBlocking: true, status: TaskStatus.COMPLETED }),
      task({ id: 'mine', order: 1 }),
    ];

    expect(findBlocker(siblings, { id: 'mine', order: 1 })).toBeNull();
  });

  it('ignores a blocker that sits below the task', () => {
    const siblings = [
      task({ id: 'mine', order: 0 }),
      task({ id: 'later', order: 1, isBlocking: true }),
    ];

    expect(findBlocker(siblings, { id: 'mine', order: 0 })).toBeNull();
  });

  it('never lets a blocker block itself', () => {
    const siblings = [task({ id: 'gate', order: 0, isBlocking: true })];

    expect(findBlocker(siblings, { id: 'gate', order: 0 })).toBeNull();
  });
});

describe('assertNotBlocked', () => {
  it('names the blocker in the refusal', () => {
    const siblings = [
      task({ id: 'gate', order: 0, isBlocking: true, title: 'مراجعة التصميم' }),
      task({ id: 'mine', order: 1 }),
    ];

    expect(() => assertNotBlocked(siblings, { id: 'mine', order: 1 }))
      .toThrow(new BadRequestException('لا يمكن العمل على هذه المهمة قبل إكمال المهمة الحاجبة «مراجعة التصميم»'));
  });

  it('passes a task with nothing above it', () => {
    expect(() => assertNotBlocked([task({ id: 'mine', order: 0 })], { id: 'mine', order: 0 })).not.toThrow();
  });
});

describe('attachBlockers', () => {
  it('keeps each ticket to its own blockers', () => {
    // «My tasks» spans tickets, and a blocker on one ticket says nothing about
    // a task on another however the positions line up.
    const mine = [
      task({ id: 'a', ticketId: 'ticket-1', order: 1 }),
      task({ id: 'b', ticketId: 'ticket-2', order: 1 }),
    ];
    const pool = [
      task({ id: 'gate-1', ticketId: 'ticket-1', order: 0, isBlocking: true, title: 'التحليل' }),
    ];

    const [first, second] = attachBlockers(mine, pool);

    expect(first.blockedBy).toEqual({ id: 'gate-1', title: 'التحليل', order: 0 });
    expect(second.blockedBy).toBeNull();
  });

  it('takes the pool as a full list and filters it itself', () => {
    const rows = [
      task({ id: 'done', order: 0, isBlocking: true, status: TaskStatus.COMPLETED }),
      task({ id: 'gate', order: 1, isBlocking: true, title: 'مراجعة التصميم' }),
      task({ id: 'plain', order: 2 }),
    ];

    expect(attachBlockers(rows, rows).map((row) => row.blockedBy?.id ?? null))
      .toEqual([null, null, 'gate']);
  });
});
