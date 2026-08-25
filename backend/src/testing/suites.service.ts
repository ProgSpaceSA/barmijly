import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TestState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { TestingAccessService, TestingActor } from './testing.access';
import { OPEN_BUG_STATUSES, SuiteRollup, TestRollupService } from './test-rollup.service';
import { parseSuiteNumberQuery } from './test-code';
import {
  CreateSuiteDto,
  FilterSuitesDto,
  SuiteHealth,
  UpdateSuiteDto,
} from './dto/suite.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/** List shape — enough for a card, never the whole case tree. */
const SUITE_LIST_INCLUDE = {
  owner: PERSON,
  system: { select: { id: true, name: true } },
  company: { select: { id: true, name: true, logoUrl: true } },
  _count: { select: { cases: true, ticketLinks: true } },
} as const;

/**
 * Suites: the container a set of test cases hangs off.
 *
 * Everything here is scoped through `TestingAccessService`, which resolves to
 * the same system membership tickets already use — the QA surface adds no new
 * reach. Nothing is hard-deleted: a suite that has outlived its purpose is
 * archived, exactly like a ticket (AGENTS.md, req.md §21).
 */
@Injectable()
export class SuitesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private testing: TestingAccessService,
    private rollup: TestRollupService,
    private audit: AuditService,
  ) {}

  // -------------------------------------------------------------------- read

  async findAll(user: TestingActor, filters: FilterSuitesDto) {
    const page = parseInt(filters.page || '1');
    const limit = parseInt(filters.limit || '20');
    const skip = (page - 1) * limit;

    const where: Prisma.TestSuiteWhereInput = {
      isArchived: filters.isArchived ?? false,
      ...(filters.state && { state: filters.state }),
      ...(filters.systemId && { systemId: filters.systemId }),
      ...(filters.companyId && { companyId: filters.companyId }),
      ...(filters.ownerId && { ownerId: filters.ownerId }),
      ...(filters.search && this.searchWhere(filters.search)),
      // «المُسندة إليّ»: owned, or holding a case assigned to me. This is what
      // replaces a flat cross-suite case page — see the plan, §1.
      ...(filters.mine && {
        OR: [{ ownerId: user.id }, { cases: { some: { assignedToId: user.id } } }],
      }),
      ...this.healthWhere(filters.health),
    };

    // AND rather than a merge: a caller-supplied filter must never widen the
    // scope, and the scope must survive alongside the search OR.
    const scope = await this.testing.suiteScope(user);
    const scoped: Prisma.TestSuiteWhereInput = Object.keys(scope).length
      ? { AND: [where, scope] }
      : where;

    const [data, total] = await Promise.all([
      this.prisma.testSuite.findMany({
        where: scoped,
        include: SUITE_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.testSuite.count({ where: scoped }),
    ]);

    const rollups = await this.rollup.forSuites(data.map((s) => s.id));

    return {
      data: data.map((suite) => ({ ...suite, rollup: rollups.get(suite.id) })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string, user: TestingActor) {
    const suite = await this.testing.loadVisibleSuite(id, user, {
      include: {
        ...SUITE_LIST_INCLUDE,
        cases: {
          include: {
            assignedTo: PERSON,
            lastRunBy: PERSON,
            ticket: { select: { id: true, title: true, ticketNumber: true, status: true } },
            bugs: {
              where: { isArchived: false },
              select: { status: true },
            },
            _count: { select: { steps: true, bugs: true, attachments: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        },
        ticketLinks: {
          include: {
            ticket: { select: { id: true, title: true, ticketNumber: true, status: true } },
            linkedBy: PERSON,
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
      },
    });

    return { ...suite, rollup: await this.rollup.forSuite(id) };
  }

  /**
   * The ticket page's «الاختبارات والأخطاء» section: the suites covering this
   * ticket, the cases pointed at it, and the bugs filed against it.
   */
  async findForTicket(ticketId: string, user: TestingActor) {
    this.testing.assertCan(user, 'test:read');
    await this.access.assertCanViewTicket(ticketId, user);

    const [links, cases, bugs] = await Promise.all([
      this.prisma.testSuiteTicket.findMany({
        where: { ticketId },
        include: { suite: { include: SUITE_LIST_INCLUDE } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.testCase.findMany({
        where: { ticketId },
        include: {
          assignedTo: PERSON,
          lastRunBy: PERSON,
          suite: { select: { id: true, title: true, suiteNumber: true } },
          steps: { orderBy: { order: 'asc' }, include: { attachments: true } },
          _count: { select: { bugs: true } },
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.bug.findMany({
        where: { ticketId, isArchived: false },
        include: {
          reportedBy: PERSON,
          assignedTo: PERSON,
          testCase: { select: { id: true, title: true, caseNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const rollups = await this.rollup.forSuites(links.map((l) => l.suiteId));

    return {
      suites: links.map((link) => ({ ...link.suite, rollup: rollups.get(link.suiteId) })),
      cases,
      bugs,
    };
  }

  // ------------------------------------------------------------------- write

  async create(dto: CreateSuiteDto, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    // Same target check a new ticket gets: live system, in the stated company,
    // and one the author is authorised for (req.md §16, §21).
    await this.access.assertCanFileAgainst(dto.systemId, dto.companyId, user);

    const suite = await this.prisma.testSuite.create({
      data: {
        title: dto.title,
        description: dto.description,
        systemId: dto.systemId,
        companyId: dto.companyId,
        ownerId: user.id,
      },
      include: SUITE_LIST_INCLUDE,
    });

    await this.audit.log({
      action: 'SUITE_CREATE',
      entity: 'TestSuite',
      entityId: suite.id,
      userId: user.id,
      newValues: { title: suite.title, systemId: suite.systemId, state: suite.state },
    });

    return suite;
  }

  async update(id: string, dto: UpdateSuiteDto, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const suite = await this.testing.loadVisibleSuite(id, user);
    this.assertLive(suite.state);

    const data: Prisma.TestSuiteUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.ownerId !== undefined && dto.ownerId !== suite.ownerId) {
      const owner = await this.prisma.user.findUnique({
        where: { id: dto.ownerId },
        select: { id: true, role: true, isActive: true },
      });
      if (!owner || !owner.isActive) throw new NotFoundException('Owner not found');
      // Handing a suite to somebody who cannot author one leaves it unmaintainable.
      if (!this.testing.can({ id: owner.id, role: owner.role }, 'test:author')) {
        throw new ForbiddenException('Owner cannot author test suites');
      }
      data.owner = { connect: { id: dto.ownerId } };
    }

    const updated = await this.prisma.testSuite.update({
      where: { id },
      data,
      include: SUITE_LIST_INCLUDE,
    });

    await this.audit.log({
      action: 'SUITE_UPDATE',
      entity: 'TestSuite',
      entityId: id,
      userId: user.id,
      oldValues: { title: suite.title, description: suite.description, ownerId: suite.ownerId },
      newValues: {
        title: updated.title,
        description: updated.description,
        ownerId: updated.ownerId,
      },
    });

    return updated;
  }

  /** DRAFT → ACTIVE. Publishing twice is a mistake, not a no-op. */
  async publish(id: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const suite = await this.testing.loadVisibleSuite(id, user);
    if (suite.state !== TestState.DRAFT) {
      throw new BadRequestException('يمكن نشر المسودات فقط');
    }

    const updated = await this.prisma.testSuite.update({
      where: { id },
      data: { state: TestState.ACTIVE },
      include: SUITE_LIST_INCLUDE,
    });

    await this.audit.log({
      action: 'SUITE_PUBLISH',
      entity: 'TestSuite',
      entityId: id,
      userId: user.id,
      oldValues: { state: suite.state },
      newValues: { state: updated.state },
    });

    return updated;
  }

  /** Never a hard delete — a suite carries the record of what was tested. */
  async archive(id: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const suite = await this.testing.loadVisibleSuite(id, user);
    if (suite.state === TestState.ARCHIVED) return suite;

    const updated = await this.prisma.testSuite.update({
      where: { id },
      data: { state: TestState.ARCHIVED, isArchived: true },
      include: SUITE_LIST_INCLUDE,
    });

    await this.audit.log({
      action: 'SUITE_ARCHIVE',
      entity: 'TestSuite',
      entityId: id,
      userId: user.id,
      oldValues: { state: suite.state },
      newValues: { state: updated.state },
    });

    return updated;
  }

  /** ARCHIVED → ACTIVE. Restores an archived suite so authors can edit again. */
  async unarchive(id: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const suite = await this.testing.loadVisibleSuite(id, user);
    if (suite.state !== TestState.ARCHIVED) {
      throw new BadRequestException('المجموعة ليست مؤرشفة');
    }

    const updated = await this.prisma.testSuite.update({
      where: { id },
      data: { state: TestState.ACTIVE, isArchived: false },
      include: SUITE_LIST_INCLUDE,
    });

    await this.audit.log({
      action: 'SUITE_UNARCHIVE',
      entity: 'TestSuite',
      entityId: id,
      userId: user.id,
      oldValues: { state: suite.state, isArchived: true },
      newValues: { state: updated.state, isArchived: false },
    });

    return updated;
  }

  // --------------------------------------------------------------- ticket links

  async linkTicket(id: string, ticketId: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const suite = await this.testing.loadVisibleSuite(id, user);
    this.assertLive(suite.state);
    // Linking a ticket the author cannot open would put an unreadable row on
    // the suite page, so the ticket scope decides here too.
    await this.access.assertCanViewTicket(ticketId, user);

    const existing = await this.prisma.testSuiteTicket.findUnique({
      where: { suiteId_ticketId: { suiteId: id, ticketId } },
    });
    if (existing) throw new BadRequestException('التذكرة مرتبطة بالفعل بهذه المجموعة');

    const link = await this.prisma.testSuiteTicket.create({
      data: { suiteId: id, ticketId, linkedById: user.id },
      include: {
        ticket: { select: { id: true, title: true, ticketNumber: true, status: true } },
        linkedBy: PERSON,
      },
    });

    await this.audit.log({
      action: 'SUITE_TICKET_LINK',
      entity: 'TestSuite',
      entityId: id,
      userId: user.id,
      ticketId,
      newValues: { suiteId: id, ticketId, title: suite.title },
    });

    return link;
  }

  async unlinkTicket(id: string, ticketId: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    // Unlink is allowed on archived suites — the link is metadata on the
    // ticket, and trapping it behind archive made «إزالة الربط» fail in prod.
    const suite = await this.testing.loadVisibleSuite(id, user);

    const existing = await this.prisma.testSuiteTicket.findUnique({
      where: { suiteId_ticketId: { suiteId: id, ticketId } },
    });
    if (!existing) throw new NotFoundException('Link not found');

    await this.prisma.testSuiteTicket.delete({
      where: { suiteId_ticketId: { suiteId: id, ticketId } },
    });

    await this.audit.log({
      action: 'SUITE_TICKET_UNLINK',
      entity: 'TestSuite',
      entityId: id,
      userId: user.id,
      ticketId,
      oldValues: { suiteId: id, ticketId, title: suite.title },
    });

    return { suiteId: id, ticketId };
  }

  // ----------------------------------------------------------------- helpers

  /** Archived suites are read-only — the record stands as it was left. */
  private assertLive(state: TestState) {
    if (state === TestState.ARCHIVED) {
      throw new BadRequestException('المجموعة مؤرشفة ولا يمكن تعديلها');
    }
  }

  private searchWhere(search: string): Prisma.TestSuiteWhereInput {
    const or: Prisma.TestSuiteWhereInput[] = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
    const suiteNumber = parseSuiteNumberQuery(search);
    if (suiteNumber != null) or.push({ suiteNumber });
    return { OR: or };
  }

  /**
   * Health is derived from the cases, not stored — a filter, not a column.
   * `failing` beats `open-bugs` beats `not-run` in the UI spine colour, and
   * each filter here asks only its own question.
   */
  private healthWhere(health: SuiteHealth | undefined): Prisma.TestSuiteWhereInput {
    if (!health) return {};
    if (health === 'failing') {
      return { cases: { some: { state: TestState.ACTIVE, lastResult: 'FAIL' } } };
    }
    if (health === 'open-bugs') {
      return { bugs: { some: { isArchived: false, status: { in: OPEN_BUG_STATUSES } } } };
    }
    // not-run: at least one published case nobody has executed yet.
    return { cases: { some: { state: TestState.ACTIVE, lastResult: 'NOT_RUN' } } };
  }
}

export type { SuiteRollup };
