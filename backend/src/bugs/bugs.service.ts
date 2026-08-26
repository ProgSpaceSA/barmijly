import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BugStatus, NotificationType, Prisma, TicketDependencyType, UserRole } from '@prisma/client';
import { EmailService } from '../email/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TestingAccessService, TestingActor } from '../testing/testing.access';
import { OPEN_BUG_STATUSES } from '../testing/test-rollup.service';
import { parseBugNumberQuery } from '../testing/test-code';
import { buildBugFixTicket } from './bug-promote';
import {
  ChangeBugStatusDto,
  CreateBugDto,
  FilterBugsDto,
  PromoteBugDto,
  UpdateBugDto,
} from './dto/bug.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

const BUG_INCLUDE = {
  reportedBy: PERSON,
  assignedTo: PERSON,
  system: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, logoUrl: true } },
  suite: { select: { id: true, title: true, suiteNumber: true } },
  testCase: { select: { id: true, title: true, caseNumber: true } },
  ticket: { select: { id: true, title: true, ticketNumber: true, status: true } },
} as const satisfies Prisma.BugInclude;

const BUG_DETAIL_INCLUDE = {
  ...BUG_INCLUDE,
  steps: { orderBy: { order: 'asc' }, include: { attachments: true } },
  attachments: true,
  statusHistory: { orderBy: { createdAt: 'asc' }, include: { changedBy: PERSON } },
} as const satisfies Prisma.BugInclude;

/** Terminal statuses stamp `resolvedAt`; anything else clears it. */
const RESOLVED_STATUSES: BugStatus[] = [
  BugStatus.VERIFIED,
  BugStatus.CLOSED,
  BugStatus.WONT_FIX,
  BugStatus.DUPLICATE,
];

/**
 * Bugs are their own entity, not tickets.
 *
 * QA has to be able to file one in seconds while running a case, and the ticket
 * workflow — approval, scheduling, a lead developer — is the wrong weight for
 * that. A bug that turns out to need scheduled work is *promoted*: `promote()`
 * creates a linked `BUG_FIX` ticket at DRAFT and the normal approval flow takes
 * over from there. Nothing here bypasses it.
 */
