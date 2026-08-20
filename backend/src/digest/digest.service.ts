import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import {
  CommentVisibility, NotificationType, Prisma, TaskStatus, TicketStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { can } from '../access/permissions';
import { EmailService } from '../email/email.service';
import {
  DEFAULT_DIGEST_TIMEZONE,
  DIGEST_DUE_SOON_DAYS,
  DIGEST_MAX_ITEMS,
  DigestActionGroup, DigestRecipient, DigestTicketRef, UserDigest,
  formatTicketCode,
} from './digest.types';
import { ACTION_BUCKETS } from '../tickets/action-queues';

export const DIGEST_JOB_NAME = 'daily-digest';

const DEFAULT_TIME = '09:00';
/** Sunday–Thursday. Friday (5) and Saturday (6) are the Saudi weekend. */
const DEFAULT_DAYS = '0-4';
const DEFAULT_LOOKBACK_HOURS = 24;
/** Upper bound on tickets pulled for one recipient's action groups. */
const MAX_ACTION_ROWS = 100;
/** Recipients processed concurrently. */
const BATCH_SIZE = 10;

const CLOSED_STATUSES: TicketStatus[] = [
  TicketStatus.COMPLETED,
  TicketStatus.CLOSED,
  TicketStatus.REJECTED,
];

const OPEN_TASK_STATUSES: TaskStatus[] = [TaskStatus.NEW, TaskStatus.IN_PROGRESS];

const TICKET_SELECT = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  priority: true,
  finalPriority: true,
  estimatedDeadline: true,
} satisfies Prisma.TicketSelect;

type TicketRow = Prisma.TicketGetPayload<{ select: typeof TICKET_SELECT }>;

@Injectable()
export class DigestService implements OnModuleInit {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private email: EmailService,
    private config: ConfigService,
    private scheduler: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (this.config.get<string>('DAILY_DIGEST_ENABLED') === 'false') {
      this.logger.log('Daily digest disabled (DAILY_DIGEST_ENABLED=false)');
      return;
    }

    const { cronTime, label, days } = this.resolveSchedule();
    const timeZone = this.resolveTimeZone();

    const job = CronJob.from({
      cronTime,
      timeZone,
      waitForCompletion: true,
      onTick: async () => {
        await this.runDailyDigest();
      },
    });

    this.scheduler.addCronJob(DIGEST_JOB_NAME, job);
    job.start();

