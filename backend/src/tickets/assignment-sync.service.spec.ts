import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssignmentSyncService } from './assignment-sync.service';

const TICKET_ID = 'ticket-1';

describe('AssignmentSyncService', () => {
  let service: AssignmentSyncService;
  let prisma: any;

  /** The distinct assignees currently holding a task on the ticket. */
  const taskHolders = (...ids: string[]) => {
    prisma.ticketTask.findMany.mockResolvedValue(ids.map((assignedToId) => ({ assignedToId })));
  };

  const upsertedIds = () =>
    prisma.ticketAssignment.upsert.mock.calls.map(
      (c: any) => c[0].where.ticketId_developerId.developerId,
    );

  beforeEach(async () => {
    prisma = {
      ticketTask: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      ticketAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'a-1', isActive: true, isLead: false }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AssignmentSyncService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AssignmentSyncService);
  });

  describe('syncFromTasks — the roster follows the work', () => {
    it('activates everyone holding a task', async () => {
      taskHolders('dev-1', 'dev-2');
      prisma.ticketAssignment.count.mockResolvedValue(1);

      await service.syncFromTasks(TICKET_ID);

      expect(upsertedIds()).toEqual(['dev-1', 'dev-2']);
    });

    it('rosters one row for someone holding several tasks', async () => {
      // findMany uses distinct, so two tasks for one person arrive as one row.
      taskHolders('dev-1');
      prisma.ticketAssignment.count.mockResolvedValue(1);

      await service.syncFromTasks(TICKET_ID);

      expect(upsertedIds()).toEqual(['dev-1']);
    });

    it('promotes the first task holder when nobody leads yet', async () => {
      taskHolders('dev-1', 'dev-2');
      prisma.ticketAssignment.count.mockResolvedValue(0);

      await service.syncFromTasks(TICKET_ID);

      expect(upsertedIds()).toEqual(['dev-1', 'dev-2', 'dev-1']);
    });

    it('drops contributors who no longer hold a task', async () => {
      taskHolders('dev-1');

      await service.syncFromTasks(TICKET_ID);

      expect(prisma.ticketAssignment.updateMany).toHaveBeenCalledWith({
        where: {
          ticketId: TICKET_ID,
          isActive: true,
          isLead: false,
          developerId: { notIn: ['dev-1'] },
        },
        data: { isActive: false },
      });
    });

    it('never drops the lead', async () => {
      // The person answerable for the ticket is not always the person holding a
      // task on it, so the sync leaves the lead alone.
      taskHolders('dev-2');

      await service.syncFromTasks(TICKET_ID);

      const { where } = prisma.ticketAssignment.updateMany.mock.calls[0][0];
      expect(where.isLead).toBe(false);
    });

    it('clears every contributor when the last task goes', async () => {
      taskHolders();

      await service.syncFromTasks(TICKET_ID);

      expect(prisma.ticketAssignment.upsert).not.toHaveBeenCalled();
      // A sentinel keeps notIn well-formed on an empty list, so the deactivation
      // still matches every non-lead row.
      const { where } = prisma.ticketAssignment.updateMany.mock.calls[0][0];
      expect(where.developerId.notIn).toEqual(['-']);
    });
  });

  describe('setLead — exactly one', () => {
    it('demotes the incumbent before promoting the successor', async () => {
      await service.setLead(TICKET_ID, 'dev-2');

      // Order matters: the partial unique index fires if two rows are ever
      // flagged as lead at once.
      const demoteOrder = prisma.ticketAssignment.updateMany.mock.invocationCallOrder[0];
      const promoteOrder = prisma.ticketAssignment.upsert.mock.invocationCallOrder[0];
      expect(demoteOrder).toBeLessThan(promoteOrder);

      expect(prisma.ticketAssignment.updateMany).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, isLead: true, developerId: { not: 'dev-2' } },
        data: { isLead: false },
      });
      expect(prisma.ticketAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { isActive: true, isLead: true } }),
      );
    });

    it('re-activates a lead who had been taken off the ticket', async () => {
      await service.setLead(TICKET_ID, 'dev-3');

      expect(prisma.ticketAssignment.upsert.mock.calls[0][0].create).toMatchObject({
        isActive: true,
        isLead: true,
      });
    });
  });

  describe('addAssignee — roster membership', () => {
    it('makes the first member the lead', async () => {
      prisma.ticketAssignment.count.mockResolvedValue(0);

      await service.addAssignee(TICKET_ID, 'dev-1');

      expect(prisma.ticketAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ developerId: 'dev-1', isLead: true }),
        }),
      );
    });

    it('joins as a contributor when a lead already exists', async () => {
      prisma.ticketAssignment.count.mockResolvedValue(1);

      await service.addAssignee(TICKET_ID, 'dev-2');

      expect(prisma.ticketAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ developerId: 'dev-2', isLead: false }),
        }),
      );
    });
  });

  describe('removeAssignee', () => {
    it('allows removing the lead when they hold no open tasks', async () => {
      prisma.ticketAssignment.findUnique.mockResolvedValue({ isActive: true, isLead: true });

      await service.removeAssignee(TICKET_ID, 'dev-1');

      expect(prisma.ticketAssignment.update).toHaveBeenCalledWith({
        where: { ticketId_developerId: { ticketId: TICKET_ID, developerId: 'dev-1' } },
        data: { isActive: false, isLead: false },
      });
    });

    it('refuses to remove someone still holding work', async () => {
      // Otherwise the next task write would silently put them straight back.
      prisma.ticketTask.count.mockResolvedValue(2);

      await expect(service.removeAssignee(TICKET_ID, 'dev-1')).rejects.toThrow(BadRequestException);
    });

    it('names the outstanding task count in the refusal', async () => {
      prisma.ticketTask.count.mockResolvedValue(3);

      await expect(service.removeAssignee(TICKET_ID, 'dev-1')).rejects.toThrow(/3/);
    });

    it('deactivates rather than deletes a clean contributor', async () => {
      await service.removeAssignee(TICKET_ID, 'dev-1');

      expect(prisma.ticketAssignment.update).toHaveBeenCalledWith({
        where: { ticketId_developerId: { ticketId: TICKET_ID, developerId: 'dev-1' } },
        data: { isActive: false, isLead: false },
      });
    });

    it('404s on somebody who was never on the ticket', async () => {
      prisma.ticketAssignment.findUnique.mockResolvedValue(null);

      await expect(service.removeAssignee(TICKET_ID, 'dev-9')).rejects.toThrow(NotFoundException);
    });

    it('404s on somebody already removed', async () => {
      prisma.ticketAssignment.findUnique.mockResolvedValue({ isActive: false, isLead: false });

      await expect(service.removeAssignee(TICKET_ID, 'dev-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('requireLead — ticket transitions belong to the lead', () => {
    it('passes for the lead', async () => {
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'a-1', isLead: true });

      await expect(service.requireLead(TICKET_ID, 'dev-1')).resolves.toBeUndefined();
    });

    it('refuses a contributor who is on the ticket but does not lead it', async () => {
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await expect(service.requireLead(TICKET_ID, 'dev-2')).rejects.toThrow(ForbiddenException);
      expect(prisma.ticketAssignment.findFirst).toHaveBeenCalledWith({
        where: { ticketId: TICKET_ID, developerId: 'dev-2', isActive: true, isLead: true },
      });
    });
  });
});
