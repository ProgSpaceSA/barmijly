process.env.MAIL_ALLOW_IN_TESTS = 'true';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Priority, TaskStatus, TicketStatus, UserRole } from '@prisma/client';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import { DigestTicketRef, UserDigest, formatTicketCode } from '../digest/digest.types';

jest.mock('nodemailer');

const ticketRef = (over: Partial<DigestTicketRef> = {}): DigestTicketRef => ({
  id: 'ticket-1',
  ticketNumber: 31,
  ticketCode: formatTicketCode(31),
  title: 'تعديل شاشة الفواتير',
  status: TicketStatus.IN_PROGRESS,
  priority: Priority.HIGH,
  estimatedDeadline: null,
  url: 'https://barmijly.test/tickets/ticket-1',
  companyName: 'شركة سنم',
  systemName: 'نظام الفواتير',
  ...over,
});

const digestFor = (over: Partial<UserDigest> = {}): UserDigest => ({
  recipient: {
    id: 'head-1',
    firstName: 'هاني',
    lastName: 'المطيري',
    email: 'head@company.com',
    role: UserRole.PROGRAMMING_HEAD,
  },
  windowHours: 24,
  mentions: [],
  unreadThreads: [],
  unreadTotal: 0,
  actionGroups: [],
  actionTotal: 0,
  openTasks: [],
  overdue: [],
  overdueTotal: 0,
  dueSoon: [],
  dueSoonTotal: 0,
  isEmpty: false,
  ...over,
});

