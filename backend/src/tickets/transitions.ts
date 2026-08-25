import { TaskStatus, TicketStatus } from '@prisma/client';

/**
 * Status knowledge shared by the workflow, the work clock and the gates.
 *
 * Deliberately pure — no Prisma client, no injection — so the time arithmetic
 * can be tested exhaustively without a database and `now` can be pinned.
 */

/**
 * Statuses where the clock does not run. A ticket sitting in one of these is
 * waiting on somebody, so the elapsed wall time is not work time.
 *
 * AWAITING_TESTING and AWAITING_OWNER_APPROVAL are post-dev queues — the
 * developer's work is done, but `completedAt` is only stamped at COMPLETED.
 */
export const PAUSED_STATUSES: TicketStatus[] = [
  TicketStatus.BLOCKED,
  TicketStatus.ON_HOLD,
  TicketStatus.AWAITING_INFO,
  TicketStatus.AWAITING_TESTING,
  TicketStatus.AWAITING_OWNER_APPROVAL,
];

/** Explicit holds — `/resume` returns to `fromStatus` even when that status pauses the clock. */
export const RESUMABLE_HOLD_STATUSES: TicketStatus[] = [
  TicketStatus.BLOCKED,
  TicketStatus.ON_HOLD,
  TicketStatus.AWAITING_INFO,
];

/** Statuses a ticket can be blocked from — work that is actually under way. */
export const BLOCKABLE_STATUSES: TicketStatus[] = [
  TicketStatus.SCHEDULED,
  TicketStatus.IN_PROGRESS,
  TicketStatus.AWAITING_TESTING,
];

/** End states — nothing moves out of these except a reopen or a force. */
export const TERMINAL_STATUSES: TicketStatus[] = [
  TicketStatus.COMPLETED,
  TicketStatus.CLOSED,
  TicketStatus.REJECTED,
];

/** A task that still owes work. Used by the submit-for-testing gate and the digest. */
export const OPEN_TASK_STATUSES: TaskStatus[] = [TaskStatus.NEW, TaskStatus.IN_PROGRESS];

export interface StatusEdge {
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  createdAt: Date;
}

/** The one thing the clock needs to know about the row it is stamping. */
export interface WorkClockRow {
  startedAt: Date | null;
  completedAt: Date | null;
}

/**
 * Timestamp columns to write alongside a status change.
 *
 * `startedAt` is stamped once and never reset — a ticket that is blocked and
 * resumed has not started over. `completedAt` clears on the way back out of a
 * done state, so a reopened ticket does not keep claiming it finished.
 */
export function workClockFields(
  row: WorkClockRow,
  toStatus: TicketStatus,
  now: Date = new Date(),
): { startedAt?: Date; completedAt?: Date | null } {
  const fields: { startedAt?: Date; completedAt?: Date | null } = {};
  const isDone = toStatus === TicketStatus.COMPLETED || toStatus === TicketStatus.CLOSED;

  if (toStatus === TicketStatus.IN_PROGRESS && !row.startedAt) fields.startedAt = now;
  if (isDone && !row.completedAt) fields.completedAt = now;
  if (!isDone && row.completedAt) fields.completedAt = null;

  return fields;
}

/** The task-side equivalent — same rules, over TaskStatus. */
export function taskClockFields(
  row: WorkClockRow,
  toStatus: TaskStatus,
  now: Date = new Date(),
): { startedAt?: Date | null; completedAt?: Date | null } {
  const fields: { startedAt?: Date | null; completedAt?: Date | null } = {};

  if (toStatus === TaskStatus.IN_PROGRESS && !row.startedAt) fields.startedAt = now;
  if (toStatus === TaskStatus.COMPLETED) {
    // A task can be ticked off without ever being marked in progress; the work
    // still happened, so give it a start rather than an open-ended completion.
    if (!row.startedAt) fields.startedAt = now;
    if (!row.completedAt) fields.completedAt = now;
  } else if (row.completedAt) {
    fields.completedAt = null;
  }
  if (toStatus === TaskStatus.NEW) fields.startedAt = null;

  return fields;
}

const isPaused = (status: TicketStatus | null): boolean =>
  status !== null && PAUSED_STATUSES.includes(status);

/**
 * Wall-clock milliseconds between `startedAt` and `endAt`, minus every interval
 * the ticket spent in a paused status.
 *
 * `history` must be ordered oldest-first — which is how `findOne` loads it.
 * A pause that is still open at `endAt` is closed there, so a ticket blocked
 * right now stops accruing immediately rather than when someone resumes it.
 */
export function activeMs(history: StatusEdge[], startedAt: Date | null, endAt: Date): number {
  if (!startedAt) return 0;

  const start = startedAt.getTime();
  const end = endAt.getTime();
  if (end <= start) return 0;

  let paused = 0;
  let pauseOpenedAt: number | null = null;

  for (const edge of history) {
    const at = Math.min(Math.max(edge.createdAt.getTime(), start), end);
    const entersPause = isPaused(edge.toStatus);

    if (entersPause && pauseOpenedAt === null) {
      pauseOpenedAt = at;
    } else if (!entersPause && pauseOpenedAt !== null) {
      paused += at - pauseOpenedAt;
      pauseOpenedAt = null;
    }
  }

  if (pauseOpenedAt !== null) paused += end - pauseOpenedAt;

  return Math.max(0, end - start - paused);
}

/** Active hours to one decimal, or null while the work has not started. */
export function actualHours(
  history: StatusEdge[],
  startedAt: Date | null,
  completedAt: Date | null,
  now: Date,
): number | null {
  if (!startedAt) return null;
  const ms = activeMs(history, startedAt, completedAt ?? now);
  return Math.round((ms / 3_600_000) * 10) / 10;
}

/**
 * Where `/resume` sends a paused ticket: back where it was when it stopped.
 *
 * Read out of history rather than stored in a column — a stored "status before
 * block" has to be maintained by every writer, including `force-status`, and
 * rots silently the first time one of them forgets. The fallbacks cover a ticket
 * whose pause predates any history row.
 */
export function resumeTargetFrom(
  history: StatusEdge[],
  hasActiveAssignment: boolean,
): TicketStatus {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const edge = history[i];
    if (RESUMABLE_HOLD_STATUSES.includes(edge.toStatus) && edge.fromStatus) {
      return edge.fromStatus;
    }
    if (isPaused(edge.toStatus) && edge.fromStatus && !isPaused(edge.fromStatus)) {
      return edge.fromStatus;
    }
  }
  return hasActiveAssignment ? TicketStatus.SCHEDULED : TicketStatus.APPROVED;
}
