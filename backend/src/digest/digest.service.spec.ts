import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { CommentVisibility, NotificationType, TaskStatus, TicketStatus, UserRole } from '@prisma/client';
import { DigestService, DIGEST_JOB_NAME } from './digest.service';
import { DigestRecipient, formatTicketCode } from './digest.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { EmailService } from '../email/email.service';

const HEAD: DigestRecipient = {
  id: 'head-1',
  firstName: 'سالم',
  lastName: 'القحطاني',
  email: 'head@company.com',
  role: UserRole.PROGRAMMING_HEAD,
};

const REQUESTER: DigestRecipient = {
  id: 'req-1',
  firstName: 'ندى',
  lastName: 'الحربي',
  email: 'requester@company.com',
  role: UserRole.TICKET_REQUESTER,
};

const DEVELOPER: DigestRecipient = {
  id: 'dev-1',
  firstName: 'خالد',
  lastName: 'العمري',
  email: 'dev@company.com',
  role: UserRole.DEVELOPER,
};

const PM: DigestRecipient = {
  id: 'pm-1',
  firstName: 'منى',
  lastName: 'الشهري',
  email: 'pm@company.com',
  role: UserRole.PROJECT_MANAGER,
};

const QA: DigestRecipient = {
  id: 'qa-1',
  firstName: 'ليان',
  lastName: 'الغامدي',
  email: 'qa@company.com',
  role: UserRole.QA,
};

const OWNER: DigestRecipient = {
  id: 'owner-1',
  firstName: 'عمر',
  lastName: 'الدوسري',
  email: 'owner@company.com',
  role: UserRole.SYSTEM_OWNER,
};

const SENIOR: DigestRecipient = {
  id: 'senior-1',
  firstName: 'سلمان',
  lastName: 'العتيبي',
  email: 'senior@company.com',
  role: UserRole.SENIOR_MANAGEMENT,
};

