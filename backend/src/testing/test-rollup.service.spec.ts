import { Test, TestingModule } from '@nestjs/testing';
import { BugStatus, TestResult, TestState } from '@prisma/client';
import { TestRollupService, OPEN_BUG_STATUSES } from './test-rollup.service';
import { PrismaService } from '../prisma/prisma.service';

const SUITE = 'suite-1';

describe('TestRollupService', () => {
  let service: TestRollupService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      testCase: {
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { lastRunAt: null } }),
      },
      bug: { groupBy: jest.fn().mockResolvedValue([]) },
      testSuite: { update: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TestRollupService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(TestRollupService);
  });

  describe('recompute — the one denormalised column', () => {
    it('stamps lastRunAt from the newest ACTIVE case run', async () => {
      const ran = new Date('2026-08-20T10:00:00Z');
      prisma.testCase.aggregate.mockResolvedValue({ _max: { lastRunAt: ran } });

      await service.recompute(SUITE);

      expect(prisma.testCase.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { suiteId: SUITE, state: TestState.ACTIVE } }),
      );
      expect(prisma.testSuite.update).toHaveBeenCalledWith({
        where: { id: SUITE },
        data: { lastRunAt: ran },
      });
    });

    it('clears lastRunAt when nothing published has run', async () => {
      await service.recompute(SUITE);
      expect(prisma.testSuite.update).toHaveBeenCalledWith({
        where: { id: SUITE },
        data: { lastRunAt: null },
      });
    });

    it('writes through the surrounding transaction when one is passed', async () => {
      const tx = {
        testCase: { aggregate: jest.fn().mockResolvedValue({ _max: { lastRunAt: null } }) },
        testSuite: { update: jest.fn().mockResolvedValue({}) },
      };

      await service.recompute(SUITE, tx as any);

      expect(tx.testSuite.update).toHaveBeenCalled();
      expect(prisma.testSuite.update).not.toHaveBeenCalled();
    });
  });

  describe('forSuites — counts published cases only', () => {
    it('asks Prisma only for ACTIVE cases, so drafts and archives never count', async () => {
      await service.forSuites([SUITE]);

      expect(prisma.testCase.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { suiteId: { in: [SUITE] }, state: TestState.ACTIVE },
        }),
      );
    });

    it('buckets each result and derives the pass rate', async () => {
      prisma.testCase.groupBy.mockResolvedValue([
        { suiteId: SUITE, lastResult: TestResult.PASS, _count: { _all: 3 } },
        { suiteId: SUITE, lastResult: TestResult.FAIL, _count: { _all: 1 } },
        { suiteId: SUITE, lastResult: TestResult.NOT_RUN, _count: { _all: 4 } },
      ]);

      const rollup = await service.forSuite(SUITE);

      expect(rollup).toMatchObject({
        total: 8,
        pass: 3,
        fail: 1,
        blocked: 0,
        skipped: 0,
        notRun: 4,
        passRate: 38,
      });
    });

    it('reports a pass rate of 0 for an empty suite rather than dividing by zero', async () => {
      const rollup = await service.forSuite(SUITE);
      expect(rollup.passRate).toBe(0);
      expect(rollup.total).toBe(0);
    });

    it('counts only unsettled bugs as open', async () => {
      prisma.bug.groupBy.mockResolvedValue([{ suiteId: SUITE, _count: { _all: 2 } }]);

      const rollup = await service.forSuite(SUITE);

      expect(rollup.openBugs).toBe(2);
      expect(prisma.bug.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            suiteId: { in: [SUITE] },
            isArchived: false,
            status: { in: OPEN_BUG_STATUSES },
          },
        }),
      );
      expect(OPEN_BUG_STATUSES).not.toContain(BugStatus.CLOSED);
      expect(OPEN_BUG_STATUSES).not.toContain(BugStatus.VERIFIED);
      expect(OPEN_BUG_STATUSES).not.toContain(BugStatus.WONT_FIX);
    });

    it('keeps suites apart when several are rolled up at once', async () => {
      prisma.testCase.groupBy.mockResolvedValue([
        { suiteId: 'a', lastResult: TestResult.PASS, _count: { _all: 2 } },
        { suiteId: 'b', lastResult: TestResult.FAIL, _count: { _all: 1 } },
      ]);

      const map = await service.forSuites(['a', 'b']);

      expect(map.get('a')).toMatchObject({ pass: 2, fail: 0, passRate: 100 });
      expect(map.get('b')).toMatchObject({ pass: 0, fail: 1, passRate: 0 });
    });

    it('returns an empty map — and asks nothing — when there are no suites', async () => {
      const map = await service.forSuites([]);
      expect(map.size).toBe(0);
      expect(prisma.testCase.groupBy).not.toHaveBeenCalled();
    });
  });
});