@Injectable()
export class BugsService {
  constructor(
    private prisma: PrismaService,
    private testing: TestingAccessService,
    private access: AccessService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  // -------------------------------------------------------------------- read

  async findAll(user: TestingActor, filters: FilterBugsDto) {
    const page = parseInt(filters.page || '1');
    const limit = parseInt(filters.limit || '20');
    const skip = (page - 1) * limit;

    const where: Prisma.BugWhereInput = {
      isArchived: filters.isArchived ?? false,
      ...(filters.severity && { severity: filters.severity }),
      ...(filters.open
        ? { status: { in: OPEN_BUG_STATUSES } }
        : filters.status && { status: filters.status }),
      ...(filters.assignedToId && { assignedToId: filters.assignedToId }),
      ...(filters.systemId && { systemId: filters.systemId }),
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.suiteId && { suiteId: filters.suiteId }),
      ...(filters.hasTicket !== undefined && {
        ticketId: filters.hasTicket ? { not: null } : null,
      }),
      // Uses the authenticated user, never a caller-supplied id, so «أخطائي»
      // cannot be pointed at somebody else.
      ...(filters.mine && {
        OR: [{ assignedToId: user.id }, { reportedById: user.id }],
      }),
      ...(filters.search && this.searchWhere(filters.search)),
      ...this.detectedWhere(filters.from, filters.to),
    };

    const scope = await this.testing.bugScope(user);
    const scoped: Prisma.BugWhereInput = Object.keys(scope).length
      ? { AND: [where, scope] }
      : where;

    const [data, total, openCount] = await Promise.all([
      this.prisma.bug.findMany({
        where: scoped,
        include: BUG_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.bug.count({ where: scoped }),
      this.prisma.bug.count({
        where: { AND: [{ isArchived: false, status: { in: OPEN_BUG_STATUSES } }, scope] },
      }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit), openCount };
  }

  /** Open-bug badge for the sidebar. Same scope as the list it links to. */
  async openCount(user: TestingActor) {
    const scope = await this.testing.bugScope(user);
    const count = await this.prisma.bug.count({
      where: { AND: [{ isArchived: false, status: { in: OPEN_BUG_STATUSES } }, scope] },
    });
    return { count };
  }

  async findOne(id: string, user: TestingActor) {
    return this.testing.loadVisibleBug(id, user, { include: BUG_DETAIL_INCLUDE });
  }

  // ------------------------------------------------------------------- write

  /**
   * Files a bug, from a case or standalone.
   *
   * A bug filed from a case inherits its scope, and the reporter is checked
   * against the case's execute gate — reporting what you just ran. A standalone
   * bug names its own system, so it is checked against that instead.
   *
   * An optional `ticketId` links the bug to an existing ticket without promoting
   * (e.g. filing from the ticket page). Promote still creates a new BUG_FIX ticket.
   */
  async create(dto: CreateBugDto, user: TestingActor) {
    let systemId = dto.systemId;
    let companyId = dto.companyId;
    let suiteId: string | undefined;

    if (dto.testCaseId) {
      const testCase = await this.testing.loadVisibleCase(dto.testCaseId, user);
      await this.testing.assertCanExecute(
        { suiteId: testCase.suiteId, ticketId: testCase.ticketId },
        user,
      );
      systemId = testCase.suite.systemId;
      companyId = testCase.suite.companyId;
      suiteId = testCase.suiteId;
    } else {
      if (!systemId || !companyId) {
        throw new BadRequestException('حدّد النظام والشركة، أو اربط الخطأ بحالة اختبار');
      }
      await this.testing.assertCanFileBug(systemId, companyId, user);
    }

    let ticketId: string | undefined;
    if (dto.ticketId) {
      const ticket = await this.access.loadVisibleTicket(dto.ticketId, user, {
        select: { id: true, systemId: true, companyId: true },
      });
      if (ticket.systemId !== systemId || ticket.companyId !== companyId) {
        throw new BadRequestException('التذكرة ليست في نفس نظام وشركة الخطأ');
      }
      ticketId = ticket.id;
    }

    if (dto.assignedToId) await this.assertCanAssign(dto.assignedToId, user);

    const bug = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bug.create({
        data: {
          title: dto.title,
          description: dto.description,
          testCaseId: dto.testCaseId,
          ticketId,
          suiteId,
          systemId: systemId!,
          companyId: companyId!,
          reportedById: user.id,
          assignedToId: dto.assignedToId,
          expectedBehavior: dto.expectedBehavior,
          actualBehavior: dto.actualBehavior,
          environment: dto.environment,
          severity: dto.severity,
          priority: dto.priority,
        },
        include: BUG_DETAIL_INCLUDE,
      });
      // Opening row, so the history reads as a full story rather than starting
      // at the first change somebody happened to make.
      await tx.bugStatusHistory.create({
        data: {
          bugId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedById: user.id,
        },
      });
      return created;
    });

    await this.audit.log({
      action: 'BUG_CREATE',
      entity: 'Bug',
      entityId: bug.id,
      userId: user.id,
      ticketId: bug.ticketId ?? undefined,
      newValues: {
        title: bug.title,
        description:
          typeof bug.description === "string" && bug.description.length > 120
            ? `${bug.description.slice(0, 120)}…`
            : bug.description,
        severity: bug.severity,
        status: bug.status,
        bugNumber: bug.bugNumber,
        systemId: bug.systemId,
        testCaseId: bug.testCaseId,
        ticketId: bug.ticketId,
      },
    });

    if (ticketId) {
      await this.notifyTicketDevelopers(ticketId, bug, user, dto.assignedToId ? [dto.assignedToId] : []);
    } else {
      await this.notifySystemDevelopers(bug, user, dto.assignedToId ? [dto.assignedToId] : []);
    }

    return bug;
  }

  async update(id: string, dto: UpdateBugDto, user: TestingActor) {
    const bug = await this.testing.loadVisibleBug(id, user);
    this.assertCanEdit(bug, user);

    const data: Prisma.BugUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.expectedBehavior !== undefined) data.expectedBehavior = dto.expectedBehavior;
    if (dto.actualBehavior !== undefined) data.actualBehavior = dto.actualBehavior;
    if (dto.environment !== undefined) data.environment = dto.environment;
    if (dto.severity !== undefined) data.severity = dto.severity;
    if (dto.priority !== undefined) data.priority = dto.priority;

    let newAssignee: string | null = null;
    if (dto.assignedToId !== undefined && dto.assignedToId !== bug.assignedToId) {
      if (dto.assignedToId) await this.assertCanAssign(dto.assignedToId, user);
      else this.testing.assertCan(user, 'bug:assign');
      data.assignedToId = dto.assignedToId || null;
      newAssignee = dto.assignedToId || null;
    }

    if (dto.testCaseId !== undefined) {
      if (dto.testCaseId === null) {
        // Clear the case link only — suiteId may still describe scope from filing.
        data.testCaseId = null;
      } else {
        const testCase = await this.testing.loadVisibleCase(dto.testCaseId, user);
        if (testCase.suite.companyId !== bug.companyId) {
          throw new BadRequestException('حالة الاختبار ليست في نفس شركة الخطأ');
        }
        data.testCaseId = testCase.id;
        data.suiteId = testCase.suiteId;
        if (testCase.suite.systemId !== bug.systemId) {
          data.systemId = testCase.suite.systemId;
        }
      }
    }

    if (dto.ticketId !== undefined) {
      if (dto.ticketId === null) {
        data.ticketId = null;
      } else {
        const ticket = await this.access.loadVisibleTicket(dto.ticketId, user, {
          select: { id: true, systemId: true, companyId: true },
        });
        const systemId =
          typeof data.systemId === 'string' ? data.systemId : bug.systemId;
        if (ticket.systemId !== systemId || ticket.companyId !== bug.companyId) {
          throw new BadRequestException('التذكرة ليست في نفس نظام وشركة الخطأ');
        }
        data.ticketId = ticket.id;
      }
    }

    const updated = await this.prisma.bug.update({
      where: { id },
      data,
      include: BUG_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: 'BUG_UPDATE',
      entity: 'Bug',
      entityId: id,
      userId: user.id,
      ticketId: updated.ticketId ?? undefined,
      oldValues: {
        title: bug.title,
        description: bug.description,
        expectedBehavior: bug.expectedBehavior,
        actualBehavior: bug.actualBehavior,
        environment: bug.environment,
        severity: bug.severity,
        priority: bug.priority,
        status: bug.status,
        bugNumber: bug.bugNumber,
        assignedToId: bug.assignedToId,
        testCaseId: bug.testCaseId,
        ticketId: bug.ticketId,
      },
      newValues: {
        title: updated.title,
        description: updated.description,
        expectedBehavior: updated.expectedBehavior,
        actualBehavior: updated.actualBehavior,
        environment: updated.environment,
        severity: updated.severity,
        priority: updated.priority,
        status: updated.status,
        bugNumber: updated.bugNumber,
        assignedToId: updated.assignedToId,
        testCaseId: updated.testCaseId,
        ticketId: updated.ticketId,
      },
    });

    const newlyLinkedTicketId =
      dto.ticketId && dto.ticketId !== bug.ticketId ? (updated.ticketId as string) : null;
    if (newlyLinkedTicketId) {
      await this.notifyTicketDevelopers(
        newlyLinkedTicketId,
        updated,
        user,
        newAssignee ? [newAssignee] : [],
      );
    } else if (newAssignee) {
      await this.notifyAssignee(updated, newAssignee, user);
    }

    return updated;
  }

