import { Test, TestingModule } from '@nestjs/testing';
import { TicketStatus, UserRole } from '@prisma/client';
import { ReportsService } from './reports.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';

/** Unscoped reader: the trend maths, not the scope, is what these cover. */
const TREND_READER = { id: 'head-1', role: UserRole.PROGRAMMING_HEAD };

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: { ticket: { findMany: jest.Mock } };

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 19, 12, 0, 0));

    prisma = {
      ticket: { findMany: jest.fn().mockResolvedValue([]) },
      // AccessService resolves the reader's portfolio before the trend query;
      // no grants keeps this reader org-wide, so the maths is what is measured.
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getTicketTrend', () => {
    it('returns six consecutive months including zeros', async () => {
      const rows = await service.getTicketTrend(TREND_READER, 6);

      expect(prisma.ticket.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { createdAt: { gte: new Date(2026, 2, 1) } },
        }),
      );
      expect(rows.map((r) => r.month)).toEqual([
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
        '2026-08',
      ]);
      expect(rows.every((r) => r.created === 0 && r.closed === 0)).toBe(true);
    });

    it('buckets created and currently-closed tickets into the matching month', async () => {
      prisma.ticket.findMany.mockResolvedValue([
        { createdAt: new Date(2026, 4, 10), status: TicketStatus.IN_PROGRESS },
        { createdAt: new Date(2026, 4, 20), status: TicketStatus.CLOSED },
        { createdAt: new Date(2026, 7, 2), status: TicketStatus.NEW },
      ]);

      const rows = await service.getTicketTrend(TREND_READER, 6);
      const byMonth = Object.fromEntries(rows.map((r) => [r.month, r]));

      expect(byMonth['2026-05']).toEqual({ month: '2026-05', created: 2, closed: 1 });
      expect(byMonth['2026-08']).toEqual({ month: '2026-08', created: 1, closed: 0 });
      expect(byMonth['2026-06']).toEqual({ month: '2026-06', created: 0, closed: 0 });
    });
  });
});
