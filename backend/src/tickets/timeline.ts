/** Minimal user shape attached to a timeline row for display. */
export type TimelinePerson = { id: string; firstName: string; lastName: string; role: string };

/** The other ticket in a dependency row. */
export type TimelineTicketRef = { id: string; ticketNumber: number; title: string };

export type TimelineRelation = { label: string; ticket: TimelineTicketRef };

const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Every user id referenced in an audit row's before/after bags. */
export function collectTimelineUserIds(
  from: Record<string, unknown> | null,
  to: Record<string, unknown> | null,
  into: Set<string>,
): void {
  for (const bag of [from, to]) {
    if (!bag) continue;
    if (id(bag.developerId)) into.add(bag.developerId);
    if (id(bag.leadDeveloperId)) into.add(bag.leadDeveloperId);
    if (id(bag.assignedToId)) into.add(bag.assignedToId);
    if (Array.isArray(bag.developerIds)) {
      for (const devId of bag.developerIds) if (id(devId)) into.add(devId);
    }
  }
}

/** Ticket ids referenced by dependency audit rows. */
export function collectTimelineTicketIds(
  action: string,
  from: Record<string, unknown> | null,
  to: Record<string, unknown> | null,
  into: Set<string>,
): void {
  const snap = (bag: Record<string, unknown> | null) => {
    const other = bag?.otherTicket;
    if (other && typeof other === 'object' && id((other as TimelineTicketRef).id)) {
      into.add((other as TimelineTicketRef).id);
    }
  };
  snap(from);
  snap(to);

  if (action === 'DEPENDENCY_ADD' && to) {
    if (id(to.blockingTicketId)) into.add(to.blockingTicketId);
    if (id(to.blockedTicketId)) into.add(to.blockedTicketId);
    if (id(to.otherTicketId)) into.add(to.otherTicketId);
  }
  if (action === 'DEPENDENCY_REMOVE' && from) {
    if (id(from.otherTicketId)) into.add(from.otherTicketId);
    if (id(from.blockingTicketId)) into.add(from.blockingTicketId);
    if (id(from.blockedTicketId)) into.add(from.blockedTicketId);
  }
}

function normalizeTicketRef(v: unknown): TimelineTicketRef | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!id(o.id)) return null;
  const raw = o.ticketNumber;
  const ticketNumber =
    typeof raw === 'number' ? raw
    : typeof raw === 'string' ? parseInt(raw, 10)
    : NaN;
  if (!Number.isFinite(ticketNumber)) return null;
  const title = typeof o.title === 'string' && o.title.trim() ? o.title : `#${ticketNumber}`;
  return { id: o.id, ticketNumber, title };
}

function ticketSnapshot(
  bag: Record<string, unknown> | null,
  tickets: Map<string, TimelineTicketRef>,
): TimelineTicketRef | null {
  if (!bag) return null;
  const embedded = normalizeTicketRef(bag.otherTicket);
  if (embedded) return embedded;
  if (id(bag.otherTicketId)) return tickets.get(bag.otherTicketId) ?? null;
  return null;
}

function relationLabel(
  ticketId: string,
  type: string,
  blocking: string,
  blocked: string,
  removing = false,
): string {
  const isBlocked = blocked === ticketId;
  const prefix = removing ? 'أزال' : 'أضاف';
  if (type === 'BLOCKS') {
    return isBlocked ? `${prefix} اعتماداً على` : `${prefix} حجباً لـ`;
  }
  if (type === 'RELATES_TO') return `${prefix} ربطاً مع`;
  if (type === 'DUPLICATES') return isBlocked ? `${prefix} تكراراً من` : `${prefix} تكراراً في`;
  return removing ? 'أزال علاقة مع' : 'أضاف علاقة مع';
}

/** How this ticket relates to the other one named in the audit row. */
export function resolveTimelineRelation(
  ticketId: string,
  action: string,
  from: Record<string, unknown> | null,
  to: Record<string, unknown> | null,
  tickets: Map<string, TimelineTicketRef>,
): TimelineRelation | null {
  if (action === 'DEPENDENCY_REMOVE') {
    const ticket = ticketSnapshot(from, tickets);
    if (!ticket) return null;
    const blocking = id(from?.blockingTicketId) ? from!.blockingTicketId : ticket.id;
    const blocked = id(from?.blockedTicketId) ? from!.blockedTicketId : ticket.id;
    const type = typeof from?.type === 'string' ? from.type : 'BLOCKS';
    return { label: relationLabel(ticketId, type, blocking, blocked, true), ticket };
  }

  if (action === 'DEPENDENCY_ADD' && to) {
    let ticket = ticketSnapshot(to, tickets);
    if (!ticket && id(to.blockingTicketId) && id(to.blockedTicketId)) {
      const otherId = to.blockingTicketId === ticketId ? to.blockedTicketId : to.blockingTicketId;
      ticket = tickets.get(otherId) ?? null;
    }
    if (!ticket && id(to.otherTicketId)) {
      ticket = tickets.get(to.otherTicketId) ?? null;
    }
    if (!ticket) return null;

    const blocking = id(to.blockingTicketId) ? to.blockingTicketId : ticket.id;
    const blocked = id(to.blockedTicketId) ? to.blockedTicketId : ticket.id;
    const type = typeof to.type === 'string' ? to.type : 'BLOCKS';
    return { label: relationLabel(ticketId, type, blocking, blocked), ticket };
  }

  return null;
}

/** Ticket task ids referenced by task audit rows. */
export function collectTimelineTaskIds(entity: string, entityId: string, into: Set<string>): void {
  if (entity === 'TicketTask' && id(entityId)) into.add(entityId);
}

/** Fill in the task title when older audit rows only stored status. */
export function enrichTaskTimelineBags(
  entityId: string,
  from: Record<string, unknown> | null,
  to: Record<string, unknown> | null,
  tasks: Map<string, string>,
): { from: Record<string, unknown> | null; to: Record<string, unknown> | null } {
  const title = tasks.get(entityId);
  if (!title) return { from, to };

  const withTitle = (bag: Record<string, unknown> | null) => {
    if (!bag) return bag;
    if (typeof bag.title === 'string' && bag.title.trim()) return bag;
    return { ...bag, title };
  };

  return { from: withTitle(from), to: withTitle(to) };
}

/** People the action was done *to* — distinct from the actor who did it. */
export function resolveTimelineSubjects(
  action: string,
  from: Record<string, unknown> | null,
  to: Record<string, unknown> | null,
  users: Map<string, TimelinePerson>,
): TimelinePerson[] {
  const pick = (v: unknown) => (id(v) ? users.get(v) : undefined);
  const one = (v: unknown) => {
    const u = pick(v);
    return u ? [u] : [];
  };

  switch (action) {
    case 'ASSIGNEE_ADD':
      return one(to?.developerId);
    case 'ASSIGNEE_REMOVE':
      return one(from?.developerId);
    case 'LEAD_CHANGED':
      return one(to?.leadDeveloperId);
    case 'ASSIGNEES_CHANGED': {
      const ids = Array.isArray(to?.developerIds) ? to.developerIds : [];
      return ids.map(pick).filter((u): u is TimelinePerson => !!u);
    }
    case 'TASK_CREATE':
    case 'TASK_UPDATE':
    case 'TASK_STATUS_CHANGE':
      return one(to?.assignedToId ?? from?.assignedToId);
    default:
      return [];
  }
}
