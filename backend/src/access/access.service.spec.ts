import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AccessService } from './access.service';
import { PrismaService } from '../prisma/prisma.service';

const asUser = (role: UserRole, id = 'actor-1', companyId?: string) => ({ id, role, companyId });

/** Ticket in company-1 / system-1, filed by creator-1. */
const TICKET = {
  id: 'ticket-1',
  creatorId: 'creator-1',
  systemOwnerId: 'owner-1',
  systemId: 'system-1',
  companyId: 'company-1',
};

describe('AccessService', () => {
  let service: AccessService;
  let prisma: any;

  /** Points the membership lookups at a given set of grants. */
  const memberOf = ({ companies = [], systems = [] }: { companies?: string[]; systems?: string[] }) => {
    prisma.userCompany.findMany.mockResolvedValue(companies.map((companyId) => ({ companyId })));
    prisma.userSystem.findMany.mockResolvedValue(systems.map((systemId) => ({ systemId })));
  };

  beforeEach(async () => {
    prisma = {
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      system: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      ticket: { count: jest.fn().mockResolvedValue(0), findUnique: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AccessService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AccessService);
  });

  describe('ticketScope', () => {
    it.each([UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.QA, UserRole.SENIOR_MANAGEMENT])(
      '%s reads every ticket while unassigned',
      async (role) => {
        expect(await service.ticketScope(asUser(role))).toBeNull();
      },
    );

    describe('portfolio narrowing', () => {
      const PORTFOLIO_ROLES = [
        UserRole.PROGRAMMING_HEAD,
        UserRole.PROJECT_MANAGER,
        UserRole.QA,
        UserRole.SENIOR_MANAGEMENT,
      ];

      it.each(PORTFOLIO_ROLES)('narrows %s once companies are assigned', async (role) => {
        memberOf({ companies: ['company-1', 'company-2'] });
        const scope: any = await service.ticketScope(asUser(role, 'pm-1'));

        expect(scope.OR).toEqual([
          { creatorId: 'pm-1' },
          { companyId: { in: ['company-1', 'company-2'] } },
        ]);
      });

      it.each(PORTFOLIO_ROLES)('narrows %s to an assigned system', async (role) => {
        memberOf({ systems: ['system-1'] });
        const scope: any = await service.ticketScope(asUser(role, 'pm-1'));

        expect(scope.OR).toContainEqual({ systemId: { in: ['system-1'] } });
      });

      it('does not treat the home company as a portfolio assignment', async () => {
        // Almost every account has user.companyId set; reading that as a
        // portfolio would silently narrow the whole programming team.
        const scope = await service.ticketScope(
          asUser(UserRole.PROJECT_MANAGER, 'pm-1', 'company-9'),
        );
        expect(scope).toBeNull();
      });

      it('keeps their own tickets reachable outside the portfolio', async () => {
        memberOf({ companies: ['company-1'] });
        const scope: any = await service.ticketScope(asUser(UserRole.PROJECT_MANAGER, 'pm-1'));
        expect(scope.OR).toContainEqual({ creatorId: 'pm-1' });
      });
    });

    it('TICKET_REQUESTER sees only what they filed', async () => {
      expect(await service.ticketScope(asUser(UserRole.TICKET_REQUESTER))).toEqual({
        creatorId: 'actor-1',
      });
    });

    it('TICKET_REQUESTER stays scoped even with company grants', async () => {
      memberOf({ companies: ['company-1'] });
      expect(await service.ticketScope(asUser(UserRole.TICKET_REQUESTER))).toEqual({
        creatorId: 'actor-1',
      });
    });

    it('DEVELOPER reaches assignments, tasks, mentions and their systems', async () => {
      memberOf({ systems: ['system-1'], companies: ['company-1'] });
      const scope: any = await service.ticketScope(asUser(UserRole.DEVELOPER, 'dev-1'));

      expect(scope.OR).toEqual([
        { assignments: { some: { developerId: 'dev-1', isActive: true } } },
        { tasks: { some: { assignedToId: 'dev-1' } } },
        { comments: { some: { mentions: { hasSome: ['dev-1'] } } } },
        { systemId: { in: ['system-1'] } },
        { companyId: { in: ['company-1'] } },
      ]);
    });

    it('DEVELOPER with no grants still reaches their own work only', async () => {
      const scope: any = await service.ticketScope(asUser(UserRole.DEVELOPER, 'dev-1'));
      expect(scope.OR).toHaveLength(3);
      expect(scope.OR).not.toContainEqual(expect.objectContaining({ companyId: expect.anything() }));
    });

    it('SYSTEM_OWNER falls back to their companies when no system is granted', async () => {
      memberOf({ companies: ['company-1'] });
      const scope: any = await service.ticketScope(asUser(UserRole.SYSTEM_OWNER, 'owner-1'));

      expect(scope.OR).toEqual([
        { creatorId: 'owner-1' },
        { systemOwnerId: 'owner-1' },
        { companyId: { in: ['company-1'] } },
      ]);
    });

    it('SYSTEM_OWNER narrows to granted systems, dropping the company net', async () => {
      memberOf({ companies: ['company-1'], systems: ['system-1'] });
      const scope: any = await service.ticketScope(asUser(UserRole.SYSTEM_OWNER, 'owner-1'));

      expect(scope.OR).toContainEqual({ systemId: { in: ['system-1'] } });
      expect(scope.OR).not.toContainEqual({ companyId: { in: ['company-1'] } });
    });

    it('folds the legacy single companyId into the membership', async () => {
      const scope: any = await service.ticketScope(
        asUser(UserRole.SYSTEM_OWNER, 'owner-1', 'company-9'),
      );
      expect(scope.OR).toContainEqual({ companyId: { in: ['company-9'] } });
    });
  });

  describe('canViewTicket', () => {
    it('short-circuits for a read-all role without querying', async () => {
      expect(await service.canViewTicket('ticket-1', asUser(UserRole.PROGRAMMING_HEAD))).toBe(true);
      expect(prisma.ticket.count).not.toHaveBeenCalled();
    });

    it('asks the database with the scope applied for a narrowed role', async () => {
      prisma.ticket.count.mockResolvedValue(1);
      expect(await service.canViewTicket('ticket-1', asUser(UserRole.TICKET_REQUESTER))).toBe(true);
      expect(prisma.ticket.count).toHaveBeenCalledWith({
        where: { AND: [{ id: 'ticket-1' }, { creatorId: 'actor-1' }] },
      });
    });

    it('denies when the scoped count comes back empty', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      await expect(
        service.assertCanViewTicket('ticket-1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('loadVisibleTicket', () => {
    it('reports a missing ticket as 404, not 403', async () => {
      prisma.ticket.findUnique.mockResolvedValue(null);
      await expect(
        service.loadVisibleTicket('ticket-x', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(NotFoundException);
    });

    it('reports an out-of-scope ticket as 403', async () => {
      prisma.ticket.findUnique.mockResolvedValue(TICKET);
      prisma.ticket.count.mockResolvedValue(0);
      await expect(
        service.loadVisibleTicket('ticket-1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('commentVisibilityWhere', () => {
    it.each([UserRole.TICKET_REQUESTER, UserRole.SYSTEM_OWNER])('hides INTERNAL from %s', (role) => {
      expect(service.commentVisibilityWhere(asUser(role))).toEqual({ visibility: 'PUBLIC' });
    });

    it.each([UserRole.DEVELOPER, UserRole.QA, UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD])(
      'shows INTERNAL to %s',
      (role) => {
        expect(service.commentVisibilityWhere(asUser(role))).toEqual({});
      },
    );
  });

  describe('visibleSystemIds', () => {
    it('is unrestricted for the programming team', async () => {
      expect(await service.visibleSystemIds(asUser(UserRole.DEVELOPER))).toBeNull();
    });

    it('prefers explicit system grants over the company fallback', async () => {
      memberOf({ companies: ['company-1'], systems: ['system-1'] });
      expect(await service.visibleSystemIds(asUser(UserRole.TICKET_REQUESTER))).toEqual(['system-1']);
      expect(prisma.system.findMany).not.toHaveBeenCalled();
    });

    it('falls back to every system in the user companies', async () => {
      memberOf({ companies: ['company-1'] });
      prisma.system.findMany.mockResolvedValue([{ id: 'system-1' }, { id: 'system-2' }]);
      expect(await service.visibleSystemIds(asUser(UserRole.TICKET_REQUESTER))).toEqual([
        'system-1',
        'system-2',
      ]);
    });

    it('is empty for a user attached to nothing', async () => {
      expect(await service.visibleSystemIds(asUser(UserRole.TICKET_REQUESTER))).toEqual([]);
    });
  });

  describe('assertCanFileAgainst', () => {
    beforeEach(() => {
      memberOf({ systems: ['system-1'] });
      prisma.system.findUnique.mockResolvedValue({
        id: 'system-1',
        companyId: 'company-1',
        isActive: true,
      });
    });

    it('accepts a granted, active system in the stated company', async () => {
      await expect(
        service.assertCanFileAgainst('system-1', 'company-1', asUser(UserRole.TICKET_REQUESTER)),
      ).resolves.toBeUndefined();
    });

    it('rejects a system the user was never granted', async () => {
      memberOf({ systems: ['system-2'] });
      await expect(
        service.assertCanFileAgainst('system-1', 'company-1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a company that does not own the system', async () => {
      await expect(
        service.assertCanFileAgainst('system-1', 'company-9', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a deactivated system', async () => {
      prisma.system.findUnique.mockResolvedValue({
        id: 'system-1',
        companyId: 'company-1',
        isActive: false,
      });
      await expect(
        service.assertCanFileAgainst('system-1', 'company-1', asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s on an unknown system', async () => {
      prisma.system.findUnique.mockResolvedValue(null);
      await expect(
        service.assertCanFileAgainst('nope', 'company-1', asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assertIsAssignableDeveloper', () => {
    it('accepts an active developer', async () => {
      prisma.user.findUnique.mockResolvedValue({ role: UserRole.DEVELOPER, isActive: true });
      await expect(service.assertIsAssignableDeveloper('dev-1')).resolves.toBeUndefined();
    });

    it.each([
      ['a non-developer role', { role: UserRole.TICKET_REQUESTER, isActive: true }],
      ['a deactivated developer', { role: UserRole.DEVELOPER, isActive: false }],
    ])('rejects %s', async (_label, row) => {
      prisma.user.findUnique.mockResolvedValue(row);
      await expect(service.assertIsAssignableDeveloper('x')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('filterMentionable', () => {
    /** Builds the row shape the mention query returns. */
    const candidate = (over: Record<string, any>) => ({
      id: 'u1',
      role: UserRole.TICKET_REQUESTER,
      companyId: null,
      systems: [],
      companies: [],
      assignments: [],
      tasksAssigned: [],
      _count: { systems: 0, companies: 0 },
      ...over,
    });

    const withCandidates = (rows: any[]) => prisma.user.findMany.mockResolvedValue(rows);

    it('keeps roles that read every ticket', async () => {
      withCandidates([candidate({ id: 'qa-1', role: UserRole.QA })]);
      expect(await service.filterMentionable(TICKET, ['qa-1'])).toEqual(['qa-1']);
    });

    it('keeps the creator and the system owner', async () => {
      withCandidates([
        candidate({ id: 'creator-1' }),
        candidate({ id: 'owner-1', role: UserRole.SYSTEM_OWNER }),
      ]);
      expect(await service.filterMentionable(TICKET, ['creator-1', 'owner-1'])).toEqual([
        'creator-1',
        'owner-1',
      ]);
    });

    it('drops a requester who did not file the ticket', async () => {
      withCandidates([candidate({ id: 'other-1', companyId: 'company-1' })]);
      expect(await service.filterMentionable(TICKET, ['other-1'])).toEqual([]);
    });

    it('keeps a developer assigned to the ticket', async () => {
      withCandidates([
        candidate({ id: 'dev-1', role: UserRole.DEVELOPER, assignments: [{ id: 'a1' }] }),
      ]);
      expect(await service.filterMentionable(TICKET, ['dev-1'])).toEqual(['dev-1']);
    });

    it('drops a developer with no link to the ticket', async () => {
      withCandidates([candidate({ id: 'dev-2', role: UserRole.DEVELOPER })]);
      expect(await service.filterMentionable(TICKET, ['dev-2'])).toEqual([]);
    });

    it('drops a system owner whose grants point at another system', async () => {
      withCandidates([
        candidate({
          id: 'owner-2',
          role: UserRole.SYSTEM_OWNER,
          companies: [{ companyId: 'company-1' }],
          _count: { systems: 2, companies: 1 },
        }),
      ]);
      expect(await service.filterMentionable(TICKET, ['owner-2'])).toEqual([]);
    });

    it('returns early without a query for an empty list', async () => {
      expect(await service.filterMentionable(TICKET, [])).toEqual([]);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('only considers active accounts', async () => {
      withCandidates([]);
      await service.filterMentionable(TICKET, ['u1']);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }),
      );
    });
  });
});
