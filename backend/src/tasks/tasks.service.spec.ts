import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TaskStatus, UserRole } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { AssignmentSyncService } from '../tickets/assignment-sync.service';
import { TaskRollupService } from '../tickets/task-rollup.service';

const TICKET_ID = 'ticket-1';
const TASK_ID = 'task-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: 'company-1',
});

const ticketRow = {
  id: TICKET_ID,
  title: 'تعديل شاشة الفواتير',
  ticketNumber: 42,
  systemId: 'system-1',
  companyId: 'company-1',
  creatorId: 'creator-1',
  systemOwnerId: null,
};

const taskRow = (over: Partial<Record<string, any>> = {}) => ({
  id: TASK_ID,
  ticketId: TICKET_ID,
  title: 'ربط الـ API',
  description: null,
  assignedToId: 'dev-1',
  createdById: 'pm-1',
  status: TaskStatus.NEW,
  estimatedHours: null,
  difficultyLevel: null,
  ...over,
});

describe('TasksService', () => {
  let service: TasksService;
  let prisma: any;
  let rollup: { recompute: jest.Mock };
  let assignments: { syncFromTasks: jest.Mock };
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };

  /** Makes `filterMentionable` accept or reject the candidate assignee. */
  const assigneeIsEligible = (eligible: boolean, id = 'dev-1') => {
    prisma.user.findMany.mockResolvedValue(
      eligible
        ? [{
            id,
            role: UserRole.DEVELOPER,
            companyId: 'company-1',
            systems: [{ systemId: 'system-1' }],
            companies: [{ companyId: 'company-1' }],
            assignments: [],
            tasksAssigned: [],
            _count: { systems: 1, companies: 1 },
          }]
        : [],
    );
  };

  beforeEach(async () => {
    prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(ticketRow),
        // 1 = reachable. The scope rules themselves live in access.service.spec.ts.
        count: jest.fn().mockResolvedValue(1),
        update: jest.fn().mockResolvedValue({}),
      },
      ticketTask: {
        findUnique: jest.fn().mockResolvedValue(taskRow()),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: TASK_ID, ...data })),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...taskRow(), ...data })),
        delete: jest.fn().mockResolvedValue(taskRow()),
        aggregate: jest.fn().mockResolvedValue({ _sum: { estimatedHours: null, difficultyLevel: null } }),
      },
      ticketAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((fn: any) => fn(prisma)),
    };
    rollup = { recompute: jest.fn().mockResolvedValue(undefined) };
    assignments = { syncFromTasks: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = { notify: jest.fn().mockResolvedValue(undefined), notifyMany: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: { sendTaskAssigned: jest.fn() } },
        { provide: AssignmentSyncService, useValue: assignments },
        { provide: TaskRollupService, useValue: rollup },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://barmijly.ai') } },
      ],
    }).compile();

    service = module.get(TasksService);
    assigneeIsEligible(true);
  });

  describe('create — who may break a ticket into tasks', () => {
    it.each([UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT])(
      'lets %s create a task',
      async (role) => {
        await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(role));

        expect(prisma.ticketTask.create).toHaveBeenCalled();
      },
    );

    it.each([UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER])('refuses %s', async (role) => {
      await expect(
        service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(role)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses an assignee who cannot reach the ticket', async () => {
      // Otherwise a task hands someone the ticket through the back door —
      // AccessService.ticketScope grants developers read on tasks they hold.
      assigneeIsEligible(false);

      await expect(
        service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'outsider-1' } as any, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s on a ticket that does not exist', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);

      await expect(
        service.create('missing', { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(NotFoundException);
    });

    it('stores the estimate and recomputes the ticket rollup', async () => {
      await service.create(
        TICKET_ID,
        { title: 'مهمة', assignedToId: 'dev-1', estimatedHours: 6, difficultyLevel: 3 } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticketTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ estimatedHours: 6, difficultyLevel: 3 }),
        }),
      );
      expect(rollup.recompute).toHaveBeenCalledWith(TICKET_ID, prisma);
    });

    it('puts the assignee on the ticket roster', async () => {
      // Holding a task is what makes someone an assignee — nobody maintains the
      // roster by hand.
      await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(UserRole.PROJECT_MANAGER));

      expect(assignments.syncFromTasks).toHaveBeenCalledWith(TICKET_ID, prisma);
    });

    it('writes an audit entry', async () => {
      await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(UserRole.PROJECT_MANAGER));

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'TASK_CREATE', entity: 'TicketTask', ticketId: TICKET_ID }),
      );
    });

    it('notifies the assignee, but not when assigning to yourself', async () => {
      await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));
      expect(notifications.notify).toHaveBeenCalledWith('dev-1', expect.anything(), 'pm-1');

      notifications.notify.mockClear();
      assigneeIsEligible(true, 'pm-1');
      await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'pm-1' } as any, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));
      expect(notifications.notify).not.toHaveBeenCalled();
    });
  });

  describe('create — a developer breaking down their own work', () => {
    beforeEach(() => {
      // On the ticket, so the assignment check passes.
      prisma.ticketAssignment.findFirst.mockResolvedValue({ id: 'a-1', isActive: true });
    });

    it.each([UserRole.DEVELOPER, UserRole.QA])('lets %s create a task for themselves', async (role) => {
      assigneeIsEligible(true, 'self-1');

      await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'self-1' } as any, asUser(role, 'self-1'));

      expect(prisma.ticketTask.create).toHaveBeenCalled();
    });

    it('refuses a developer assigning work to someone else', async () => {
      // Handing work to a teammate is a scoping decision; it stays with
      // leadership even though creating your own task does not.
      await expect(
        service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-2' } as any, asUser(UserRole.DEVELOPER, 'self-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a developer on a ticket they are not assigned to', async () => {
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);
      assigneeIsEligible(true, 'self-1');

      await expect(
        service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'self-1' } as any, asUser(UserRole.DEVELOPER, 'self-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not require a manager to be assigned to the ticket', async () => {
      prisma.ticketAssignment.findFirst.mockResolvedValue(null);

      await service.create(TICKET_ID, { title: 'مهمة', assignedToId: 'dev-1' } as any, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketTask.create).toHaveBeenCalled();
    });
  });

  describe('remove — a developer tidying up their own task', () => {
    const ownTask = (over: Record<string, any> = {}) => {
      prisma.ticketTask.findUnique.mockResolvedValue(
        taskRow({ createdById: 'self-1', assignedToId: 'self-1', ...over }),
      );
    };

    it('lets a developer delete their own task that has not started', async () => {
      ownTask();

      await service.remove(TASK_ID, asUser(UserRole.DEVELOPER, 'self-1'));

      expect(prisma.ticketTask.delete).toHaveBeenCalled();
    });

    it('refuses once the task is under way', async () => {
      // Past NEW it is a record of work that happened, not a mis-typed line.
      ownTask({ status: TaskStatus.IN_PROGRESS });

      await expect(service.remove(TASK_ID, asUser(UserRole.DEVELOPER, 'self-1')))
        .rejects.toThrow(ForbiddenException);
    });

    it('refuses a task a manager created for them', async () => {
      ownTask({ createdById: 'pm-1' });

      await expect(service.remove(TASK_ID, asUser(UserRole.DEVELOPER, 'self-1')))
        .rejects.toThrow(ForbiddenException);
    });

    it("refuses another developer's task", async () => {
      ownTask();

      await expect(service.remove(TASK_ID, asUser(UserRole.DEVELOPER, 'other-dev')))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('update — the assignee owns progress, the manager owns scope', () => {
    it('lets the assignee move their own task', async () => {
      await service.update(TASK_ID, { status: TaskStatus.IN_PROGRESS }, asUser(UserRole.DEVELOPER, 'dev-1'));

      expect(prisma.ticketTask.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: TaskStatus.IN_PROGRESS }) }),
      );
    });

    it('refuses someone who is neither the assignee nor a manager', async () => {
      await expect(
        service.update(TASK_ID, { status: TaskStatus.COMPLETED }, asUser(UserRole.DEVELOPER, 'other-dev')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('drops title and due date edits from the assignee', async () => {
      await service.update(
        TASK_ID,
        { title: 'عنوان جديد', dueDate: '2026-09-01', status: TaskStatus.IN_PROGRESS },
        asUser(UserRole.DEVELOPER, 'dev-1'),
      );

      const { data } = prisma.ticketTask.update.mock.calls[0][0];
      expect(data).not.toHaveProperty('title');
      expect(data).not.toHaveProperty('dueDate');
      expect(data.status).toBe(TaskStatus.IN_PROGRESS);
    });

    it('lets the assignee revise their own estimate', async () => {
      await service.update(TASK_ID, { estimatedHours: 9 }, asUser(UserRole.DEVELOPER, 'dev-1'));

      expect(prisma.ticketTask.update.mock.calls[0][0].data.estimatedHours).toBe(9);
      expect(rollup.recompute).toHaveBeenCalledWith(TICKET_ID, prisma);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TASK_UPDATE',
          oldValues: expect.objectContaining({ estimatedHours: null, title: 'ربط الـ API' }),
          newValues: expect.objectContaining({ estimatedHours: 9, title: 'ربط الـ API' }),
        }),
      );
    });

    it('lets a manager reassign the task', async () => {
      assigneeIsEligible(true, 'dev-2');

      await service.update(TASK_ID, { assignedToId: 'dev-2' }, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

      expect(prisma.ticketTask.update.mock.calls[0][0].data.assignedToId).toBe('dev-2');
      expect(notifications.notify).toHaveBeenCalledWith('dev-2', expect.anything(), 'pm-1');
    });

    it('refuses a reassignment to someone outside the ticket', async () => {
      assigneeIsEligible(false);

      await expect(
        service.update(TASK_ID, { assignedToId: 'outsider-1' }, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('records a status change in the audit log', async () => {
      await service.update(TASK_ID, { status: TaskStatus.COMPLETED }, asUser(UserRole.DEVELOPER, 'dev-1'));

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'TASK_STATUS_CHANGE',
          entityId: TASK_ID,
          oldValues: expect.objectContaining({ status: TaskStatus.NEW, title: 'ربط الـ API' }),
          newValues: expect.objectContaining({ status: TaskStatus.COMPLETED, title: 'ربط الـ API' }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('refuses a developer', async () => {
      await expect(service.remove(TASK_ID, asUser(UserRole.DEVELOPER, 'dev-1'))).rejects.toThrow(ForbiddenException);
    });

    it('deletes and recomputes the rollup for a manager', async () => {
      await service.remove(TASK_ID, asUser(UserRole.PROJECT_MANAGER));

      expect(prisma.ticketTask.delete).toHaveBeenCalledWith({ where: { id: TASK_ID } });
      expect(assignments.syncFromTasks).toHaveBeenCalledWith(TICKET_ID, prisma);
      expect(rollup.recompute).toHaveBeenCalledWith(TICKET_ID, prisma);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TASK_DELETE' }));
    });

    it('404s on a task that does not exist', async () => {
      prisma.ticketTask.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', asUser(UserRole.PROJECT_MANAGER))).rejects.toThrow(NotFoundException);
    });
  });
});
