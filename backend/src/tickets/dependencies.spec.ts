import { BadRequestException } from '@nestjs/common';
import { TicketDependencyType, TicketStatus } from '@prisma/client';
import {
  DependencyEdges,
  assertPrerequisitesMet,
  loadDependencyEdges,
  wouldCreateCycle,
} from './dependencies';

/** `graph({ a: ['b'] })` reads as "a waits on b". */
const graph = (spec: Record<string, string[]>): DependencyEdges =>
  new Map(Object.entries(spec));

describe('wouldCreateCycle', () => {
  it('rejects a ticket depending on itself', () => {
    expect(wouldCreateCycle(graph({}), 'a', 'a')).toBe(true);
  });

  it('rejects the reverse of an edge that already exists', () => {
    // a already waits on b, so making b wait on a strands both.
    expect(wouldCreateCycle(graph({ a: ['b'] }), 'a', 'b')).toBe(true);
  });

  it('rejects a cycle several hops away', () => {
    // a→b→c, so pointing c at a closes the loop.
    expect(wouldCreateCycle(graph({ a: ['b'], b: ['c'] }), 'a', 'c')).toBe(true);
  });

  it('allows an edge that keeps the graph acyclic', () => {
    expect(wouldCreateCycle(graph({ a: ['b'] }), 'c', 'a')).toBe(false);
  });

  it('allows a diamond', () => {
    // d waits on b and c, both of which wait on a. Shared ancestors are not
    // cycles, and a walk that only tracked visits would call this one.
    const edges = graph({ b: ['a'], c: ['a'], d: ['b'] });

    expect(wouldCreateCycle(edges, 'c', 'd')).toBe(false);
  });

  it('allows a second prerequisite on a ticket that already has one', () => {
    expect(wouldCreateCycle(graph({ a: ['b'] }), 'c', 'a')).toBe(false);
  });

  it('terminates on a graph that already contains a loop', () => {
    // Pre-existing bad data must not hang the request.
    const edges = graph({ a: ['b'], b: ['a'] });

    expect(wouldCreateCycle(edges, 'c', 'd')).toBe(false);
  });

  it('walks a long chain without running away', () => {
    // t0 waits on t1 waits on … t150.
    const spec: Record<string, string[]> = {};
    for (let i = 0; i < 150; i += 1) spec[`t${i}`] = [`t${i + 1}`];

    // Making t149 wait on t0 closes the loop, 149 hops up the chain.
    expect(wouldCreateCycle(graph(spec), 't0', 't149')).toBe(true);
    // The other direction is redundant, not circular.
    expect(wouldCreateCycle(graph(spec), 't149', 't0')).toBe(false);
  });
});

describe('loadDependencyEdges', () => {
  it('groups prerequisites by the ticket that waits on them', async () => {
    const prisma: any = {
      ticketDependency: {
        findMany: jest.fn().mockResolvedValue([
          { blockedTicketId: 'a', blockingTicketId: 'b' },
          { blockedTicketId: 'a', blockingTicketId: 'c' },
          { blockedTicketId: 'd', blockingTicketId: 'b' },
        ]),
      },
    };

    const edges = await loadDependencyEdges(prisma);

    expect(edges.get('a')).toEqual(['b', 'c']);
    expect(edges.get('d')).toEqual(['b']);
  });
});

describe('assertPrerequisitesMet — the start gate', () => {
  const prismaWith = (unmet: number[]) => ({
    ticketDependency: {
      findMany: jest.fn().mockResolvedValue(
        unmet.map((ticketNumber) => ({ blockingTicket: { ticketNumber } })),
      ),
    },
  }) as any;

  it('passes when nothing is outstanding', async () => {
    await expect(assertPrerequisitesMet(prismaWith([]), 'a')).resolves.toBeUndefined();
  });

  it('refuses while a prerequisite is unfinished', async () => {
    await expect(assertPrerequisitesMet(prismaWith([12]), 'a')).rejects.toThrow(BadRequestException);
  });

  it('names the outstanding ticket numbers', async () => {
    // "You have unmet prerequisites" without saying which just sends the reader
    // hunting through the ticket.
    await expect(assertPrerequisitesMet(prismaWith([12, 19]), 'a')).rejects.toThrow(/#12.*#19/);
  });

  it('treats COMPLETED and CLOSED as satisfied', async () => {
    const prisma = prismaWith([]);

    await assertPrerequisitesMet(prisma, 'a');

    expect(prisma.ticketDependency.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          blockedTicketId: 'a',
          // Only a blocking relation gates the start; "relates to" does not.
          type: TicketDependencyType.BLOCKS,
          blockingTicket: {
            status: { notIn: [TicketStatus.COMPLETED, TicketStatus.CLOSED] },
          },
        },
      }),
    );
  });
});
