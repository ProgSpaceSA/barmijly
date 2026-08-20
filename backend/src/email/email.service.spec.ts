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
    expect(html).toContain('unicode-bidi: isolate');
    expect(html).toContain('user-select: all');
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
    expect(html).toContain(
      '<a href="https://barmijly.test/tickets/ticket-1" style="color: #1e293b; font-size: 14px; font-weight: bold; text-decoration: none; display: block;">مراجعة استعلامات مشروع 1</a>',
    );
    expect(html).not.toMatch(/<a href="https:\/\/barmijly\.test\/tickets\/ticket-1"[^>]*background: white/);
    expect(html).toContain('border-right: 3px solid #0EA5E9');
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

    expect(html).toContain('border-right: 3px solid #4338CA');
    expect(html).toContain('border-right: 3px solid #8B5CF6');
    expect(html).toContain('border-right: 3px solid #6366F1');
    expect(html).toContain('border-right: 3px solid #0EA5E9');
    expect(html).toContain('border-right: 3px solid #DC2626');
    expect(html).toContain('border-right: 3px solid #F59E0B');
    expect(html).toContain('color: #DC2626; font-size: 22px');
    expect(html).toContain('color: #8B5CF6; font-size: 22px');
    expect(html).toContain('color: #0EA5E9; font-size: 22px');
    expect(html).toContain('color: #4338CA; font-size: 22px');
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

  describe('status update', () => {
    it('uses the Arabic status label instead of the English enum', async () => {
      await service.sendStatusUpdate(
        'creator@company.com',
        '[SEED] تحسين سرعة شاشة قائمة الأصناف',
        TicketStatus.SCHEDULED,
        'https://barmijly.test/tickets/ticket-1',
      );

      expect(sendMail).toHaveBeenCalledTimes(1);
      const html = sendMail.mock.calls[0][0].html as string;
      expect(html).toContain('مجدولة');
      expect(html).not.toContain('SCHEDULED');
      expect(html).toContain('[SEED] تحسين سرعة شاشة قائمة الأصناف');
    });
  });
});
