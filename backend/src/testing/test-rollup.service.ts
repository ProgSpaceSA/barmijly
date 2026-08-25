import { Injectable } from '@nestjs/common';
import { BugStatus, Prisma, TestResult, TestState } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A bug that still costs somebody work. VERIFIED and later are settled. */
export const OPEN_BUG_STATUSES: BugStatus[] = [
  BugStatus.OPEN,
  BugStatus.IN_PROGRESS,
  BugStatus.FIXED,
];

export interface SuiteRollup {
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  skipped: number;
  notRun: number;
  /** Share of ACTIVE cases that passed, 0–100, rounded. 0 for an empty suite. */
  passRate: number;
  openBugs: number;
}

export const EMPTY_ROLLUP: SuiteRollup = {
  total: 0,
  pass: 0,
  fail: 0,
  blocked: 0,
  skipped: 0,
  notRun: 0,
  passRate: 0,
  openBugs: 0,
};

const RESULT_KEYS: Record<TestResult, keyof SuiteRollup> = {
  [TestResult.PASS]: 'pass',
  [TestResult.FAIL]: 'fail',
  [TestResult.BLOCKED]: 'blocked',
  [TestResult.SKIPPED]: 'skipped',
  [TestResult.NOT_RUN]: 'notRun',
};

/**
 * Pass rate and open-bug counts per suite, modelled on `TaskRollupService`.
 *
 * Only `TestSuite.lastRunAt` is denormalised, and this is its single writer: it
 * is recomputed inside the same transaction as every result change and every
 * case publish or archive, so a suite and its cases can never disagree about
 * when it last ran. The counts are aggregated on read instead — two endpoints
 * want them, and a stored count is a count that drifts.
 *
 * DRAFT and ARCHIVED cases are excluded throughout. A case somebody is still
 * writing is not a failing test, and archiving a stale case must not drag the
 * pass rate down with it.
 */
@Injectable()
export class TestRollupService {
  constructor(private prisma: PrismaService) {}

  /** Restamps `lastRunAt` from the suite's ACTIVE cases. Idempotent. */
  async recompute(
    suiteId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    const latest = await tx.testCase.aggregate({
      where: { suiteId, state: TestState.ACTIVE },
      _max: { lastRunAt: true },
    });

    await tx.testSuite.update({
      where: { id: suiteId },
      data: { lastRunAt: latest._max.lastRunAt ?? null },
    });
  }

  /** Rollup for one suite. */
  async forSuite(suiteId: string): Promise<SuiteRollup> {
    const map = await this.forSuites([suiteId]);
    return map.get(suiteId) ?? { ...EMPTY_ROLLUP };
  }

  /**
   * Rollups for a page of suites in two queries rather than two per row — the
   * list endpoint asks for twenty at a time.
   */
  async forSuites(suiteIds: string[]): Promise<Map<string, SuiteRollup>> {
    const out = new Map<string, SuiteRollup>();
    if (!suiteIds.length) return out;
    for (const id of suiteIds) out.set(id, { ...EMPTY_ROLLUP });

    const [byResult, byBug] = await Promise.all([
      this.prisma.testCase.groupBy({
        by: ['suiteId', 'lastResult'],
        where: { suiteId: { in: suiteIds }, state: TestState.ACTIVE },
        _count: { _all: true },
      }),
      this.prisma.bug.groupBy({
        by: ['suiteId'],
        where: {
          suiteId: { in: suiteIds },
          isArchived: false,
          status: { in: OPEN_BUG_STATUSES },
        },
        _count: { _all: true },
      }),
    ]);

    for (const row of byResult) {
      const rollup = out.get(row.suiteId);
      if (!rollup) continue;
      const count = row._count._all;
      (rollup[RESULT_KEYS[row.lastResult]] as number) += count;
      rollup.total += count;
    }

    for (const row of byBug) {
      if (!row.suiteId) continue;
      const rollup = out.get(row.suiteId);
      if (rollup) rollup.openBugs = row._count._all;
    }

    for (const rollup of out.values()) {
      rollup.passRate = rollup.total ? Math.round((rollup.pass / rollup.total) * 100) : 0;
    }

    return out;
  }
}
