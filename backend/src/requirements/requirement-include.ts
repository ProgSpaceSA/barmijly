import { Prisma } from '@prisma/client';

/**
 * The row shapes every requirement response uses.
 *
 * Kept in a file of its own — with no Nest imports — so `MeetingsService` can
 * return a captured requirement in exactly the shape `/requirements` returns,
 * without the two modules having to depend on each other.
 */
const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

export const REQUIREMENT_INCLUDE = {
  owner: PERSON,
  requestedBy: PERSON,
  createdBy: PERSON,
  decidedBy: PERSON,
  system: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, logoUrl: true } },
  meetingPoint: {
    select: {
      id: true,
      body: true,
      kind: true,
      order: true,
      meeting: {
        select: { id: true, title: true, meetingNumber: true, heldAt: true, type: true },
      },
    },
  },
  _count: { select: { tickets: true, comments: true } },
} as const satisfies Prisma.RequirementInclude;

export const REQUIREMENT_DETAIL_INCLUDE = {
  ...REQUIREMENT_INCLUDE,
  tickets: {
    select: { id: true, title: true, ticketNumber: true, status: true, type: true },
    orderBy: { createdAt: 'asc' },
  },
  attachments: true,
  statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: PERSON } },
} as const satisfies Prisma.RequirementInclude;