describe('EmailService', () => {
  let service: EmailService;
  let sendMail: jest.Mock;

  beforeEach(async () => {
    sendMail = jest.fn().mockResolvedValue({});
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                MAIL_HOST: 'localhost',
                MAIL_PORT: 587,
                MAIL_FROM: 'noreply@barmijly.ai',
                DAILY_DIGEST_TIMEZONE: 'Asia/Riyadh',
                FRONTEND_URL: 'https://barmijly.test',
              })[key],
          },
        },
      ],
    }).compile();

    service = module.get(EmailService);
  });

  describe('daily digest', () => {

  async function htmlOf(digest: UserDigest) {
    await service.sendDailyDigest(digest.recipient.email, digest);
    expect(sendMail).toHaveBeenCalledTimes(1);
    return sendMail.mock.calls[0][0].html as string;
  }

  it('prints ticket ids as BRM-0031 like the app, not a raw number', async () => {
    const ticket = ticketRef();
    const html = await htmlOf(
      digestFor({
        actionGroups: [{ label: 'بانتظار اعتمادك', tickets: [ticket], total: 1 }],
        mentions: [{
          ticket,
          authorName: 'داود الشمري',
          excerpt: 'راجع هذا',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        }],
        unreadThreads: [{ ticket, count: 2 }],
        unreadTotal: 2,
        openTasks: [{
          id: 'task-1',
          title: 'مراجعة الاستعلام',
          status: TaskStatus.IN_PROGRESS,
          dueDate: null,
          ticket,
        }],
        overdue: [ticket],
        dueSoon: [ticket],
      }),
    );

    expect(html).toContain('BRM-0031');
    expect(html).toContain('شركة سنم');
    expect(html).toContain('نظام الفواتير');
    expect(html).not.toContain('#31 —');
    expect(html).not.toContain('التذكرة #31');
    expect(html.match(/BRM-0031/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps the BRM code in its own LTR chip so RTL does not swap it with [SEED]', async () => {
    const html = await htmlOf(
      digestFor({
        actionGroups: [{
          label: 'بانتظار اعتمادك',
          tickets: [ticketRef({ title: '[SEED] خطأ في احتساب الخصم عند الدفع النقدي' })],
          total: 1,
        }],
      }),
    );

    expect(html).toContain('dir="ltr"');
    expect(html).toContain('unicode-bidi:isolate');
    expect(html).toContain('user-select:all');
    expect(html).not.toContain('BRM-0031 — ');
    expect(html).toContain('[SEED] خطأ في احتساب الخصم عند الدفع النقدي');
  });

  it('puts the ticket title on its own line under the BRM chip', async () => {
    const html = await htmlOf(
      digestFor({
        actionGroups: [{
          label: 'معتمدة بانتظار الإسناد',
          tickets: [ticketRef()],
          total: 1,
        }],
      }),
    );

    expect(html).toContain('BRM-0031');
    expect(html).toContain('تعديل شاشة الفواتير');
    expect(html).toContain('https://barmijly.test/tickets/ticket-1');
    expect(html).not.toContain('BRM-0031 — تعديل شاشة الفواتير');
  });

  it('pads single-digit ticket numbers to four digits', async () => {
    const html = await htmlOf(
      digestFor({
        overdue: [ticketRef({ ticketNumber: 7, ticketCode: formatTicketCode(7) })],
      }),
    );

    expect(html).toContain('BRM-0007');
    expect(html).not.toContain('BRM-7 —');
  });

  it('prints ticket status in Arabic, not the English enum', async () => {
    const html = await htmlOf(
      digestFor({
        overdue: [ticketRef({ status: TicketStatus.SCHEDULED })],
      }),
    );

    expect(html).toContain('مجدولة');
    expect(html).not.toContain('SCHEDULED');
  });

  it('shows the full overdue total and tells the reader to open the dashboard', async () => {
    const html = await htmlOf(
      digestFor({
        overdue: [ticketRef()],
        overdueTotal: 24,
        actionTotal: 2,
      }),
    );

    expect(html).toContain('24');
    expect(html).toContain('متأخرة');
    expect(html).toContain('2');
    expect(html).toContain('بانتظار إجراءك');
    expect(html).toContain('لا تظهر كل التذاكر في هذا البريد');
    expect(html).toContain('افتح لوحة التحكم لعرض الكل');
    expect(html).toContain('https://barmijly.test/dashboard');
    expect(html).toContain('أحدث النشاط خلال 24 ساعة');
    expect(html).toContain('لديك 24 تذكرة متأخرة');
    expect(html).toContain('تعديل شاشة الفواتير');
    expect(html).not.toContain('تجاوزت الموعد اليوم');
  });

  it('lists overdue tickets under the delayed count even when none slipped today', async () => {
    const html = await htmlOf(
      digestFor({
        overdue: [
          ticketRef({ id: 't-8', ticketNumber: 8, ticketCode: formatTicketCode(8), url: 'https://barmijly.test/tickets/t-8' }),
          ticketRef({ id: 't-9', ticketNumber: 9, ticketCode: formatTicketCode(9), url: 'https://barmijly.test/tickets/t-9' }),
        ],
        overdueTotal: 4,
        openTasks: [{
          id: 'task-1',
          title: 'مراجعة الاستعلام',
          status: TaskStatus.IN_PROGRESS,
          dueDate: null,
          ticket: ticketRef(),
        }],
      }),
    );

    expect(html).toContain('4');
    expect(html).toContain('متأخرة');
    expect(html).toContain('BRM-0008');
    expect(html).toContain('BRM-0009');
    expect(html).toContain('https://barmijly.test/tickets/t-8');
  });

  it('makes each open task a title link to its ticket, not a clickable card', async () => {
    const html = await htmlOf(
      digestFor({
        openTasks: [{
          id: 'task-1',
          title: 'مراجعة استعلامات مشروع 1',
          status: TaskStatus.IN_PROGRESS,
          dueDate: new Date('2026-08-21T00:00:00Z'),
          ticket: ticketRef(),
        }],
      }),
    );

    expect(html).toContain('مهامك المفتوحة');
    expect(html).toContain('href="https://barmijly.test/tickets/ticket-1"');
    expect(html).toContain('مراجعة استعلامات مشروع 1');
    expect(html).not.toMatch(/<a href="https:\/\/barmijly\.test\/tickets\/ticket-1"[^>]*background:#FFFFFF/);
    expect(html).toContain('border-right:3px solid #0284C7');
  });

  it('colors metric numbers and card accents by section', async () => {
    const ticket = ticketRef();
    const html = await htmlOf(
      digestFor({
        actionGroups: [{ label: 'بانتظار اعتمادك', tickets: [ticket], total: 2 }],
        actionTotal: 2,
        mentions: [{
          ticket,
          authorName: 'داود الشمري',
          excerpt: 'راجع هذا',
          createdAt: new Date('2026-08-18T10:00:00Z'),
        }],
        unreadThreads: [{ ticket, count: 2 }],
        unreadTotal: 2,
        openTasks: [{
          id: 'task-1',
          title: 'مراجعة الاستعلام',
          status: TaskStatus.IN_PROGRESS,
          dueDate: null,
          ticket,
        }],
        overdue: [ticket],
        overdueTotal: 4,
        dueSoon: [ticket],
        dueSoonTotal: 1,
      }),
    );

    expect(html).toContain('border-right:3px solid #4338CA');
    expect(html).toContain('border-right:3px solid #7C3AED');
    expect(html).toContain('border-right:3px solid #6366F1');
    expect(html).toContain('border-right:3px solid #0284C7');
    expect(html).toContain('border-right:3px solid #DC2626');
    expect(html).toContain('border-right:3px solid #D97706');
    expect(html).toContain('color:#DC2626;font-size:22px');
    expect(html).toContain('color:#7C3AED;font-size:22px');
    expect(html).toContain('color:#0284C7;font-size:22px');
    expect(html).toContain('color:#4338CA;font-size:22px');
  });

    it('adds the manager compliment for the live mailboxes', async () => {
      for (const email of ['a.aldughairi@sanam-holding.com', 'aldughairi@gmail.com']) {
        sendMail.mockClear();
        const html = await htmlOf(digestFor({
          recipient: {
            id: 'quoted-1',
            firstName: 'أحمد',
            lastName: 'الدغيري',
            email,
            role: UserRole.DEVELOPER,
          },
        }));
        expect(html).toContain('لأنك مختلف، أنت تقود.');
        expect(html).toContain('Because you are different, you lead.');
        expect(html).not.toContain('تقدير خاص');
        expect(html).toContain('#C9A227');
        expect(html).toContain('Georgia');
      }
    });

    it('keeps the compliment off everyone else', async () => {
      const html = await htmlOf(digestFor());
      expect(html).not.toContain('لأنك مختلف، أنت تقود.');
      expect(html).not.toContain('Because you are different, you lead.');
    });

    it('does not show the compliment on the 1999 or dc1 mailboxes', async () => {
      for (const email of ['anas.hagras1999@gmail.com', 'anas.hagras1999+dc1@gmail.com']) {
        sendMail.mockClear();
        const html = await htmlOf(digestFor({
          recipient: {
            id: 'preview-1',
            firstName: 'أنس',
            lastName: 'هجرس',
            email,
            role: UserRole.DEVELOPER,
          },
        }));
        expect(html).not.toContain('Because you are different, you lead.');
      }
    });
  });

  it('does not call SMTP under Jest unless MAIL_ALLOW_IN_TESTS is set', async () => {
    const previous = process.env.MAIL_ALLOW_IN_TESTS;
    delete process.env.MAIL_ALLOW_IN_TESTS;
    sendMail.mockClear();
    try {
      const isolated = new EmailService({ get: () => undefined } as unknown as ConfigService);
      await isolated.sendStatusUpdate('a@b.c', 't', 'NEW', 'http://x');
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      process.env.MAIL_ALLOW_IN_TESTS = previous;
    }
  });

  it('treats MAIL_ENABLED=False as disabled (case-insensitive)', async () => {
    const previousAllow = process.env.MAIL_ALLOW_IN_TESTS;
    const previousEnabled = process.env.MAIL_ENABLED;
    const previousNode = process.env.NODE_ENV;
    const previousWorker = process.env.JEST_WORKER_ID;
    delete process.env.MAIL_ALLOW_IN_TESTS;
    delete process.env.JEST_WORKER_ID;
    process.env.MAIL_ENABLED = 'False';
    process.env.NODE_ENV = 'production';
    sendMail.mockClear();
    try {
      const isolated = new EmailService({ get: () => undefined } as unknown as ConfigService);
      await isolated.sendStatusUpdate('a@b.c', 't', 'NEW', 'http://x');
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      process.env.MAIL_ALLOW_IN_TESTS = previousAllow;
      process.env.MAIL_ENABLED = previousEnabled;
      process.env.NODE_ENV = previousNode;
      process.env.JEST_WORKER_ID = previousWorker;
    }
  });

  it('stays silent in development unless MAIL_ENABLED is explicitly true', async () => {
    const previousAllow = process.env.MAIL_ALLOW_IN_TESTS;
    const previousEnabled = process.env.MAIL_ENABLED;
    const previousNode = process.env.NODE_ENV;
    const previousWorker = process.env.JEST_WORKER_ID;
    delete process.env.MAIL_ALLOW_IN_TESTS;
    delete process.env.JEST_WORKER_ID;
    delete process.env.MAIL_ENABLED;
    process.env.NODE_ENV = 'development';
    sendMail.mockClear();
    try {
      const isolated = new EmailService({ get: () => undefined } as unknown as ConfigService);
      await isolated.sendStatusUpdate('a@b.c', 't', 'NEW', 'http://x');
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      process.env.MAIL_ALLOW_IN_TESTS = previousAllow;
      if (previousEnabled === undefined) delete process.env.MAIL_ENABLED;
      else process.env.MAIL_ENABLED = previousEnabled;
      process.env.NODE_ENV = previousNode;
      process.env.JEST_WORKER_ID = previousWorker;
    }
  });

  describe('shared chrome', () => {
    async function htmlFrom(send: () => Promise<void>) {
      sendMail.mockClear();
      await send();
      expect(sendMail).toHaveBeenCalledTimes(1);
      return sendMail.mock.calls[0][0].html as string;
    }

    it('wraps every mail in the same RTL frame with Cairo and a wordmark', async () => {
      const mails = [
        () => service.sendInvitation('a@b.c', 'tok', UserRole.DEVELOPER, 'https://barmijly.test'),
        () => service.sendPasswordReset('a@b.c', 'هاني', 'tok', 'https://barmijly.test'),
        () => service.sendMentionEmail('a@b.c', 'داود', 'تذكرة', 'https://barmijly.test/tickets/1', 31),
        () => service.sendTicketAssigned('a@b.c', 'هاني', 'تذكرة', 'https://barmijly.test/tickets/1', 'سارة', 31),
        () => service.sendTaskAssigned('a@b.c', 'هاني', 'مهمة', 'تذكرة', 'https://barmijly.test/tickets/1', 'سارة', 31),
        () => service.sendStatusUpdate('a@b.c', 'تذكرة', TicketStatus.APPROVED, 'https://barmijly.test/tickets/1', 31),
      ];

      for (const send of mails) {
        const html = await htmlFrom(send);
        expect(html).toContain('برمجلي');
        expect(html).toContain('نظام إدارة طلبات البرمجة');
        expect(html).toContain("'Cairo'");
        expect(html).toContain('dir="rtl"');
        expect(html).toContain('max-width:560px');
        expect(html).toContain('display:none');
        expect(html).not.toContain('نظام إدارة طلبات البرمجة</div>');
      }
    });
  });

  describe('invitation', () => {
    it('shows any Arabic role as a صلاحيتك pill, not a developer-only card', async () => {
      await service.sendInvitation(
        'new@company.com',
        'invite-token',
        UserRole.PROGRAMMING_HEAD,
        'https://barmijly.test',
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('رئيس قسم البرمجة');
      expect(html).toContain('صلاحيتك');
      expect(html).not.toContain('الدور');
      expect(html).not.toContain('DEVELOPER');
      expect(html).not.toContain('PROGRAMMING_HEAD');
      expect(html).not.toContain('لقد تمت دعوتك للانضمام إلى نظام إدارة طلبات البرمجة');
      expect(html).toContain('48 ساعة');
      expect(html).toContain('قبول الدعوة');
      expect(html).toContain('https://barmijly.test/accept-invitation?token=invite-token');
    });

    it.each([
      [UserRole.DEVELOPER, 'مطور'],
      [UserRole.QA, 'مختبر الجودة'],
      [UserRole.TICKET_REQUESTER, 'طالب التذكرة'],
      [UserRole.SYSTEM_OWNER, 'مالك النظام'],
    ] as const)('renders %s as %s', async (role, label) => {
      sendMail.mockClear();
      await service.sendInvitation('a@b.c', 'tok', role, 'https://barmijly.test');
      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain(label);
      expect(html).not.toContain(role);
    });
  });

  describe('password reset', () => {
    it('warns that the link expires in 30 minutes without a second warning card', async () => {
      await service.sendPasswordReset('user@company.com', 'هاني', 'reset-token', 'https://barmijly.test');

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('هاني');
      expect(html).toContain('30 دقيقة');
      expect(html).toContain('إعادة تعيين كلمة المرور');
      expect(html).toContain('https://barmijly.test/reset-password?token=reset-token');
      expect(html).not.toContain('border-right:3px solid #DC2626');
    });
  });

  describe('mention', () => {
    it('names the author once and panels the ticket with a BRM chip', async () => {
      await service.sendMentionEmail(
        'dev@company.com',
        'داود الشمري',
        'تعديل شاشة الفواتير',
        'https://barmijly.test/tickets/ticket-1',
        31,
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('BRM-0031');
      expect(html).toContain('dir="ltr"');
      expect(html).toContain('unicode-bidi:isolate');
      expect(html).toContain('تعديل شاشة الفواتير');
      expect(html).toContain('داود الشمري');
      expect(html).toContain('أشار إليك أحدهم');
      expect(html).not.toContain('تم ذكرك في تعليق');
      expect(html).toContain('فتح التذكرة');
    });
  });

  describe('ticket assigned', () => {
    it('says who assigned it once and shows the ticket code', async () => {
      await service.sendTicketAssigned(
        'dev@company.com',
        'هاني',
        'تعديل شاشة الفواتير',
        'https://barmijly.test/tickets/ticket-1',
        'سارة المطيري',
        7,
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('BRM-0007');
      expect(html).toContain('هاني');
      expect(html).toContain('سارة المطيري');
      expect(html).toContain('أسند إليك');
    });
  });

  describe('task assigned', () => {
    it('lists the task above its ticket code', async () => {
      await service.sendTaskAssigned(
        'dev@company.com',
        'هاني',
        'مراجعة الاستعلام',
        'تعديل شاشة الفواتير',
        'https://barmijly.test/tickets/ticket-1',
        'سارة المطيري',
        31,
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('BRM-0031');
      expect(html).toContain('مراجعة الاستعلام');
      expect(html).toContain('تعديل شاشة الفواتير');
      expect(html).toContain('فتح التذكرة');
      expect(html).toContain('#0284C7');
    });
  });

  describe('status update', () => {
    it('uses the Arabic status label instead of the English enum', async () => {
      await service.sendStatusUpdate(
        'creator@company.com',
        '[SEED] تحسين سرعة شاشة قائمة الأصناف',
        TicketStatus.SCHEDULED,
        'https://barmijly.test/tickets/ticket-1',
        undefined,
        TicketStatus.APPROVED,
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('مجدولة');
      expect(html).toContain('معتمدة');
      expect(html).not.toContain('SCHEDULED');
      expect(html).not.toContain('APPROVED');
      expect(html).toContain('[SEED] تحسين سرعة شاشة قائمة الأصناف');
    });

    it('describes the change from the previous status to the new one', async () => {
      await service.sendStatusUpdate(
        'creator@company.com',
        'تحسين سرعة الشاشة',
        TicketStatus.AWAITING_TESTING,
        'https://barmijly.test/tickets/ticket-1',
        120,
        TicketStatus.IN_PROGRESS,
        { companyName: 'شركة سنم', systemName: 'نظام المخزون' },
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('BRM-0120');
      expect(html).toContain('تم تغيير الحالة من «قيد التنفيذ» إلى «بانتظار اختبار».');
      expect(html).toContain('قيد التنفيذ');
      expect(html).toContain('بانتظار اختبار');
      expect(html).toContain('الشركة');
      expect(html).toContain('شركة سنم');
      expect(html).toContain('النظام');
      expect(html).toContain('نظام المخزون');
      expect(html).not.toContain('تحديث الحالة');
      expect(html).not.toContain('تحديث حالة التذكرة');
      expect(html).not.toContain('تم تحديث حالة التذكرة التالية');
      expect(html).toContain('فتح التذكرة');
      expect(sendMail.mock.calls[0][0].subject).toBe('بانتظار اختبار: تحسين سرعة الشاشة');
    });

    it('falls back when the previous status is unknown', async () => {
      await service.sendStatusUpdate(
        'creator@company.com',
        'تحسين سرعة الشاشة',
        TicketStatus.REJECTED,
        'https://barmijly.test/tickets/ticket-1',
        18,
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('أصبحت الحالة «مرفوضة».');
      expect(html).toContain('مرفوضة');
      expect(sendMail.mock.calls[0][0].subject).toBe('مرفوضة: تحسين سرعة الشاشة');
    });

    it('escapes a ticket title that contains HTML', async () => {
      await service.sendStatusUpdate(
        'creator@company.com',
        '<script>alert(1)</script>',
        TicketStatus.NEW,
        'https://barmijly.test/tickets/ticket-1',
      );

      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).not.toContain('<script>alert(1)</script>');
    });
  });

  describe('mail scope', () => {
    it('shows company and system on invitation and assignment mail', async () => {
      const scope = { companyName: 'شركة سنم', systemName: 'نظام الفواتير' };

      await service.sendInvitation('a@b.c', 'tok', UserRole.DEVELOPER, 'https://barmijly.test', scope);
      expect(sendMail.mock.calls[0][0].html).toContain('شركة سنم');
      expect(sendMail.mock.calls[0][0].html).toContain('نظام الفواتير');

      sendMail.mockClear();
      await service.sendTicketAssigned(
        'a@b.c', 'هاني', 'تذكرة', 'https://barmijly.test/tickets/1', 'سارة', 7, scope,
      );
      expect(sendMail.mock.calls[0][0].html).toContain('الشركة');
      expect(sendMail.mock.calls[0][0].html).toContain('نظام الفواتير');
    });
  });
});
