import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, TestResult, TestState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TestingAccessService, TestingActor } from './testing.access';
import { TestRollupService } from './test-rollup.service';
import { CreateCaseDto, RecordResultDto, UpdateCaseDto } from './dto/case.dto';

const PERSON = { select: { id: true, firstName: true, lastName: true } } as const;

/** Shape returned to the client — never a bare row. */
const CASE_INCLUDE = {
  assignedTo: PERSON,
  lastRunBy: PERSON,
  ticket: { select: { id: true, title: true, ticketNumber: true, status: true } },
  steps: { orderBy: { order: 'asc' }, include: { attachments: true } },
  attachments: true,
  // Live bugs for the case detail pane — archived ones stay on `/bugs` only.
  bugs: {
    where: { isArchived: false },
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      bugNumber: true,
      title: true,
      severity: true,
      status: true,
      ticketId: true,
      description: true,
      expectedBehavior: true,
      actualBehavior: true,
      environment: true,
      priority: true,
    },
  },
  _count: { select: { bugs: true } },
} as const satisfies Prisma.TestCaseInclude;

/** Ordering step for a new row: append at the end of the suite. */
const ORDER_STEP = 1;

@Injectable()
export class CasesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private testing: TestingAccessService,
    private rollup: TestRollupService,
    private audit: AuditService,
    private notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------- read

  async findBySuite(suiteId: string, user: TestingActor) {
    await this.testing.loadVisibleSuite(suiteId, user);
    return this.prisma.testCase.findMany({
      where: { suiteId },
      include: CASE_INCLUDE,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string, user: TestingActor) {
    return this.testing.loadVisibleCase(id, user, CASE_INCLUDE);
  }

  // ------------------------------------------------------------------- write

  async create(suiteId: string, dto: CreateCaseDto, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const suite = await this.testing.loadVisibleSuite(suiteId, user);
    if (suite.state === TestState.ARCHIVED) {
      throw new BadRequestException('المجموعة مؤرشفة ولا يمكن إضافة حالات إليها');
    }
    if (dto.ticketId) await this.access.assertCanViewTicket(dto.ticketId, user);
    if (dto.assignedToId) await this.assertAssignable(dto.assignedToId);

    const last = await this.prisma.testCase.findFirst({
      where: { suiteId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const created = await this.prisma.testCase.create({
      data: {
        suiteId,
        title: dto.title,
        description: dto.description,
        preconditions: dto.preconditions,
        expectedResult: dto.expectedResult,
        ticketId: dto.ticketId,
        assignedToId: dto.assignedToId,
        order: (last?.order ?? -1) + ORDER_STEP,
      },
      include: CASE_INCLUDE,
    });

    await this.audit.log({
      action: 'CASE_CREATE',
      entity: 'TestCase',
      entityId: created.id,
      userId: user.id,
      ticketId: dto.ticketId,
      newValues: {
        title: created.title,
        suiteId,
        caseNumber: created.caseNumber,
        assignedToId: created.assignedToId,
      },
    });

    return created;
  }

  async update(id: string, dto: UpdateCaseDto, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const testCase = await this.testing.loadVisibleCase(id, user);
    this.assertLive(testCase.state);

    if (dto.ticketId) await this.access.assertCanViewTicket(dto.ticketId, user);
    if (dto.assignedToId) await this.assertAssignable(dto.assignedToId);

    const data: Prisma.TestCaseUncheckedUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.preconditions !== undefined) data.preconditions = dto.preconditions;
    if (dto.expectedResult !== undefined) data.expectedResult = dto.expectedResult;
    if (dto.actualResult !== undefined) data.actualResult = dto.actualResult;
    if (dto.ticketId !== undefined) data.ticketId = dto.ticketId || null;
    if (dto.assignedToId !== undefined) data.assignedToId = dto.assignedToId || null;

    const updated = await this.prisma.testCase.update({
      where: { id },
      data,
      include: CASE_INCLUDE,
    });

    await this.audit.log({
      action: 'CASE_UPDATE',
      entity: 'TestCase',
      entityId: id,
      userId: user.id,
      ticketId: updated.ticketId ?? undefined,
      oldValues: {
        title: testCase.title,
        description: testCase.description,
        assignedToId: testCase.assignedToId,
      },
      newValues: {
        title: updated.title,
        description: updated.description,
        assignedToId: updated.assignedToId,
      },
    });

    return updated;
  }

  /**
   * DRAFT → ACTIVE.
   *
   * Steps are encouraged but not required — authors may publish an empty shell
   * and fill steps while executing.
   */
  async publish(id: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const testCase = await this.testing.loadVisibleCase(id, user);
    if (testCase.state !== TestState.DRAFT) {
      throw new BadRequestException('يمكن نشر المسودات فقط');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.testCase.update({
        where: { id },
        data: { state: TestState.ACTIVE },
        include: CASE_INCLUDE,
      });
      // Publishing changes which cases the rollup counts.
      await this.rollup.recompute(testCase.suiteId, tx);
      return next;
    });

    await this.audit.log({
      action: 'CASE_PUBLISH',
      entity: 'TestCase',
      entityId: id,
      userId: user.id,
      ticketId: updated.ticketId ?? undefined,
      oldValues: { state: testCase.state, title: testCase.title },
      newValues: { state: updated.state, title: updated.title },
    });

    return updated;
  }

  /**
   * Records an execution result.
   *
   * One history row per change, the case's own columns restamped, and the
   * suite rollup refreshed — all in the same transaction, so a result can never
   * exist without its audit row.
   */
  async recordResult(id: string, dto: RecordResultDto, user: TestingActor) {
    const testCase = await this.testing.loadVisibleCase(id, user);
    await this.testing.assertCanExecute(
      { suiteId: testCase.suiteId, ticketId: testCase.ticketId },
      user,
    );
    if (testCase.state !== TestState.ACTIVE) {
      throw new BadRequestException('يمكن تنفيذ الحالات المنشورة فقط');
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.testCase.update({
        where: { id },
        data: {
          lastResult: dto.result,
          lastRunAt: now,
          lastRunById: user.id,
          ...(dto.actualResult !== undefined ? { actualResult: dto.actualResult } : {}),
        },
        include: CASE_INCLUDE,
      });
      await tx.testCaseResultHistory.create({
        data: {
          testCaseId: id,
          fromResult: testCase.lastResult,
          toResult: dto.result,
          changedById: user.id,
          note: dto.note,
        },
      });
      await this.rollup.recompute(testCase.suiteId, tx);
      return next;
    });

    await this.audit.log({
      action: 'CASE_RESULT',
      entity: 'TestCase',
      entityId: id,
      userId: user.id,
      ticketId: updated.ticketId ?? undefined,
      oldValues: { lastResult: testCase.lastResult, title: testCase.title },
      newValues: { lastResult: dto.result, note: dto.note ?? null, title: updated.title },
    });

    if (dto.result === TestResult.FAIL) await this.notifyFailure(updated, user);

    return updated;
  }

  /** Manual ordering inside the suite panel. Rebalances every sibling. */
  async reorder(id: string, order: number, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const testCase = await this.testing.loadVisibleCase(id, user);
    this.assertLive(testCase.state);

    const siblings = await this.prisma.testCase.findMany({
      where: { suiteId: testCase.suiteId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });

    const reordered = moveTo(siblings.map((s) => s.id), id, order);
    await this.prisma.$transaction(
      reordered.map((rowId, index) =>
        this.prisma.testCase.update({ where: { id: rowId }, data: { order: index } }),
      ),
    );

    return this.prisma.testCase.findMany({
      where: { suiteId: testCase.suiteId },
      include: CASE_INCLUDE,
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * A draft nobody has run is a typo — it goes. Anything published is a record
   * of what was tested, so it archives instead (AGENTS.md: nothing is deleted).
   */
  async remove(id: string, user: TestingActor) {
    this.testing.assertCanAuthor(user);
    const testCase = await this.testing.loadVisibleCase(id, user);

    if (testCase.state !== TestState.DRAFT) {
      if (testCase.state === TestState.ARCHIVED) return testCase;
      const archived = await this.prisma.$transaction(async (tx) => {
        const next = await tx.testCase.update({
          where: { id },
          data: { state: TestState.ARCHIVED },
          include: CASE_INCLUDE,
        });
        await this.rollup.recompute(testCase.suiteId, tx);
        return next;
      });
      await this.audit.log({
        action: 'CASE_ARCHIVE',
        entity: 'TestCase',
        entityId: id,
        userId: user.id,
        oldValues: { state: testCase.state },
        newValues: { state: archived.state },
      });
      return archived;
    }

    const deleted = await this.prisma.testCase.delete({ where: { id } });
    await this.audit.log({
      action: 'CASE_DELETE',
      entity: 'TestCase',
      entityId: id,
      userId: user.id,
      oldValues: { title: testCase.title, state: testCase.state },
    });
    return deleted;
  }

  // ----------------------------------------------------------------- helpers

  private assertLive(state: TestState) {
    if (state === TestState.ARCHIVED) {
      throw new BadRequestException('الحالة مؤرشفة ولا يمكن تعديلها');
    }
  }

  private async assertAssignable(userId: string) {
    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true },
    });
    if (!person || !person.isActive) throw new NotFoundException('Assignee not found');
  }

  /**
   * A failing case is news for whoever owns the work, so it goes to the lead
   * developer on every ticket the case covers — its own, and the ones its suite
   * links. Contributors read it off the ticket; the lead is the one who acts.
   */
  private async notifyFailure(
    testCase: { id: string; title: string; ticketId: string | null; suiteId: string },
    user: TestingActor & { firstName?: string; lastName?: string },
  ) {
    const links = await this.prisma.testSuiteTicket.findMany({
      where: { suiteId: testCase.suiteId },
      select: { ticketId: true },
    });
    const ticketIds = new Set(links.map((l) => l.ticketId));
    if (testCase.ticketId) ticketIds.add(testCase.ticketId);
    if (!ticketIds.size) return;

    const leads = await this.prisma.ticketAssignment.findMany({
      where: { ticketId: { in: [...ticketIds] }, isActive: true, isLead: true },
      select: { developerId: true, ticketId: true },
    });
    if (!leads.length) return;

    const actor = [user.firstName, user.lastName].filter(Boolean).join(' ');
    await this.notifications.notifyMany(
      leads.map((l) => l.developerId),
      {
        type: NotificationType.TEST_CASE_FAILED,
        title: 'فشلت حالة اختبار',
        body: `${actor} سجّل فشل الحالة «${testCase.title}»`,
        ticketId: testCase.ticketId ?? leads[0].ticketId,
        metadata: { testCaseId: testCase.id, suiteId: testCase.suiteId },
      },
      user.id,
    );
  }
}

/**
 * Moves one id to a target index and returns the whole list in its new order.
 * Shared by case and step reordering — both rebalance to contiguous positions
 * rather than leaving gaps, so `order` never needs a tiebreak.
 */
export function moveTo(ids: string[], id: string, target: number): string[] {
  const from = ids.indexOf(id);
  if (from === -1) return ids;
  const clamped = Math.max(0, Math.min(target, ids.length - 1));
  const next = [...ids];
  next.splice(from, 1);
  next.splice(clamped, 0, id);
  return next;
}