/** TicketsService transitions each role is allowed to perform. */
const ROLE_ACTION_QUEUES: Array<{
  recipient: DigestRecipient;
  queriedStatuses: TicketStatus[];
  groups: Array<{ label: string; statuses: TicketStatus[] }>;
}> = [
  {
    recipient: HEAD,
    queriedStatuses: [
      TicketStatus.NEW, TicketStatus.AWAITING_APPROVAL, TicketStatus.APPROVED,
      TicketStatus.AWAITING_TESTING, TicketStatus.AWAITING_OWNER_APPROVAL,
      TicketStatus.BLOCKED, TicketStatus.ON_HOLD,
    ],
    groups: [
      { label: 'بانتظار اعتمادك', statuses: [TicketStatus.NEW, TicketStatus.AWAITING_APPROVAL] },
      { label: 'معتمدة بانتظار الإسناد', statuses: [TicketStatus.APPROVED] },
      { label: 'بانتظار الاختبار', statuses: [TicketStatus.AWAITING_TESTING] },
      { label: 'بانتظار اعتماد الإغلاق', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
      // A stopped ticket used to fall out of every queue and every digest, so
      // ON_HOLD was somewhere tickets went to be forgotten.
      { label: 'متوقفة بانتظار رفع العائق', statuses: [TicketStatus.BLOCKED] },
      { label: 'معلقة', statuses: [TicketStatus.ON_HOLD] },
    ],
  },
  {
    recipient: PM,
    queriedStatuses: [
      TicketStatus.APPROVED, TicketStatus.AWAITING_TESTING, TicketStatus.AWAITING_OWNER_APPROVAL,
      TicketStatus.BLOCKED, TicketStatus.ON_HOLD,
    ],
    groups: [
      { label: 'معتمدة بانتظار الإسناد', statuses: [TicketStatus.APPROVED] },
      { label: 'بانتظار الاختبار', statuses: [TicketStatus.AWAITING_TESTING] },
      { label: 'بانتظار اعتماد الإغلاق', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
      { label: 'متوقفة بانتظار رفع العائق', statuses: [TicketStatus.BLOCKED] },
      { label: 'معلقة', statuses: [TicketStatus.ON_HOLD] },
    ],
  },
  {
    recipient: QA,
    queriedStatuses: [TicketStatus.AWAITING_TESTING],
    groups: [
      { label: 'بانتظار اختبارك', statuses: [TicketStatus.AWAITING_TESTING] },
    ],
  },
  {
    recipient: OWNER,
    queriedStatuses: [TicketStatus.AWAITING_OWNER_APPROVAL],
    groups: [
      { label: 'بانتظار اعتمادك النهائي', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
    ],
  },
  {
    recipient: DEVELOPER,
    queriedStatuses: [TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, TicketStatus.BLOCKED],
    groups: [
      { label: 'مجدولة للبدء', statuses: [TicketStatus.SCHEDULED] },
      { label: 'قيد التنفيذ لديك', statuses: [TicketStatus.IN_PROGRESS] },
      { label: 'متوقفة لديك', statuses: [TicketStatus.BLOCKED] },
    ],
  },
  {
    recipient: REQUESTER,
    queriedStatuses: [
      TicketStatus.AWAITING_INFO, TicketStatus.AWAITING_OWNER_APPROVAL, TicketStatus.DRAFT,
    ],
    groups: [
      { label: 'بانتظار معلومات منك', statuses: [TicketStatus.AWAITING_INFO] },
      { label: 'بانتظار اعتمادك النهائي', statuses: [TicketStatus.AWAITING_OWNER_APPROVAL] },
      { label: 'مسودات لم تُرسل بعد', statuses: [TicketStatus.DRAFT] },
    ],
  },
  {
    recipient: SENIOR,
    queriedStatuses: [],
    groups: [],
  },
];

const ticketRow = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'ticket-1',
  ticketNumber: 42,
  title: 'تعديل شاشة الفواتير',
  status: TicketStatus.NEW,
  priority: null,
  finalPriority: null,
  estimatedDeadline: null,
  company: { name: 'شركة سنم' },
  system: { name: 'نظام الفواتير' },
  ...over,
});

describe('formatTicketCode', () => {
  it('matches the app display id', () => {
    expect(formatTicketCode(1)).toBe('BRM-0001');
    expect(formatTicketCode(31)).toBe('BRM-0031');
    expect(formatTicketCode(42)).toBe('BRM-0042');
    expect(formatTicketCode(9999)).toBe('BRM-9999');
  });
});

describe('DigestService', () => {
  let service: DigestService;
  let prisma: any;
  let email: { sendDailyDigest: jest.Mock };
  let scheduler: { addCronJob: jest.Mock };
  let env: Record<string, string>;
  const startedJobs: CronJob[] = [];

  beforeEach(async () => {
    env = { FRONTEND_URL: 'https://barmijly.test' };

    prisma = {
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      ticketComment: { findMany: jest.fn().mockResolvedValue([]) },
      ticketTask: { findMany: jest.fn().mockResolvedValue([]) },
      bug: { findMany: jest.fn().mockResolvedValue([]) },
      notification: { groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      ticket: {
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    email = { sendDailyDigest: jest.fn().mockResolvedValue(undefined) };
    scheduler = {
      addCronJob: jest.fn((_name: string, job: CronJob) => {
        startedJobs.push(job);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DigestService,
        // Real AccessService on purpose: the digest must inherit the app's
        // visibility rules, and a stub here would assert nothing.
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: email },
        { provide: SchedulerRegistry, useValue: scheduler },
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
      ],
    }).compile();

    service = module.get<DigestService>(DigestService);
  });

  afterEach(() => {
    // The real CronJob sets a timer on start(); stop it so jest can exit.
    for (const job of startedJobs.splice(0)) {
      job.stop();
    }
  });

  describe('schedule', () => {
    it('defaults to 09:00 Saudi time, Sunday to Thursday', () => {
      service.onModuleInit();

      expect(scheduler.addCronJob).toHaveBeenCalledWith(DIGEST_JOB_NAME, expect.any(CronJob));
      const job = scheduler.addCronJob.mock.calls[0][1] as CronJob;
      expect(job.cronTime.source).toBe('0 9 * * 0-4');
      expect(job.cronTime.timeZone).toBe('Asia/Riyadh');
      expect(job.isActive).toBe(true);
    });

    it('never fires on the Friday/Saturday weekend', () => {
      service.onModuleInit();

      const job = scheduler.addCronJob.mock.calls[0][1] as CronJob;
      const weekdays = job.nextDates(10).map((d) => d.weekday); // luxon: 5 = Fri, 6 = Sat

      expect(weekdays).not.toContain(5);
      expect(weekdays).not.toContain(6);
    });

    it('honours DAILY_DIGEST_TIME and DAILY_DIGEST_TIMEZONE', () => {
      env.DAILY_DIGEST_TIME = '07:30';
      env.DAILY_DIGEST_TIMEZONE = 'Africa/Cairo';

      service.onModuleInit();

      const job = scheduler.addCronJob.mock.calls[0][1] as CronJob;
      expect(job.cronTime.source).toBe('30 7 * * 0-4');
      expect(job.cronTime.timeZone).toBe('Africa/Cairo');
    });

    it('honours DAILY_DIGEST_DAYS for a different working week', () => {
      env.DAILY_DIGEST_DAYS = '1-5';

      service.onModuleInit();

      const job = scheduler.addCronJob.mock.calls[0][1] as CronJob;
      expect(job.cronTime.source).toBe('0 9 * * 1-5');
    });

    it('falls back to the default when the time, zone or days are invalid', () => {
      env.DAILY_DIGEST_TIME = '25:99';
      env.DAILY_DIGEST_TIMEZONE = 'Mars/Olympus';
      env.DAILY_DIGEST_DAYS = 'Funday';

      service.onModuleInit();

      const job = scheduler.addCronJob.mock.calls[0][1] as CronJob;
      expect(job.cronTime.source).toBe('0 9 * * 0-4');
      expect(job.cronTime.timeZone).toBe('Asia/Riyadh');
    });

    it('registers nothing when DAILY_DIGEST_ENABLED=false', () => {
      env.DAILY_DIGEST_ENABLED = 'false';

      service.onModuleInit();

      expect(scheduler.addCronJob).not.toHaveBeenCalled();
    });

    it('registers nothing when DAILY_DIGEST_ENABLED=False (case-insensitive)', () => {
      env.DAILY_DIGEST_ENABLED = 'False';

      service.onModuleInit();

      expect(scheduler.addCronJob).not.toHaveBeenCalled();
    });
  });

  describe('buildDigest — role scoping', () => {
    it('limits a requester to their own tickets and public comments', async () => {
      await service.buildDigest(REQUESTER);

      const commentWhere = prisma.ticketComment.findMany.mock.calls[0][0].where;
      expect(commentWhere.mentions).toEqual({ has: REQUESTER.id });
      expect(commentWhere.visibility).toBe(CommentVisibility.PUBLIC);

      const ticketWheres = prisma.ticket.findMany.mock.calls.map((c: any[]) => c[0].where);
      expect(ticketWheres.every((w: any) => w.AND?.[1]?.creatorId === REQUESTER.id)).toBe(true);
      expect(ticketWheres.every((w: any) => w.AND?.[0]?.isArchived === false)).toBe(true);
    });

    it('does not hide internal comments from the programming head', async () => {
      await service.buildDigest(HEAD);

      const commentWhere = prisma.ticketComment.findMany.mock.calls[0][0].where;
      expect(commentWhere.visibility).toBeUndefined();
    });

    it('limits a developer to tickets actively assigned to them', async () => {
      await service.buildDigest(DEVELOPER);

      const ticketWheres = prisma.ticket.findMany.mock.calls.map((c: any[]) => c[0].where);
      expect(ticketWheres[0].AND[1].OR).toContainEqual({
        assignments: { some: { developerId: DEVELOPER.id, isActive: true } },
      });
    });

    it('scopes a system owner to owned tickets and their companies', async () => {
      prisma.userCompany.findMany.mockResolvedValue([{ companyId: 'company-9' }]);

      await service.buildDigest({ ...REQUESTER, role: UserRole.SYSTEM_OWNER });

      const where = prisma.ticket.findMany.mock.calls[0][0].where;
      expect(where.AND[1].OR).toEqual([
        { creatorId: REQUESTER.id },
        { systemOwnerId: REQUESTER.id },
        { companyId: { in: ['company-9'] } },
      ]);
    });
  });

  describe('buildDigest — action groups', () => {
    it('groups the programming head approval queue with its true total', async () => {
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.status?.in ? [ticketRow(), ticketRow({ id: 't2', ticketNumber: 43 })] : []),
      );
      prisma.ticket.groupBy.mockResolvedValue([
        { status: TicketStatus.NEW, _count: { _all: 5 } },
        { status: TicketStatus.APPROVED, _count: { _all: 0 } },
      ]);

      const digest = await service.buildDigest(HEAD);

      expect(digest.actionGroups).toHaveLength(1);
      expect(digest.actionGroups[0].label).toBe('بانتظار اعتمادك');
      expect(digest.actionGroups[0].total).toBe(5);
      expect(digest.actionTotal).toBe(5);
      expect(digest.actionGroups[0].tickets[0].url).toBe('https://barmijly.test/tickets/ticket-1');
      expect(digest.actionGroups[0].tickets[0].ticketCode).toBe('BRM-0042');
      expect(digest.isEmpty).toBe(false);
    });

    it('counts a stale action queue without listing it again', async () => {
      prisma.ticket.groupBy.mockResolvedValue([
        { status: TicketStatus.NEW, _count: { _all: 5 } },
      ]);

      const digest = await service.buildDigest(HEAD);

      expect(digest.actionGroups).toEqual([]);
      expect(digest.actionTotal).toBe(5);
      expect(digest.isEmpty).toBe(true);
    });

    it('gives senior management no action groups', async () => {
      const digest = await service.buildDigest(SENIOR);

      expect(digest.actionGroups).toEqual([]);
      expect(prisma.ticket.groupBy).not.toHaveBeenCalled();
    });

    it.each(ROLE_ACTION_QUEUES)(
      '$recipient.role only queues statuses that role can move',
      async ({ recipient, queriedStatuses, groups }) => {
        const rows = Object.values(TicketStatus).map((status, i) =>
          ticketRow({ id: `t-${status}`, ticketNumber: i + 1, status }),
        );
        prisma.ticket.findMany.mockImplementation(({ where }: any) => {
          if (where.status?.in) {
            return Promise.resolve(rows.filter((r) => where.status.in.includes(r.status)));
          }
          return Promise.resolve([]);
        });
        prisma.ticket.groupBy.mockResolvedValue(
          Object.values(TicketStatus).map((status) => ({ status, _count: { _all: 1 } })),
        );

        const digest = await service.buildDigest(recipient);
        const actionCall = prisma.ticket.findMany.mock.calls.find(
          (c: any[]) => c[0].where.status?.in,
        );

        if (queriedStatuses.length === 0) {
          expect(actionCall).toBeUndefined();
          expect(digest.actionGroups).toEqual([]);
          return;
        }

        expect([...actionCall[0].where.status.in].sort()).toEqual([...queriedStatuses].sort());
        expect(actionCall[0].where.OR).toEqual(
          expect.arrayContaining([
            { createdAt: { gte: expect.any(Date) } },
            {
              statusHistory: {
                some: { toStatus: { in: actionCall[0].where.status.in }, createdAt: { gte: expect.any(Date) } },
              },
            },
          ]),
        );
        expect(digest.actionGroups.map((g) => g.label)).toEqual(groups.map((g) => g.label));
        expect(digest.actionGroups.map((g) => g.tickets.map((t) => t.status))).toEqual(
          groups.map((g) => g.statuses),
        );
      },
    );

    it('does not put the programming-head approval queue on the project manager', async () => {
      await service.buildDigest(PM);

      const actionCall = prisma.ticket.findMany.mock.calls.find((c: any[]) => c[0].where.status?.in);
      expect(actionCall[0].where.status.in).not.toContain(TicketStatus.NEW);
      expect(actionCall[0].where.status.in).not.toContain(TicketStatus.AWAITING_APPROVAL);
    });

    it('does not put developer work on QA, or QA testing on the developer', async () => {
      await service.buildDigest(QA);
      const qaStatuses = prisma.ticket.findMany.mock.calls.find(
        (c: any[]) => c[0].where.status?.in,
      )[0].where.status.in;

      prisma.ticket.findMany.mockClear();
      await service.buildDigest(DEVELOPER);
      const devStatuses = prisma.ticket.findMany.mock.calls.find(
        (c: any[]) => c[0].where.status?.in,
      )[0].where.status.in;

      expect(qaStatuses).toEqual([TicketStatus.AWAITING_TESTING]);
      expect(devStatuses).toEqual([TicketStatus.SCHEDULED, TicketStatus.IN_PROGRESS, TicketStatus.BLOCKED]);
    });
  });

  describe('buildDigest — activity', () => {
    it('counts unread comment threads and keeps the busiest first', async () => {
      prisma.notification.groupBy.mockResolvedValue([
        { ticketId: 'ticket-1', _count: { _all: 2 } },
        { ticketId: 'ticket-2', _count: { _all: 7 } },
      ]);
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.id?.in
            ? [ticketRow(), ticketRow({ id: 'ticket-2', ticketNumber: 43 })]
            : [],
        ),
      );

      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.unreadTotal).toBe(9);
      expect(digest.unreadThreads.map((t) => t.count)).toEqual([7, 2]);
      expect(prisma.notification.groupBy.mock.calls[0][0].where.createdAt).toEqual({
        gte: expect.any(Date),
      });
    });

    it('includes bugs filed on assigned tickets in the lookback window', async () => {
      prisma.bug.findMany.mockResolvedValue([
        {
          id: 'bug-1',
          bugNumber: 5,
          title: 'زر الحفظ لا يعمل',
          createdAt: new Date('2026-08-18T10:00:00Z'),
          ticket: ticketRow(),
          reportedBy: { firstName: 'ليان', lastName: 'الغامدي' },
        },
      ]);

      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.bugAlerts).toHaveLength(1);
      expect(digest.bugAlerts[0].bugCode).toBe('BUG-0005');
      expect(digest.bugAlerts[0].summary).toContain('زر الحفظ لا يعمل');
      expect(digest.bugAlertTotal).toBe(1);
      expect(digest.isEmpty).toBe(false);
      expect(prisma.bug.findMany.mock.calls[0][0].where.createdAt).toEqual({
        gte: expect.any(Date),
      });
    });

    it('includes linked bugs from notifications even when already read in-app', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'note-1',
          ticketId: 'ticket-1',
          body: 'ليان سجّل الخطأ «زر الحفظ لا يعمل» على تذكرتك',
          metadata: { bugId: 'bug-9', bugNumber: 9 },
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
      ]);
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id?.in ? [ticketRow()] : []),
      );

      const digest = await service.buildDigest(DEVELOPER);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: DEVELOPER.id,
            type: NotificationType.BUG_ASSIGNED,
            ticketId: { not: null },
          }),
        }),
      );
      expect(prisma.notification.findMany.mock.calls[0][0].where.isRead).toBeUndefined();
      expect(digest.bugAlerts).toHaveLength(1);
      expect(digest.bugAlerts[0].bugCode).toBe('BUG-0009');
      expect(digest.bugAlerts[0].summary).toContain('زر الحفظ لا يعمل');
      expect(digest.bugAlertTotal).toBe(1);
      expect(digest.isEmpty).toBe(false);
    });

    it('drops bug alerts for tickets outside the recipient scope', async () => {
      prisma.notification.findMany.mockResolvedValue([
        {
          id: 'note-1',
          ticketId: 'out-of-scope',
          body: 'خطأ على تذكرة لا يراها المطور',
          metadata: { bugId: 'bug-9', bugNumber: 9 },
          createdAt: new Date('2026-08-18T10:00:00Z'),
        },
      ]);
      prisma.ticket.findMany.mockResolvedValue([]);

      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.bugAlerts).toEqual([]);
      expect(digest.bugAlertTotal).toBe(0);
      expect(digest.isEmpty).toBe(true);
    });

    it('formats ticket codes the same way the app does', async () => {
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(where.status?.in ? [ticketRow({ ticketNumber: 31 })] : []),
      );
      prisma.ticket.groupBy.mockResolvedValue([
        { status: TicketStatus.NEW, _count: { _all: 1 } },
      ]);

      const digest = await service.buildDigest(HEAD);

      expect(digest.actionGroups[0].tickets[0].ticketCode).toBe(formatTicketCode(31));
      expect(digest.actionGroups[0].tickets[0].ticketCode).toBe('BRM-0031');
    });

    it('includes mentions and open tasks', async () => {
      prisma.ticketComment.findMany.mockResolvedValue([
        {
          content: '  مرحباً\n@خالد راجع هذا  ',
          createdAt: new Date('2026-08-18T10:00:00Z'),
          author: { firstName: 'ندى', lastName: 'الحربي' },
          ticket: ticketRow(),
        },
      ]);
      prisma.ticketTask.findMany.mockResolvedValue([
        {
          id: 'task-1',
          title: 'تجهيز قاعدة البيانات',
          status: TaskStatus.IN_PROGRESS,
          dueDate: null,
          ticket: ticketRow(),
        },
      ]);

      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.mentions[0].authorName).toBe('ندى الحربي');
      expect(digest.mentions[0].excerpt).toBe('مرحباً @خالد راجع هذا');
      expect(digest.mentions[0].ticket.ticketCode).toBe('BRM-0042');
      expect(digest.openTasks[0].title).toBe('تجهيز قاعدة البيانات');
      expect(digest.openTasks[0].ticket.ticketCode).toBe('BRM-0042');
      expect(digest.isEmpty).toBe(false);
      expect(prisma.ticketTask.findMany.mock.calls[0][0].where.OR).toEqual(
        expect.arrayContaining([
          { createdAt: { gte: expect.any(Date) } },
          { dueDate: { gte: expect.any(Date), lte: expect.any(Date) } },
        ]),
      );
    });

    it('still shows newly overdue tickets to senior management with no action queue', async () => {
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.estimatedDeadline?.lt && where.estimatedDeadline?.gte === undefined
            ? [ticketRow({ ticketNumber: 31, estimatedDeadline: new Date() })]
            : [],
        ),
      );
      prisma.ticket.count.mockImplementation(({ where }: any) => {
        if (where.estimatedDeadline?.gte && where.estimatedDeadline?.lt) return Promise.resolve(1);
        if (where.estimatedDeadline?.lt && where.estimatedDeadline?.gte === undefined) return Promise.resolve(4);
        return Promise.resolve(0);
      });

      const digest = await service.buildDigest(SENIOR);

      expect(digest.actionGroups).toEqual([]);
      expect(digest.overdue).toHaveLength(1);
      expect(digest.overdue[0].ticketCode).toBe('BRM-0031');
      expect(digest.overdueTotal).toBe(4);
      expect(digest.isEmpty).toBe(false);
    });

    it('does not treat a long-overdue backlog as today’s activity', async () => {
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.estimatedDeadline?.lt && where.estimatedDeadline?.gte === undefined
            ? [ticketRow({ ticketNumber: 8, estimatedDeadline: new Date('2026-08-01') })]
            : [],
        ),
      );
      prisma.ticket.count.mockImplementation(({ where }: any) =>
        Promise.resolve(where.estimatedDeadline?.lt && where.estimatedDeadline?.gte === undefined ? 24 : 0),
      );

      const digest = await service.buildDigest(SENIOR);

      expect(digest.overdue).toHaveLength(1);
      expect(digest.overdueTotal).toBe(24);
      expect(digest.isEmpty).toBe(true);
    });

    it('lists the overdue backlog when the digest is already going out', async () => {
      prisma.ticketTask.findMany.mockResolvedValue([
        {
          id: 'task-1',
          title: 'مراجعة الاستعلام',
          status: TaskStatus.IN_PROGRESS,
          dueDate: null,
          ticket: ticketRow(),
        },
      ]);
      prisma.ticket.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.estimatedDeadline?.lt && where.estimatedDeadline?.gte === undefined
            ? [
                ticketRow({ id: 'overdue-1', ticketNumber: 8, estimatedDeadline: new Date('2026-08-01') }),
                ticketRow({ id: 'overdue-2', ticketNumber: 9, estimatedDeadline: new Date('2026-08-10') }),
                ticketRow({ id: 'overdue-3', ticketNumber: 10, estimatedDeadline: new Date('2026-08-12') }),
                ticketRow({ id: 'overdue-4', ticketNumber: 11, estimatedDeadline: new Date('2026-08-15') }),
              ]
            : [],
        ),
      );
      prisma.ticket.count.mockImplementation(({ where }: any) =>
        Promise.resolve(where.estimatedDeadline?.lt && where.estimatedDeadline?.gte === undefined ? 4 : 0),
      );

      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.openTasks).toHaveLength(1);
      expect(digest.overdue).toHaveLength(4);
      expect(digest.overdue.map((t) => t.ticketCode)).toEqual([
        'BRM-0008', 'BRM-0009', 'BRM-0010', 'BRM-0011',
      ]);
      expect(digest.overdueTotal).toBe(4);
      expect(digest.isEmpty).toBe(false);
    });

    it('marks a digest empty when there is nothing to report', async () => {
      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.isEmpty).toBe(true);
      expect(digest.windowHours).toBe(24);
    });

    it('never echoes back fields beyond the recipient identity', async () => {
      const digest = await service.buildDigest({
        ...DEVELOPER,
        password: 'hashed-secret',
      } as DigestRecipient);

      expect(Object.keys(digest.recipient).sort()).toEqual([
        'email', 'firstName', 'id', 'lastName', 'role',
      ]);
    });
  });

  describe('runDailyDigest', () => {
    it('emails only the users who have something to read', async () => {
      prisma.user.findMany.mockResolvedValue([DEVELOPER, HEAD]);
      prisma.ticketTask.findMany.mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.assignedToId === DEVELOPER.id
            ? [
                {
                  id: 'task-1',
                  title: 'مهمة',
                  status: TaskStatus.NEW,
                  dueDate: null,
                  ticket: ticketRow(),
                },
              ]
            : [],
        ),
      );

      const result = await service.runDailyDigest();

      expect(result).toEqual({ recipients: 2, sent: 1, skipped: 1 });
      expect(email.sendDailyDigest).toHaveBeenCalledTimes(1);
      expect(email.sendDailyDigest).toHaveBeenCalledWith(DEVELOPER.email, expect.anything());
    });

    it('keeps going when one recipient fails to build', async () => {
      prisma.user.findMany.mockResolvedValue([DEVELOPER, HEAD]);
      prisma.ticketTask.findMany.mockImplementation(({ where }: any) =>
        where.assignedToId === DEVELOPER.id
          ? Promise.reject(new Error('boom'))
          : Promise.resolve([
              {
                id: 'task-2',
                title: 'مهمة',
                status: TaskStatus.NEW,
                dueDate: null,
                ticket: ticketRow(),
              },
            ]),
      );

      const result = await service.runDailyDigest();

      expect(result.sent).toBe(1);
      expect(email.sendDailyDigest).toHaveBeenCalledWith(HEAD.email, expect.anything());
    });

    it('respects DAILY_DIGEST_LOOKBACK_HOURS', async () => {
      env.DAILY_DIGEST_LOOKBACK_HOURS = '48';

      const digest = await service.buildDigest(DEVELOPER);

      expect(digest.windowHours).toBe(48);
    });
  });
});