  /** Every status move is auditable — `BugStatusHistory`, mirroring tickets. */
  async changeStatus(id: string, dto: ChangeBugStatusDto, user: TestingActor) {
    const bug = await this.testing.loadVisibleBug(id, user);
    this.assertCanEdit(bug, user);
    if (bug.status === dto.status) return this.findOne(id, user);

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.bug.update({
        where: { id },
        data: {
          status: dto.status,
          resolvedAt: RESOLVED_STATUSES.includes(dto.status) ? new Date() : null,
        },
        include: BUG_DETAIL_INCLUDE,
      });
      await tx.bugStatusHistory.create({
        data: {
          bugId: id,
          fromStatus: bug.status,
          toStatus: dto.status,
          changedById: user.id,
          note: dto.note,
        },
      });
      return next;
    });

    await this.audit.log({
      action: 'BUG_STATUS_CHANGE',
      entity: 'Bug',
      entityId: id,
      userId: user.id,
      ticketId: updated.ticketId ?? undefined,
      oldValues: {
        status: bug.status,
        bugNumber: bug.bugNumber,
        title: bug.title,
      },
      newValues: {
        status: dto.status,
        note: dto.note ?? null,
        bugNumber: bug.bugNumber,
        title: bug.title,
      },
    });

    return updated;
  }

  /**
   * Turns a bug into a `BUG_FIX` ticket.
   *
   * The one place the QA surface touches the ticket workflow. The ticket is
   * created at DRAFT and goes through DRAFT → NEW → AWAITING_APPROVAL like any
   * other — `PROGRAMMING_HEAD` approval is still required before development
   * (AGENTS.md, req.md §8, §21). Both entities get an audit row so the link is
   * readable from either end.
   */
  async promote(id: string, user: TestingActor, dto?: PromoteBugDto) {
    this.testing.assertCan(user, 'bug:promote');
    const bug = await this.testing.loadVisibleBug(id, user, {
      include: { steps: { orderBy: { order: 'asc' }, include: { attachments: true } } },
    });
    if (bug.ticketId) throw new BadRequestException('الخطأ مرتبط بتذكرة بالفعل');
    if (bug.isArchived) throw new BadRequestException('الخطأ مؤرشف');

    const { bug: promoted, ticket } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.ticket.create({
        data: buildBugFixTicket(bug, bug.steps, user.id, dto?.title),
      });
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: created.id,
          fromStatus: null,
          toStatus: created.status,
          changedById: user.id,
          reason: `أُنشئت من الخطأ BUG-${String(bug.bugNumber).padStart(4, '0')}`,
        },
      });
      const next = await tx.bug.update({
        where: { id },
        data: { ticketId: created.id },
        include: BUG_DETAIL_INCLUDE,
      });

      // Soft link to the case / suite tickets — RELATES_TO, never BLOCKS.
      const relatedIds = new Set<string>();
      if (bug.testCaseId) {
        const testCase = await tx.testCase.findUnique({
          where: { id: bug.testCaseId },
          select: { ticketId: true, suiteId: true },
        });
        if (testCase?.ticketId) relatedIds.add(testCase.ticketId);
        if (testCase?.suiteId) {
          const links = await tx.testSuiteTicket.findMany({
            where: { suiteId: testCase.suiteId },
            select: { ticketId: true },
          });
          for (const link of links) relatedIds.add(link.ticketId);
        }
      } else if (bug.suiteId) {
        const links = await tx.testSuiteTicket.findMany({
          where: { suiteId: bug.suiteId },
          select: { ticketId: true },
        });
        for (const link of links) relatedIds.add(link.ticketId);
      }
      relatedIds.delete(created.id);
      for (const otherId of relatedIds) {
        await tx.ticketDependency.create({
          data: {
            blockingTicketId: created.id,
            blockedTicketId: otherId,
            type: TicketDependencyType.RELATES_TO,
            createdById: user.id,
          },
        });
      }

      return { bug: next, ticket: created };
    });

    await this.audit.log({
      action: 'BUG_PROMOTE',
      entity: 'Bug',
      entityId: id,
      userId: user.id,
      ticketId: ticket.id,
      newValues: {
        ticketId: ticket.id,
        bugNumber: bug.bugNumber,
        title: bug.title,
      },
    });
    await this.audit.log({
      action: 'TICKET_CREATED',
      entity: 'Ticket',
      entityId: ticket.id,
      userId: user.id,
      ticketId: ticket.id,
      newValues: { title: ticket.title, type: ticket.type, status: ticket.status, bugId: id },
    });

    return { bug: promoted, ticket };
  }

  /** Bugs archive; they are never hard-deleted. */
  async archive(id: string, user: TestingActor) {
    const bug = await this.testing.loadVisibleBug(id, user);
    this.assertCanEdit(bug, user, { allowArchived: true });
    if (bug.isArchived) return this.findOne(id, user);

    const updated = await this.prisma.bug.update({
      where: { id },
      data: { isArchived: true },
      include: BUG_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: 'BUG_ARCHIVE',
      entity: 'Bug',
      entityId: id,
      userId: user.id,
      oldValues: { isArchived: false },
      newValues: { isArchived: true },
    });

    return updated;
  }

  /** Restore an archived bug so it can be worked again. */
  async unarchive(id: string, user: TestingActor) {
    const bug = await this.testing.loadVisibleBug(id, user);
    this.assertCanEdit(bug, user, { allowArchived: true });
    if (!bug.isArchived) return this.findOne(id, user);

    const live = await this.prisma.bug.update({
      where: { id },
      data: { isArchived: false },
      include: BUG_DETAIL_INCLUDE,
    });

    await this.audit.log({
      action: 'BUG_UNARCHIVE',
      entity: 'Bug',
      entityId: id,
      userId: user.id,
      oldValues: { isArchived: true },
      newValues: { isArchived: false },
    });

    return live;
  }

  // ----------------------------------------------------------------- helpers

  /**
   * Editing a bug: whoever filed it, or anyone who may assign one. A developer
   * fixing a bug is not free to rewrite what was reported, but the reporter can
   * correct their own filing.
   */
  private assertCanEdit(
    bug: { reportedById: string; isArchived: boolean },
    user: TestingActor,
    opts: { allowArchived?: boolean } = {},
  ): void {
    if (bug.isArchived && !opts.allowArchived) {
      throw new BadRequestException('الخطأ مؤرشف ولا يمكن تعديله');
    }
    if (this.testing.can(user, 'bug:assign')) return;
    if (bug.reportedById === user.id && this.testing.can(user, 'bug:create')) return;
    throw new ForbiddenException('Access denied');
  }

  private async assertCanAssign(assigneeId: string, user: TestingActor) {
    this.testing.assertCan(user, 'bug:assign');
    const assignee = await this.prisma.user.findUnique({
      where: { id: assigneeId },
      select: { id: true, isActive: true },
    });
    if (!assignee || !assignee.isActive) throw new NotFoundException('Assignee not found');
  }

  private actorDisplayName(user: TestingActor & { firstName?: string; lastName?: string }) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ');
  }

  /** Fire-and-forget bug-filed mail; skips blanks and duplicate ids. */
  private emailBugFiled(
    recipients: Array<{ id: string; email: string | null; firstName: string }>,
    bug: {
      id: string;
      title: string;
      bugNumber: number;
      system?: { name: string } | null;
      company?: { name: string } | null;
    },
    reporterName: string,
  ) {
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'https://barmijly.ai';
    const bugUrl = `${frontendUrl}/bugs/${bug.id}`;
    const scope = {
      companyName: bug.company?.name,
      systemName: bug.system?.name,
    };
    const emailed = new Set<string>();
    for (const row of recipients) {
      if (!row.email || emailed.has(row.id)) continue;
      emailed.add(row.id);
      void this.email.sendBugFiled(
        row.email,
        row.firstName,
        bug.title,
        bug.bugNumber,
        bugUrl,
        reporterName,
        scope,
      );
    }
  }

  private async loadMailRecipients(userIds: string[]) {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (!ids.length) return [];
    return this.prisma.user.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, email: true, firstName: true },
    });
  }

  /**
   * Developers who should hear about a standalone bug on this system/company.
   * Prefers explicit `UserSystem` grants; when none exist (common when staffing
   * is ticket-only), falls back to active developers tied to the company.
   */
  private async standaloneBugRecipients(systemId: string, companyId: string) {
    const roster = await this.prisma.userSystem.findMany({
      where: {
        systemId,
        user: { role: UserRole.DEVELOPER, isActive: true },
      },
      select: {
        user: { select: { id: true, email: true, firstName: true } },
      },
    });
    if (roster.length) return roster.map((r) => r.user);

    return this.prisma.user.findMany({
      where: {
        role: UserRole.DEVELOPER,
        isActive: true,
        OR: [
          { systems: { some: { systemId } } },
          { companyId },
          { companies: { some: { companyId } } },
        ],
      },
      select: { id: true, email: true, firstName: true },
    });
  }

  /**
   * Filing/linking a bug on a ticket notifies and emails every active developer
   * on that ticket (not only a personal `assignedToId`). Optional extra ids
   * cover a personal assignee who is not yet on the roster.
   */
  private async notifyTicketDevelopers(
    ticketId: string,
    bug: {
      id: string;
      title: string;
      bugNumber: number;
      system?: { name: string } | null;
      company?: { name: string } | null;
    },
    user: TestingActor & { firstName?: string; lastName?: string },
    extraUserIds: string[] = [],
  ) {
    const roster = await this.prisma.ticketAssignment.findMany({
      where: { ticketId, isActive: true },
      select: { developerId: true },
    });
    const recipientIds = [
      ...new Set([...roster.map((r) => r.developerId), ...extraUserIds]),
    ];
    if (!recipientIds.length) return;

    const actor = this.actorDisplayName(user);
    await this.notifications.notifyMany(
      recipientIds,
      {
        type: NotificationType.BUG_ASSIGNED,
        title: 'خطأ جديد على تذكرتك',
        body: `${actor} سجّل الخطأ «${bug.title}» على تذكرتك`,
        ticketId,
        metadata: { bugId: bug.id, bugNumber: bug.bugNumber },
      },
      user.id,
    );

    const recipients = await this.loadMailRecipients(recipientIds);
    this.emailBugFiled(recipients, bug, actor);
  }

  /**
   * Standalone bugs (no ticket link) notify and email every active developer on
   * the system (or company fallback), plus any personal assignee.
   */
  private async notifySystemDevelopers(
    bug: {
      id: string;
      title: string;
      bugNumber: number;
      systemId: string;
      companyId: string;
      system?: { name: string } | null;
      company?: { name: string } | null;
    },
    user: TestingActor & { firstName?: string; lastName?: string },
    extraUserIds: string[] = [],
  ) {
    const roster = await this.standaloneBugRecipients(bug.systemId, bug.companyId);
    const byId = new Map(roster.map((r) => [r.id, r]));
    for (const extraId of extraUserIds) {
      if (byId.has(extraId)) continue;
      const extra = await this.prisma.user.findUnique({
        where: { id: extraId },
        select: { id: true, email: true, firstName: true, isActive: true },
      });
      if (extra?.isActive) byId.set(extra.id, extra);
    }

    const recipients = [...byId.values()];
    if (!recipients.length) return;

    const actor = this.actorDisplayName(user);
    const scopeLine =
      bug.company?.name && bug.system?.name
        ? `${bug.company.name} · ${bug.system.name}`
        : (bug.system?.name ?? '');

    await this.notifications.notifyMany(
      recipients.map((r) => r.id),
      {
        type: NotificationType.BUG_ASSIGNED,
        title: 'خطأ جديد على مشروعك',
        body: `${actor} سجّل الخطأ «${bug.title}»${scopeLine ? ` (${scopeLine})` : ''}`,
        metadata: {
          bugId: bug.id,
          bugNumber: bug.bugNumber,
          systemId: bug.systemId,
        },
      },
      user.id,
    );

    this.emailBugFiled(recipients, bug, actor);
  }

  private async notifyAssignee(
    bug: { id: string; title: string; bugNumber: number; ticketId: string | null },
    assigneeId: string,
    user: TestingActor & { firstName?: string; lastName?: string },
  ) {
    const actor = this.actorDisplayName(user);
    await this.notifications.notify(
      assigneeId,
      {
        type: NotificationType.BUG_ASSIGNED,
        title: 'أُسند إليك خطأ',
        body: `${actor} أسند إليك الخطأ «${bug.title}»`,
        ticketId: bug.ticketId ?? undefined,
        metadata: { bugId: bug.id, bugNumber: bug.bugNumber },
      },
      user.id,
    );
  }

  private searchWhere(search: string): Prisma.BugWhereInput {
    const or: Prisma.BugWhereInput[] = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
    const bugNumber = parseBugNumberQuery(search);
    if (bugNumber != null) or.push({ bugNumber });
    return { OR: or };
  }

  private detectedWhere(from?: string, to?: string): Prisma.BugWhereInput {
    if (!from && !to) return {};
    return {
      detectedAt: {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      },
    };
  }
}
