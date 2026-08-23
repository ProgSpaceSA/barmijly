import { BadRequestException } from '@nestjs/common';
import { TicketDependencyType, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Prerequisites are met once the blocking ticket is delivered or closed out. */
const SATISFIED: TicketStatus[] = [TicketStatus.COMPLETED, TicketStatus.CLOSED];

/** Stops a malformed graph from turning a walk into a hang. */
const MAX_NODES = 200;

/** blockedTicketId -> the tickets it is waiting on. Pure, so cycle logic is testable. */
export type DependencyEdges = Map<string, string[]>;

/**
 * Would adding "blocked waits on blocking" close a loop?
 *
 * Walks up from the proposed prerequisite through everything *it* waits on. If
 * that walk reaches the ticket being blocked, the new edge would complete a
 * cycle and nothing in the chain could ever start.
 */
export function wouldCreateCycle(
  edges: DependencyEdges,
  blockingId: string,
  blockedId: string,
): boolean {
  if (blockingId === blockedId) return true;

  const seen = new Set<string>([blockingId]);
  const queue = [blockingId];

  while (queue.length && seen.size <= MAX_NODES) {
    const current = queue.shift()!;
    for (const next of edges.get(current) ?? []) {
      if (next === blockedId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return false;
}

/** Loads the whole dependency graph as an adjacency map. */
export async function loadDependencyEdges(prisma: PrismaService): Promise<DependencyEdges> {
  // Only BLOCKS edges can deadlock. A "relates to" loop is just two tickets
  // pointing at each other, which is fine and often correct.
  const rows = await prisma.ticketDependency.findMany({
    where: { type: TicketDependencyType.BLOCKS },
    select: { blockedTicketId: true, blockingTicketId: true },
  });

  const edges: DependencyEdges = new Map();
  for (const row of rows) {
    const list = edges.get(row.blockedTicketId) ?? [];
    list.push(row.blockingTicketId);
    edges.set(row.blockedTicketId, list);
  }
  return edges;
}

/**
 * The `start` and `submit-for-testing` gates: refuse while anything this ticket
 * waits on is unfinished.
 *
 * Names the outstanding ticket numbers, because "you have unmet prerequisites"
 * without saying which ones just sends the reader hunting.
 */
export async function assertPrerequisitesMet(prisma: PrismaService, ticketId: string): Promise<void> {
  const unmet = await prisma.ticketDependency.findMany({
    where: {
      blockedTicketId: ticketId,
      type: TicketDependencyType.BLOCKS,
      blockingTicket: { status: { notIn: SATISFIED } },
    },
    select: { blockingTicket: { select: { ticketNumber: true } } },
    orderBy: { createdAt: 'asc' },
  });

  if (unmet.length) {
    const numbers = unmet.map((d) => `#${d.blockingTicket.ticketNumber}`).join('، ');
    throw new BadRequestException(`لا يمكن البدء: التذاكر المتطلَّبة غير مكتملة (${numbers})`);
  }
}

export { SATISFIED as PREREQUISITE_SATISFIED_STATUSES };
