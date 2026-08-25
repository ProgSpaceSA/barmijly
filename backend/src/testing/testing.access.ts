import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { Action, Actor, assertCan, can } from '../access/permissions';

export type TestingActor = Actor & { companyId?: string | null };

/**
 * Scope for the QA surface, mirroring `AccessService` for tickets.
 *
 * `permissions.ts` answers "may this role ever touch a suite?"; this answers
 * "may they touch that particular suite". Suites, cases and bugs all hang off a
 * system, so the answer is the system scope the user already has — nothing new
 * is granted here, and somebody who cannot see a system cannot see its tests.
 */
@Injectable()
export class TestingAccessService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  // ------------------------------------------------------------------ scope

  /** Prisma filter for the suites list. Empty object means "no restriction". */
  async suiteScope(user: TestingActor): Promise<Prisma.TestSuiteWhereInput> {
    assertCan(user, 'test:read');
    const ids = await this.access.visibleSystemIds(user);
    return ids === null ? {} : { systemId: { in: ids } };
  }

  /** Prisma filter for the bugs list. Same rule, different table. */
  async bugScope(user: TestingActor): Promise<Prisma.BugWhereInput> {
    assertCan(user, 'test:read');
    const ids = await this.access.visibleSystemIds(user);
    return ids === null ? {} : { systemId: { in: ids } };
  }

  // ------------------------------------------------------------------ loads

  /**
   * Loads a suite the caller may see. 404 when it does not exist, 403 when it
   * exists but sits outside their systems — never leaks one as the other.
   */
  async loadVisibleSuite<T extends Prisma.TestSuiteDefaultArgs>(
    id: string,
    user: TestingActor,
    args?: T,
  ): Promise<Prisma.TestSuiteGetPayload<T>> {
    assertCan(user, 'test:read');
    const suite = await this.prisma.testSuite.findUnique({
      where: { id },
      ...(args ?? {}),
    } as any);
    if (!suite) throw new NotFoundException('Test suite not found');
    await this.access.assertCanViewSystem((suite as { systemId: string }).systemId, user);
    return suite as Prisma.TestSuiteGetPayload<T>;
  }

  /**
   * Loads a case plus the slice of its suite every gate needs. The suite is
   * always included, whatever the caller asked for — the scope answer lives
   * there, and a case loaded without it cannot be checked.
   */
  async loadVisibleCase(id: string, user: TestingActor, include?: Prisma.TestCaseInclude) {
    assertCan(user, 'test:read');
    const found = await this.prisma.testCase.findUnique({
      where: { id },
      include: {
        ...(include ?? {}),
        suite: {
          select: { id: true, systemId: true, companyId: true, state: true, isArchived: true },
        },
      },
    });
    if (!found) throw new NotFoundException('Test case not found');
    await this.access.assertCanViewSystem(found.suite.systemId, user);
    return found;
  }

  async loadVisibleBug<T extends Prisma.BugDefaultArgs>(
    id: string,
    user: TestingActor,
    args?: T,
  ): Promise<Prisma.BugGetPayload<T>> {
    assertCan(user, 'test:read');
    const bug = await this.prisma.bug.findUnique({ where: { id }, ...(args ?? {}) } as any);
    if (!bug) throw new NotFoundException('Bug not found');
    await this.access.assertCanViewSystem((bug as { systemId: string }).systemId, user);
    return bug as Prisma.BugGetPayload<T>;
  }

  // ------------------------------------------------------------------ gates

  /** Authoring — writing the tests themselves. */
  assertCanAuthor(user: TestingActor): void {
    assertCan(user, 'test:author');
  }

  /**
   * Recording a result, or filing a bug from a case.
   *
   * QA and leadership hold this outright. A developer holds the action but not
   * the row: they may only run a case covering work they are actually on, which
   * is the same shape as `task:create-own` (req.md §16). With no ticket linked
   * anywhere there is nothing to be assigned to, so the developer is refused
   * rather than quietly let through.
   */
  async assertCanExecute(
    ref: { suiteId: string; ticketId?: string | null },
    user: TestingActor,
  ): Promise<void> {
    assertCan(user, 'test:execute');
    if (user.role !== UserRole.DEVELOPER) return;

    const ticketIds = await this.linkedTicketIds(ref);
    const onTicket = ticketIds.length
      ? await this.prisma.ticketAssignment.findFirst({
          where: { ticketId: { in: ticketIds }, developerId: user.id, isActive: true },
          select: { id: true },
        })
      : null;
    if (!onTicket) throw new ForbiddenException('يمكنك تنفيذ الحالات المرتبطة بتذاكرك فقط');
  }

  /**
   * Filing a bug straight from the bugs page, where there is no case and so no
   * linked ticket to check. System membership is the gate instead — otherwise
   * `bug:create` would be dead for a developer on that surface.
   */
  async assertCanFileBug(systemId: string, companyId: string, user: TestingActor): Promise<void> {
    assertCan(user, 'bug:create');
    await this.access.assertCanFileAgainst(systemId, companyId, user);
  }

  /** Every ticket the case or its suite says it covers. */
  private async linkedTicketIds(ref: {
    suiteId: string;
    ticketId?: string | null;
  }): Promise<string[]> {
    const links = await this.prisma.testSuiteTicket.findMany({
      where: { suiteId: ref.suiteId },
      select: { ticketId: true },
    });
    const ids = new Set(links.map((l) => l.ticketId));
    if (ref.ticketId) ids.add(ref.ticketId);
    return [...ids];
  }

  // ---------------------------------------------------------------- helpers

  /** Re-exported so services gate on the matrix without a second import. */
  can(user: TestingActor | undefined, action: Action): boolean {
    return can(user?.role, action);
  }

  assertCan(user: TestingActor | undefined, action: Action): void {
    assertCan(user, action);
  }
}
