import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TaskRollupService } from './task-rollup.service';

const TICKET_ID = 'ticket-1';

/**
 * The rollup is denormalised, so the thing worth pinning is that it is derived
 * purely from the tasks — never incremented, never assumed — and that running it
 * twice is a no-op. That is what makes it usable as a repair.
 */
describe('TaskRollupService', () => {
  let service: TaskRollupService;
  let prisma: any;

  const tasksTotal = (hours: number | null, weight: number | null) => {
    prisma.ticketTask.aggregate.mockResolvedValue({
      _sum: { estimatedHours: hours, difficultyLevel: weight },
    });
  };

  beforeEach(async () => {
    prisma = {
      ticketTask: { aggregate: jest.fn() },
      ticket: { update: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TaskRollupService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TaskRollupService);
  });

  it('writes the summed hours and difficulty onto the ticket', async () => {
    tasksTotal(14, 9);

    await service.recompute(TICKET_ID);

    expect(prisma.ticketTask.aggregate).toHaveBeenCalledWith({
      where: { ticketId: TICKET_ID },
      _sum: { estimatedHours: true, difficultyLevel: true },
    });
    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: TICKET_ID },
      data: { tasksEstimatedHours: 14, tasksWeightTotal: 9 },
    });
  });

  it('clears the rollup when nothing is estimated', async () => {
    // Prisma returns null, not 0, for a sum over no rows — the ticket must fall
    // back to the manager's planned figure rather than claiming an estimate of 0.
    tasksTotal(null, null);

    await service.recompute(TICKET_ID);

    expect(prisma.ticket.update).toHaveBeenCalledWith({
      where: { id: TICKET_ID },
      data: { tasksEstimatedHours: null, tasksWeightTotal: null },
    });
  });

  it('is idempotent — a second run writes the same values', async () => {
    tasksTotal(6, 4);

    await service.recompute(TICKET_ID);
    await service.recompute(TICKET_ID);

    const [first, second] = prisma.ticket.update.mock.calls;
    expect(second[0]).toEqual(first[0]);
  });

  it('uses the surrounding transaction when one is passed', async () => {
    const tx = {
      ticketTask: { aggregate: jest.fn().mockResolvedValue({ _sum: { estimatedHours: 3, difficultyLevel: 2 } }) },
      ticket: { update: jest.fn().mockResolvedValue({}) },
    };

    await service.recompute(TICKET_ID, tx as any);

    expect(tx.ticket.update).toHaveBeenCalled();
    expect(prisma.ticket.update).not.toHaveBeenCalled();
  });
});
