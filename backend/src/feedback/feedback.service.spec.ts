import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeedbackKind, FeedbackStatus, NotificationType, UserRole } from '@prisma/client';
import { FeedbackService } from './feedback.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const ROW = 'fb-1';
const DEV = 'dev-1';
const HEAD = 'head-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
});

const feedbackRow = (over: Record<string, unknown> = {}) => ({
  id: ROW,
  title: 'طريقة أوضح للتواصل',
  body: 'نحتاج قناة واحدة للأسئلة اليومية',
  kind: FeedbackKind.IMPROVEMENT,
  status: FeedbackStatus.OPEN,
  proposedSolution: 'قناة Slack للفريق',
  resolutionNote: null,
  createdById: DEV,
  assigneeId: HEAD,
  ...over,
});

const validDto = {
  title: 'طريقة أوضح للتواصل',
  body: 'نحتاج قناة واحدة للأسئلة اليومية',
  kind: FeedbackKind.IMPROVEMENT,
  assigneeId: HEAD,
  proposedSolution: 'قناة Slack للفريق',
};

describe('FeedbackService', () => {
  let service: FeedbackService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      feedback: {
        findUnique: jest.fn().mockResolvedValue(feedbackRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...feedbackRow(), ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...feedbackRow(), ...data })),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: HEAD, isActive: true }),
        findMany: jest.fn().mockResolvedValue([{ id: HEAD }]),
      },
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    notifications = {
      notify: jest.fn().mockResolvedValue({}),
      notifyMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(FeedbackService);
  });

  // ------------------------------------------------------------- role gates

  it('lets a ticket requester file a request', async () => {
    const row = await service.create(validDto, asUser(UserRole.TICKET_REQUESTER, 'req-1'));
    expect(row.createdById).toBe('req-1');
    expect(prisma.feedback.create).toHaveBeenCalled();
  });

  it('refuses a status change from the author who is not the assignee', async () => {
    await expect(
      service.update(ROW, { status: FeedbackStatus.RESOLVED }, asUser(UserRole.DEVELOPER, DEV)),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.feedback.update).not.toHaveBeenCalled();
  });

  it('lets the named person move status without leadership', async () => {
    const row = await service.update(
      ROW,
      { status: FeedbackStatus.IN_PROGRESS },
      asUser(UserRole.DEVELOPER, HEAD),
    );
    expect(row.status).toBe(FeedbackStatus.IN_PROGRESS);
  });

  it('refuses a reassignment from the named person who cannot triage', async () => {
    await expect(
      service.update(ROW, { assigneeId: 'other' }, asUser(UserRole.DEVELOPER, HEAD)),
    ).rejects.toThrow(ForbiddenException);
  });

  // ---------------------------------------------------------------- reading

  it('limits a developer to their own rows and rows assigned to them', async () => {
    await service.findAll(asUser(UserRole.DEVELOPER, DEV), {});

    const where = prisma.feedback.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [{ createdById: DEV }, { assigneeId: DEV }],
    });
  });

  it('leaves the list unfiltered for a role that triages', async () => {
    await service.findAll(asUser(UserRole.PROJECT_MANAGER), {});

    const where = prisma.feedback.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({});
  });

  it('hides another person’s request behind a 404', async () => {
    prisma.feedback.findUnique.mockResolvedValue(
      feedbackRow({ createdById: 'someone-else', assigneeId: 'also-else' }),
    );

    await expect(service.findOne(ROW, asUser(UserRole.DEVELOPER, DEV))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('lets leadership read a general row that has no assignee', async () => {
    prisma.feedback.findUnique.mockResolvedValue(
      feedbackRow({ createdById: 'someone-else', assigneeId: null }),
    );

    await expect(service.findOne(ROW, asUser(UserRole.PROGRAMMING_HEAD, HEAD))).resolves.toEqual(
      expect.objectContaining({ id: ROW }),
    );
  });

  // ---------------------------------------------------------------- writing

  it('notifies the named person when one is set', async () => {
    await service.create(validDto, asUser(UserRole.DEVELOPER, DEV));

    expect(notifications.notify).toHaveBeenCalledWith(
      HEAD,
      expect.objectContaining({ type: NotificationType.FEEDBACK_CREATED }),
      DEV,
    );
    expect(notifications.notifyMany).not.toHaveBeenCalled();
  });

  it('notifies leadership when the request is general', async () => {
    const { assigneeId: _drop, ...general } = validDto;
    await service.create(general, asUser(UserRole.DEVELOPER, DEV));

    expect(notifications.notifyMany).toHaveBeenCalledWith(
      [HEAD],
      expect.objectContaining({ type: NotificationType.FEEDBACK_CREATED }),
      DEV,
    );
  });

  it('refuses an assignee who is not an active user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: HEAD, isActive: false });

    await expect(service.create(validDto, asUser(UserRole.DEVELOPER, DEV))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.feedback.create).not.toHaveBeenCalled();
  });

  it('notifies the author when leadership resolves the row', async () => {
    await service.update(
      ROW,
      { status: FeedbackStatus.RESOLVED, resolutionNote: 'فتحنا قناة' },
      asUser(UserRole.PROGRAMMING_HEAD, HEAD),
    );

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FEEDBACK_UPDATE', entity: 'Feedback' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      DEV,
      expect.objectContaining({ type: NotificationType.FEEDBACK_UPDATED }),
      HEAD,
    );
  });

  it('lets leadership clear the assignee back to general', async () => {
    await service.update(ROW, { assigneeId: null }, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

    expect(prisma.feedback.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ assigneeId: null }),
      }),
    );
  });
});
