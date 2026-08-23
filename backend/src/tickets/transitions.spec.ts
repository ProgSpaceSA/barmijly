import { TaskStatus, TicketStatus } from '@prisma/client';
import {
  StatusEdge,
  activeMs,
  actualHours,
  resumeTargetFrom,
  taskClockFields,
  workClockFields,
} from './transitions';

/** Hours since a fixed origin, so every case reads as a wall-clock timeline. */
const T0 = new Date('2026-08-01T08:00:00.000Z');
const at = (hours: number) => new Date(T0.getTime() + hours * 3_600_000);

const edge = (from: TicketStatus | null, to: TicketStatus, hours: number): StatusEdge => ({
  fromStatus: from,
  toStatus: to,
  createdAt: at(hours),
});

const HOUR = 3_600_000;

/** A row that has not been worked yet. */
const fresh = () => ({ startedAt: null, completedAt: null });

describe('activeMs — paused time is not work time', () => {
  it('counts the whole span when the ticket never paused', () => {
    const history = [edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0)];

    expect(activeMs(history, at(0), at(5))).toBe(5 * HOUR);
  });

  it('subtracts a single hold', () => {
    const history = [
      edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0),
      edge(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, 2),
      edge(TicketStatus.ON_HOLD, TicketStatus.IN_PROGRESS, 6),
    ];

    // 8 hours elapsed, 4 of them parked.
    expect(activeMs(history, at(0), at(8))).toBe(4 * HOUR);
  });

  it('subtracts several holds', () => {
    const history = [
      edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0),
      edge(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, 1),
      edge(TicketStatus.ON_HOLD, TicketStatus.IN_PROGRESS, 3),
      edge(TicketStatus.IN_PROGRESS, TicketStatus.AWAITING_INFO, 5),
      edge(TicketStatus.AWAITING_INFO, TicketStatus.IN_PROGRESS, 9),
    ];

    expect(activeMs(history, at(0), at(10))).toBe(4 * HOUR);
  });

  it('closes a pause that is still open at the end of the window', () => {
    const history = [
      edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0),
      edge(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, 3),
    ];

    // Parked right now: the clock stops at the pause, not at "now".
    expect(activeMs(history, at(0), at(100))).toBe(3 * HOUR);
  });

  it('ignores history from before work started', () => {
    const history = [
      edge(TicketStatus.NEW, TicketStatus.AWAITING_INFO, -10),
      edge(TicketStatus.AWAITING_INFO, TicketStatus.NEW, -6),
      edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0),
    ];

    expect(activeMs(history, at(0), at(4))).toBe(4 * HOUR);
  });

  it('is zero before the work starts', () => {
    expect(activeMs([], null, at(5))).toBe(0);
    expect(activeMs([], at(5), at(5))).toBe(0);
  });

  it('never returns a negative span', () => {
    const history = [edge(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, -2)];

    expect(activeMs(history, at(0), at(1))).toBeGreaterThanOrEqual(0);
  });
});

describe('actualHours', () => {
  it('stops at completion rather than running to now', () => {
    const history = [edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0)];

    expect(actualHours(history, at(0), at(3), at(500))).toBe(3);
  });

  it('runs to now while the work is still open', () => {
    const history = [edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0)];

    expect(actualHours(history, at(0), null, at(2.5))).toBe(2.5);
  });

  it('is null before the work starts', () => {
    expect(actualHours([], null, null, at(9))).toBeNull();
  });

  it('survives a history with no closing row', () => {
    // close() used to write the ticket row directly and skip its history entry,
    // which left a gap the fold had to tolerate.
    const history = [edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0)];

    expect(actualHours(history, at(0), at(4), at(50))).toBe(4);
  });
});

describe('resumeTargetFrom — where a paused ticket goes back to', () => {
  it('returns the status the ticket paused from', () => {
    const history = [
      edge(TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, 0),
      edge(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, 2),
    ];

    expect(resumeTargetFrom(history, true)).toBe(TicketStatus.IN_PROGRESS);
  });

  it('uses the most recent pause when there were several', () => {
    const history = [
      edge(TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, 1),
      edge(TicketStatus.ON_HOLD, TicketStatus.IN_PROGRESS, 2),
      edge(TicketStatus.IN_PROGRESS, TicketStatus.AWAITING_TESTING, 3),
      edge(TicketStatus.AWAITING_TESTING, TicketStatus.ON_HOLD, 4),
    ];

    expect(resumeTargetFrom(history, true)).toBe(TicketStatus.AWAITING_TESTING);
  });

  it('falls back to SCHEDULED when a developer is assigned but there is no history', () => {
    expect(resumeTargetFrom([], true)).toBe(TicketStatus.SCHEDULED);
  });

  it('falls back to APPROVED when nobody is assigned', () => {
    expect(resumeTargetFrom([], false)).toBe(TicketStatus.APPROVED);
  });
});

describe('workClockFields — ticket timestamps', () => {
  it('stamps startedAt on the first move into IN_PROGRESS', () => {
    const fields = workClockFields({ startedAt: null, completedAt: null }, TicketStatus.IN_PROGRESS, at(1));

    expect(fields.startedAt).toEqual(at(1));
  });

  it('does not reset startedAt when work resumes', () => {
    // A ticket that was blocked and picked back up has not started over.
    const fields = workClockFields({ startedAt: at(0), completedAt: null }, TicketStatus.IN_PROGRESS, at(9));

    expect(fields.startedAt).toBeUndefined();
  });

  it('stamps completedAt on COMPLETED and on CLOSED', () => {
    expect(workClockFields(fresh(), TicketStatus.COMPLETED, at(4)).completedAt).toEqual(at(4));
    expect(workClockFields(fresh(), TicketStatus.CLOSED, at(4)).completedAt).toEqual(at(4));
  });

  it('keeps the original completion time when a completed ticket is closed', () => {
    const fields = workClockFields({ startedAt: at(0), completedAt: at(4) }, TicketStatus.CLOSED, at(6));

    expect(fields.completedAt).toBeUndefined();
  });

  it('clears completedAt when a done ticket is reopened', () => {
    const fields = workClockFields({ startedAt: at(0), completedAt: at(4) }, TicketStatus.NEW, at(7));

    expect(fields.completedAt).toBeNull();
  });
});

describe('taskClockFields — task timestamps', () => {
  it('stamps startedAt when the task is picked up', () => {
    expect(taskClockFields(fresh(), TaskStatus.IN_PROGRESS, at(1)).startedAt).toEqual(at(1));
  });

  it('gives a directly-completed task a start as well as an end', () => {
    // Small tasks get ticked off without ever being marked in progress; an
    // open-ended completion would report an infinite duration.
    const fields = taskClockFields(fresh(), TaskStatus.COMPLETED, at(2));

    expect(fields.startedAt).toEqual(at(2));
    expect(fields.completedAt).toEqual(at(2));
  });

  it('clears both timestamps when a task is reset to NEW', () => {
    const fields = taskClockFields({ startedAt: at(0), completedAt: at(3) }, TaskStatus.NEW, at(5));

    expect(fields.startedAt).toBeNull();
    expect(fields.completedAt).toBeNull();
  });

  it('clears completedAt when a finished task is reopened', () => {
    const fields = taskClockFields({ startedAt: at(0), completedAt: at(3) }, TaskStatus.IN_PROGRESS, at(5));

    expect(fields.completedAt).toBeNull();
    expect(fields.startedAt).toBeUndefined();
  });
});
