import {
  collectTimelineTicketIds,
  collectTimelineTaskIds,
  collectTimelineUserIds,
  enrichTaskTimelineBags,
  resolveTimelineRelation,
  resolveTimelineSubjects,
  type TimelinePerson,
  type TimelineTicketRef,
} from './timeline';

const users = new Map<string, TimelinePerson>([
  ['dev-1', { id: 'dev-1', firstName: 'Mohamed', lastName: 'Ali', role: 'DEVELOPER' }],
  ['dev-2', { id: 'dev-2', firstName: 'Sara', lastName: 'Khan', role: 'DEVELOPER' }],
]);

describe('timeline subjects', () => {
  it('collects developer ids from assignment rows', () => {
    const ids = new Set<string>();
    collectTimelineUserIds(null, { developerId: 'dev-1', leadDeveloperId: 'dev-2' }, ids);
    expect([...ids].sort()).toEqual(['dev-1', 'dev-2']);
  });

  it('resolves the added developer on ASSIGNEE_ADD', () => {
    const subjects = resolveTimelineSubjects('ASSIGNEE_ADD', null, { developerId: 'dev-1' }, users);
    expect(subjects).toEqual([users.get('dev-1')]);
  });

  it('resolves the new lead on LEAD_CHANGED', () => {
    const subjects = resolveTimelineSubjects('LEAD_CHANGED', null, { leadDeveloperId: 'dev-2' }, users);
    expect(subjects[0]?.firstName).toBe('Sara');
  });

  it('resolves task assignee on TASK_CREATE', () => {
    const subjects = resolveTimelineSubjects('TASK_CREATE', null, { assignedToId: 'dev-1', title: 'API' }, users);
    expect(subjects).toHaveLength(1);
  });

  it('returns nothing for a pure status change', () => {
    expect(resolveTimelineSubjects('STATUS_CHANGE', { status: 'NEW' }, { status: 'APPROVED' }, users)).toEqual([]);
  });
});

describe('timeline task titles', () => {
  const tasks = new Map([['task-1', 'ربط الـ API']]);

  it('collects task entity ids', () => {
    const ids = new Set<string>();
    collectTimelineTaskIds('TicketTask', 'task-1', ids);
    expect([...ids]).toEqual(['task-1']);
  });

  it('fills a missing title from the live task row', () => {
    const enriched = enrichTaskTimelineBags(
      'task-1',
      { status: 'NEW' },
      { status: 'IN_PROGRESS' },
      tasks,
    );
    expect(enriched.from?.title).toBe('ربط الـ API');
    expect(enriched.to?.title).toBe('ربط الـ API');
  });

  it('does not overwrite a title already stored in the audit row', () => {
    const enriched = enrichTaskTimelineBags(
      'task-1',
      { status: 'NEW', title: 'من السجل' },
      { status: 'IN_PROGRESS', title: 'من السجل' },
      tasks,
    );
    expect(enriched.to?.title).toBe('من السجل');
  });
});

describe('timeline relations', () => {
  const tickets = new Map<string, TimelineTicketRef>([
    ['ticket-1', { id: 'ticket-1', ticketNumber: 10, title: 'الحالية' }],
    ['ticket-9', { id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة' }],
  ]);

  it('collects both ends of a dependency add', () => {
    const ids = new Set<string>();
    collectTimelineTicketIds('DEPENDENCY_ADD', null, {
      blockingTicketId: 'ticket-9',
      blockedTicketId: 'ticket-1',
      type: 'BLOCKS',
    }, ids);
    expect([...ids].sort()).toEqual(['ticket-1', 'ticket-9']);
  });

  it('names a blocking prerequisite from the blocked ticket side', () => {
    const rel = resolveTimelineRelation(
      'ticket-1',
      'DEPENDENCY_ADD',
      null,
      { blockingTicketId: 'ticket-9', blockedTicketId: 'ticket-1', type: 'BLOCKS' },
      tickets,
    );
    expect(rel).toEqual({ label: 'أضاف اعتماداً على', ticket: tickets.get('ticket-9') });
  });

  it('names a blocking edge from the blocking ticket side', () => {
    const rel = resolveTimelineRelation(
      'ticket-9',
      'DEPENDENCY_ADD',
      null,
      { blockingTicketId: 'ticket-9', blockedTicketId: 'ticket-1', type: 'BLOCKS' },
      tickets,
    );
    expect(rel).toEqual({ label: 'أضاف حجباً لـ', ticket: tickets.get('ticket-1') });
  });

  it('uses an embedded ticket snapshot when the map is empty', () => {
    const rel = resolveTimelineRelation(
      'ticket-1',
      'DEPENDENCY_ADD',
      null,
      {
        blockingTicketId: 'ticket-9',
        blockedTicketId: 'ticket-1',
        type: 'RELATES_TO',
        otherTicket: { id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة' },
      },
      new Map(),
    );
    expect(rel).toEqual({
      label: 'أضاف ربطاً مع',
      ticket: { id: 'ticket-9', ticketNumber: 120, title: 'ربط البوابة' },
    });
  });

  it('coerces string ticket numbers in embedded snapshots', () => {
    const rel = resolveTimelineRelation(
      'ticket-1',
      'DEPENDENCY_ADD',
      null,
      {
        blockingTicketId: 'ticket-9',
        blockedTicketId: 'ticket-1',
        type: 'BLOCKS',
        otherTicket: { id: 'ticket-9', ticketNumber: '120', title: 'ربط البوابة' },
      },
      new Map(),
    );
    expect(rel?.ticket.ticketNumber).toBe(120);
  });
});