    this.logger.log(
      `Daily digest scheduled at ${label} ${timeZone} on days ${days} (cron "${cronTime}")`,
    );
  }

  /** Builds and sends the digest for every active user that has something to read. */
  async runDailyDigest(): Promise<{ recipients: number; sent: number; skipped: number }> {
    const recipients = await this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: { createdAt: 'asc' },
    });

    let sent = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);
      const digests = await Promise.all(
        batch.map((recipient) =>
          this.buildDigest(recipient).catch((err) => {
            this.logger.error(`Failed to build digest for ${recipient.email}: ${err.message}`);
            return null;
          }),
        ),
      );

      const pending = digests.filter((d): d is UserDigest => d !== null && !d.isEmpty);
      await Promise.all(pending.map((d) => this.email.sendDailyDigest(d.recipient.email, d)));
      sent += pending.length;
    }

    const skipped = recipients.length - sent;
    this.logger.log(`Daily digest run: ${sent} sent, ${skipped} skipped (nothing to report)`);
    return { recipients: recipients.length, sent, skipped };
  }

  async buildDigest(recipient: DigestRecipient): Promise<UserDigest> {
    const windowHours = this.resolveLookbackHours();
    const now = new Date();
    const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
    const dueSoonBefore = new Date(now.getTime() + DIGEST_DUE_SOON_DAYS * 24 * 60 * 60 * 1000);
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
    const scope = await this.scopeFor(recipient);
    const openDeadline: Prisma.TicketWhereInput = {
      ...scope,
      status: { notIn: CLOSED_STATUSES },
    };

    const [mentionComments, unreadGroups, openTasks, overdueTotal, overdueRows, newlyOverdueCount, dueSoonTotal, dueSoonRows, queued] =
      await Promise.all([
        this.prisma.ticketComment.findMany({
          where: {
            createdAt: { gte: since },
            mentions: { has: recipient.id },
            authorId: { not: recipient.id },
            ticket: { isArchived: false },
            // Same rule as the ticket thread: INTERNAL never leaves the
            // programming team, and an email is the easiest place to leak it.
            ...(can(recipient.role, 'ticket:read-internal')
              ? {}
              : { visibility: CommentVisibility.PUBLIC }),
          },
          include: {
            author: { select: { firstName: true, lastName: true } },
            ticket: { select: TICKET_SELECT },
          },
          orderBy: { createdAt: 'desc' },
          take: DIGEST_MAX_ITEMS,
        }),
        this.prisma.notification.groupBy({
          by: ['ticketId'],
          where: {
            userId: recipient.id,
            isRead: false,
            type: NotificationType.COMMENT_ADDED,
            ticketId: { not: null },
            createdAt: { gte: since },
          },
          _count: { _all: true },
        }),
        this.prisma.ticketTask.findMany({
          where: {
            assignedToId: recipient.id,
            status: { in: OPEN_TASK_STATUSES },
            ticket: { isArchived: false },
            OR: [
              { createdAt: { gte: since } },
              { dueDate: { gte: since, lte: dueSoonBefore } },
            ],
          },
          include: { ticket: { select: TICKET_SELECT } },
          orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
          take: DIGEST_MAX_ITEMS,
        }),
        this.prisma.ticket.count({
          where: { ...openDeadline, estimatedDeadline: { lt: now } },
        }),
        this.prisma.ticket.findMany({
          where: { ...openDeadline, estimatedDeadline: { lt: now } },
          select: TICKET_SELECT,
          orderBy: { estimatedDeadline: 'asc' },
          take: DIGEST_MAX_ITEMS,
        }),
        this.prisma.ticket.count({
          where: { ...openDeadline, estimatedDeadline: { gte: since, lt: now } },
        }),
        this.prisma.ticket.count({
          where: { ...openDeadline, estimatedDeadline: { gte: now, lte: dueSoonBefore } },
        }),
        this.prisma.ticket.findMany({
          where: { ...openDeadline, estimatedDeadline: { gte: now, lte: dueSoonBefore } },
          select: TICKET_SELECT,
          orderBy: { estimatedDeadline: 'asc' },
          take: DIGEST_MAX_ITEMS,
        }),
        this.buildActionGroups(recipient, scope, frontendUrl, since),
      ]);

    const unreadByTicket = new Map(
      unreadGroups
        .filter((g) => g.ticketId !== null)
        .map((g) => [g.ticketId as string, g._count._all]),
    );
    const unreadTickets = unreadByTicket.size
      ? await this.prisma.ticket.findMany({
          where: { id: { in: [...unreadByTicket.keys()] }, isArchived: false },
          select: TICKET_SELECT,
        })
      : [];

    const unreadThreads = unreadTickets
      .map((ticket) => ({
        ticket: this.toRef(ticket, frontendUrl),
        count: unreadByTicket.get(ticket.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);

    const digest: UserDigest = {
      // Narrowed on purpose — callers pass the full User entity, which carries the password hash.
      recipient: {
        id: recipient.id,
        firstName: recipient.firstName,
        lastName: recipient.lastName,
        email: recipient.email,
        role: recipient.role,
      },
      windowHours,
      mentions: mentionComments.map((c) => ({
        ticket: this.toRef(c.ticket, frontendUrl),
        authorName: `${c.author.firstName} ${c.author.lastName}`,
        excerpt: this.excerpt(c.content),
        createdAt: c.createdAt,
      })),
      unreadThreads: unreadThreads.slice(0, DIGEST_MAX_ITEMS),
      unreadTotal: unreadThreads.reduce((sum, t) => sum + t.count, 0),
      actionGroups: queued.groups,
      actionTotal: queued.total,
      openTasks: openTasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        dueDate: task.dueDate,
        ticket: this.toRef(task.ticket, frontendUrl),
      })),
      overdue: overdueRows.map((t) => this.toRef(t, frontendUrl)),
      overdueTotal,
      dueSoon: dueSoonRows.map((t) => this.toRef(t, frontendUrl)),
      dueSoonTotal,
      isEmpty: true,
    };

    digest.isEmpty =
      digest.mentions.length === 0 &&
      digest.unreadThreads.length === 0 &&
      digest.actionGroups.length === 0 &&
      digest.openTasks.length === 0 &&
      newlyOverdueCount === 0 &&
      digest.dueSoon.length === 0;

    return digest;
  }

  private async buildActionGroups(
    recipient: DigestRecipient,
    scope: Prisma.TicketWhereInput,
    frontendUrl: string,
    since: Date,
  ): Promise<{ groups: DigestActionGroup[]; total: number }> {
    const buckets = ACTION_BUCKETS[recipient.role] ?? [];
    if (buckets.length === 0) return { groups: [], total: 0 };

    const statuses = [...new Set(buckets.flatMap((b) => b.statuses))];
    const queueWhere: Prisma.TicketWhereInput = { ...scope, status: { in: statuses } };
    const recentWhere: Prisma.TicketWhereInput = {
      ...queueWhere,
      OR: [
        { createdAt: { gte: since } },
        {
          statusHistory: {
            some: { toStatus: { in: statuses }, createdAt: { gte: since } },
          },
        },
      ],
    };

    const [rows, counts] = await Promise.all([
      this.prisma.ticket.findMany({
        where: recentWhere,
        select: TICKET_SELECT,
        orderBy: [{ finalPriority: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
        take: MAX_ACTION_ROWS,
      }),
      this.prisma.ticket.groupBy({ by: ['status'], where: queueWhere, _count: { _all: true } }),
    ]);

    const countByStatus = new Map(counts.map((c) => [c.status, c._count._all]));
    const groups = buckets
      .map((bucket) => ({
        label: bucket.label,
        tickets: rows
          .filter((t) => bucket.statuses.includes(t.status))
          .slice(0, DIGEST_MAX_ITEMS)
          .map((t) => this.toRef(t, frontendUrl)),
        total: bucket.statuses.reduce((sum, s) => sum + (countByStatus.get(s) ?? 0), 0),
      }))
      .filter((group) => group.tickets.length > 0);
    const total = buckets.reduce(
      (sum, bucket) =>
        sum + bucket.statuses.reduce((inner, s) => inner + (countByStatus.get(s) ?? 0), 0),
      0,
    );

    return { groups, total };
  }

  /**
   * Tickets this recipient is accountable for. Delegates to `AccessService` so
   * a digest can never surface a ticket the app itself would hide — the email
   * leaves the building, so a mismatch here is the expensive kind.
   */
  private async scopeFor(recipient: DigestRecipient): Promise<Prisma.TicketWhereInput> {
    const base: Prisma.TicketWhereInput = { isArchived: false };
    const scope = await this.access.ticketScope(recipient);
    return scope ? { AND: [base, scope] } : base;
  }

  private toRef(ticket: TicketRow, frontendUrl: string): DigestTicketRef {
    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      ticketCode: formatTicketCode(ticket.ticketNumber),
      title: ticket.title,
      status: ticket.status,
      priority: ticket.finalPriority ?? ticket.priority,
      estimatedDeadline: ticket.estimatedDeadline,
      url: `${frontendUrl}/tickets/${ticket.id}`,
    };
  }

  private excerpt(content: string, max = 140): string {
    const flat = content.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  /**
   * `DAILY_DIGEST_TIME` is `HH:mm` in `DAILY_DIGEST_TIMEZONE` (default 09:00), on the
   * cron day-of-week set in `DAILY_DIGEST_DAYS` (default `0-4` — Sunday to Thursday,
   * so nothing goes out on the Friday/Saturday weekend).
   */
  private resolveSchedule(): { cronTime: string; label: string; days: string } {
    const rawTime = (this.config.get<string>('DAILY_DIGEST_TIME') || '').trim();
    const match = /^([01]\d|2[0-3]|\d):([0-5]\d)$/.exec(rawTime);

    if (rawTime && !match) {
      this.logger.warn(`Invalid DAILY_DIGEST_TIME "${rawTime}", falling back to ${DEFAULT_TIME}`);
    }

    const [hour, minute] = (match ? rawTime : DEFAULT_TIME).split(':').map(Number);
    const label = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

    const rawDays = (this.config.get<string>('DAILY_DIGEST_DAYS') || '').trim() || DEFAULT_DAYS;
    const candidate = `${minute} ${hour} * * ${rawDays}`;

    if (!CronTime.validateCronExpression(candidate).valid) {
      this.logger.warn(`Invalid DAILY_DIGEST_DAYS "${rawDays}", falling back to ${DEFAULT_DAYS}`);
      return { cronTime: `${minute} ${hour} * * ${DEFAULT_DAYS}`, label, days: DEFAULT_DAYS };
    }

    return { cronTime: candidate, label, days: rawDays };
  }

  private resolveTimeZone(): string {
    const raw = (this.config.get<string>('DAILY_DIGEST_TIMEZONE') || '').trim();
    if (!raw) return DEFAULT_DIGEST_TIMEZONE;

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: raw });
      return raw;
    } catch {
      this.logger.warn(
        `Invalid DAILY_DIGEST_TIMEZONE "${raw}", falling back to ${DEFAULT_DIGEST_TIMEZONE}`,
      );
      return DEFAULT_DIGEST_TIMEZONE;
    }
  }

  private resolveLookbackHours(): number {
    const raw = Number(this.config.get<string>('DAILY_DIGEST_LOOKBACK_HOURS'));
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LOOKBACK_HOURS;
  }
}
