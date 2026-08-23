import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Action, Actor, assertCan, can, canManageStructure, rolesWith } from './permissions';

/** What a user is attached to. Empty arrays mean "attached to nothing". */
export interface Membership {
  /** Companies from UserCompany, plus the legacy single `user.companyId`. */
  companyIds: string[];
  /** Systems from UserSystem — always an explicit grant. */
  systemIds: string[];
  /**
   * Companies from `UserCompany` only.
   *
   * Deliberately excludes `user.companyId`: nearly every account carries a home
   * company, so treating that as a portfolio assignment would silently narrow
   * the whole programming team to one company. A row in the join table is the
   * only thing that counts as "this is the portfolio I was given".
   */
  grantedCompanyIds: string[];
}

/**
 * Row shape the ticket-scope rules need. Anything with these fields works, so
 * callers can pass a full ticket or a narrow `select`.
 */
export interface TicketScopeRef {
  id: string;
  creatorId: string;
  systemOwnerId?: string | null;
  systemId: string;
  companyId: string;
}

/**
 * Resolves *what* a user may touch, as opposed to `permissions.ts`, which
 * resolves *whether their role* may do a thing at all.
 *
 * Every list endpoint should filter through `ticketListWhere` (or the company /
 * system equivalents) and every by-id endpoint through `loadVisibleTicket`, so
 * that a detail view can never reveal a row the list would have hidden.
 */
@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  // ---------------------------------------------------------------- membership

  async membership(user: Actor & { companyId?: string | null }): Promise<Membership> {
    const [companies, systems] = await Promise.all([
      this.prisma.userCompany.findMany({ where: { userId: user.id }, select: { companyId: true } }),
      this.prisma.userSystem.findMany({ where: { userId: user.id }, select: { systemId: true } }),
    ]);

    const grantedCompanyIds = companies.map((c) => c.companyId);
    const companyIds = new Set(grantedCompanyIds);
    if (user.companyId) companyIds.add(user.companyId);

    return {
      companyIds: [...companyIds],
      systemIds: systems.map((s) => s.systemId),
      grantedCompanyIds,
    };
  }

  /**
   * Portfolio narrowing for the roles that are org-wide by default — the
   * programming team and senior management.
   *
   * Assigning a company or a system to one of these accounts is read as "this
   * is your patch"; from then on they see only that. With no assignment at all
   * they stay org-wide, which is what keeps an unconfigured install working and
   * lets a head of programming approve for the whole group (req.md §8, §21).
   *
   * Returns `null` for "no restriction".
   */
  private portfolioScope(
    user: Actor,
    membership: Membership,
  ): Prisma.TicketWhereInput | null {
    const { grantedCompanyIds, systemIds } = membership;
    if (!grantedCompanyIds.length && !systemIds.length) return null;

    return {
      OR: [
        // Their own tickets stay reachable even outside the portfolio.
        { creatorId: user.id },
        ...(systemIds.length ? [{ systemId: { in: systemIds } }] : []),
        ...(grantedCompanyIds.length ? [{ companyId: { in: grantedCompanyIds } }] : []),
      ],
    };
  }

  // ------------------------------------------------------------------- tickets

  /**
   * Prisma filter narrowing tickets to what this user may read, or `null` when
   * the role reads everything.
   *
   * The shapes below are the single definition of ticket visibility — reports,
   * the daily digest and the ticket list all consume this, so a user can never
   * see a ticket in one surface that is hidden in another.
   */
  async ticketScope(
    user: Actor & { companyId?: string | null },
  ): Promise<Prisma.TicketWhereInput | null> {
    const membership = await this.membership(user);
    const { companyIds, systemIds } = membership;

    // Org-wide by default, narrowed the moment a portfolio is assigned.
    if (can(user.role, 'ticket:read-all')) {
      return this.portfolioScope(user, membership);
    }

    if (user.role === UserRole.DEVELOPER) {
      return {
        OR: [
          { assignments: { some: { developerId: user.id, isActive: true } } },
          { tasks: { some: { assignedToId: user.id } } },
          { comments: { some: { mentions: { hasSome: [user.id] } } } },
          ...(systemIds.length ? [{ systemId: { in: systemIds } }] : []),
          ...(companyIds.length ? [{ companyId: { in: companyIds } }] : []),
        ],
      };
    }

    if (user.role === UserRole.SYSTEM_OWNER) {
      // An explicit system grant is the tighter statement of intent, so it wins
      // over the company fallback (req.md §16).
      const reach: Prisma.TicketWhereInput[] = systemIds.length
        ? [{ systemId: { in: systemIds } }]
        : companyIds.length
          ? [{ companyId: { in: companyIds } }]
          : [];
      return {
        OR: [{ creatorId: user.id }, { systemOwnerId: user.id }, ...reach],
      };
    }

    // TICKET_REQUESTER and anything new defaults to own tickets only.
    return { creatorId: user.id };
  }

  /** Same as `ticketScope`, flattened to a spreadable object. */
  async ticketListWhere(
    user: Actor & { companyId?: string | null },
  ): Promise<Prisma.TicketWhereInput> {
    return (await this.ticketScope(user)) ?? {};
  }

  async canViewTicket(ticketId: string, user: Actor & { companyId?: string | null }) {
    const scope = await this.ticketScope(user);
    if (!scope) return true;
    const count = await this.prisma.ticket.count({ where: { AND: [{ id: ticketId }, scope] } });
    return count > 0;
  }

  async assertCanViewTicket(ticketId: string, user: Actor & { companyId?: string | null }) {
    if (!(await this.canViewTicket(ticketId, user))) {
      throw new ForbiddenException('Access denied');
    }
  }

  /**
   * Loads a ticket the user is allowed to see. 404 when it does not exist, 403
   * when it exists but is out of scope — never leaks one as the other.
   */
  async loadVisibleTicket<T extends Prisma.TicketDefaultArgs>(
    ticketId: string,
    user: Actor & { companyId?: string | null },
    args?: T,
  ): Promise<Prisma.TicketGetPayload<T>> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      ...(args ?? {}),
    } as any);
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.assertCanViewTicket(ticketId, user);
    return ticket as Prisma.TicketGetPayload<T>;
  }

  /** Comment visibility filter for a reader — INTERNAL is programming team only. */
  commentVisibilityWhere(user: Actor): Prisma.TicketCommentWhereInput {
    return can(user.role, 'ticket:read-internal') ? {} : { visibility: 'PUBLIC' };
  }

  // ----------------------------------------------------------------- structure

  /** Companies the user may read, or `null` for unrestricted. */
  async visibleCompanyIds(
    user: Actor & { companyId?: string | null },
  ): Promise<string[] | null> {
    const membership = await this.membership(user);

    if (can(user.role, 'structure:read-all')) {
      const { grantedCompanyIds, systemIds } = membership;
      if (!grantedCompanyIds.length && !systemIds.length) return null;

      // A system grant implies its company, otherwise the ticket would be
      // readable while the company filter that lists it is not.
      const owning = systemIds.length
        ? await this.prisma.system.findMany({
            where: { id: { in: systemIds } },
            select: { companyId: true },
          })
        : [];
      return [...new Set([...grantedCompanyIds, ...owning.map((s) => s.companyId)])];
    }

    return membership.companyIds;
  }

  /**
   * Systems the user may read, or `null` for unrestricted.
   *
   * Explicit `UserSystem` grants win. Without any, the user falls back to every
   * system in their companies — otherwise a requester onboarded with only a
   * company could not file a ticket at all.
   */
  async visibleSystemIds(user: Actor & { companyId?: string | null }): Promise<string[] | null> {
    const membership = await this.membership(user);

    if (can(user.role, 'structure:read-all')) {
      const { grantedCompanyIds, systemIds } = membership;
      if (!grantedCompanyIds.length && !systemIds.length) return null;

      // Portfolio roles reach every system in an assigned company, plus any
      // system assigned to them directly.
      const inCompanies = grantedCompanyIds.length
        ? await this.prisma.system.findMany({
            where: { companyId: { in: grantedCompanyIds } },
            select: { id: true },
          })
        : [];
      return [...new Set([...systemIds, ...inCompanies.map((s) => s.id)])];
    }

    const { companyIds, systemIds } = membership;
    if (systemIds.length) return systemIds;
    if (!companyIds.length) return [];

    const systems = await this.prisma.system.findMany({
      where: { companyId: { in: companyIds } },
      select: { id: true },
    });
    return systems.map((s) => s.id);
  }

  async companyListWhere(
    user: Actor & { companyId?: string | null },
  ): Promise<Prisma.CompanyWhereInput> {
    const ids = await this.visibleCompanyIds(user);
    return ids === null ? {} : { id: { in: ids } };
  }

  async systemListWhere(
    user: Actor & { companyId?: string | null },
  ): Promise<Prisma.SystemWhereInput> {
    const ids = await this.visibleSystemIds(user);
    return ids === null ? {} : { id: { in: ids } };
  }

  async assertCanViewCompany(companyId: string, user: Actor & { companyId?: string | null }) {
    const ids = await this.visibleCompanyIds(user);
    if (ids !== null && !ids.includes(companyId)) throw new ForbiddenException('Access denied');
  }

  async assertCanViewSystem(systemId: string, user: Actor & { companyId?: string | null }) {
    const ids = await this.visibleSystemIds(user);
    if (ids !== null && !ids.includes(systemId)) throw new ForbiddenException('Access denied');
  }

  /**
   * Companies where the caller may create a system. Mirrors visible companies
   * for portfolio roles; org-wide when no portfolio is assigned.
   */
  async managedCompanyIds(user: Actor & { companyId?: string | null }): Promise<string[] | null> {
    return this.visibleCompanyIds(user);
  }

  async assertCanCreateSystem(user: Actor & { companyId?: string | null }, companyId: string) {
    if (canManageStructure(user?.role)) return;
    this.assertCan(user, 'structure:create-system');
    const managed = await this.managedCompanyIds(user);
    if (managed !== null && !managed.includes(companyId)) {
      throw new ForbiddenException('Access denied');
    }
  }

  async assertCanManageRoster(user: Actor & { companyId?: string | null }, systemId: string) {
    if (canManageStructure(user?.role)) return;
    this.assertCan(user, 'structure:manage-roster');
    await this.assertCanViewSystem(systemId, user);
  }

  /** Portfolio slice a PM may rewrite when patching dev/QA membership. */
  async editableMembershipScope(user: Actor & { companyId?: string | null }) {
    return {
      companyIds: await this.visibleCompanyIds(user),
      systemIds: await this.visibleSystemIds(user),
    };
  }

  assertCanManageUserMembership(
    actor: Actor & { companyId?: string | null },
    target: { id: string; role: UserRole },
  ) {
    if (can(actor?.role, 'user:manage')) return;
    this.assertCan(actor, 'user:manage-membership');
    if (target.role !== UserRole.DEVELOPER && target.role !== UserRole.QA) {
      throw new ForbiddenException('Membership can only be changed for developers and QA');
    }
  }

  /**
   * Validates the target of a new or moved ticket: the system must be live, sit
   * in the stated company, and be one the user is authorised for (req.md §16,
   * §21 — every request belongs to a specific system).
   */
  async assertCanFileAgainst(
    systemId: string,
    companyId: string,
    user: Actor & { companyId?: string | null },
  ) {
    const system = await this.prisma.system.findUnique({
      where: { id: systemId },
      select: { id: true, companyId: true, isActive: true },
    });
    if (!system) throw new NotFoundException('System not found');
    if (!system.isActive) throw new ForbiddenException('System is not active');
    if (system.companyId !== companyId) {
      throw new ForbiddenException('System does not belong to the given company');
    }
    await this.assertCanViewSystem(systemId, user);
  }

  // --------------------------------------------------------------------- users

  /**
   * The developer an assignment targets must be an active developer *and* be
   * able to reach the ticket — assigning work to somebody who cannot open it
   * produces a ticket nobody can move.
   */
  async assertIsAssignableDeveloper(developerId: string, ticket?: TicketScopeRef) {
    const developer = await this.prisma.user.findUnique({
      where: { id: developerId },
      select: { role: true, isActive: true },
    });
    if (!developer) throw new NotFoundException('Developer not found');
    if (developer.role !== UserRole.DEVELOPER || !developer.isActive) {
      throw new ForbiddenException('Assignee must be an active developer');
    }

    if (ticket) {
      const [reachable] = await this.filterMentionable(ticket, [developerId]);
      if (!reachable) {
        throw new ForbiddenException('Developer is not assigned to this system or company');
      }
    }
  }

  /**
   * Developers the caller may assign to a ticket: active, and inside the
   * ticket's system or company. Backs the assign picker so the dropdown cannot
   * offer a name the API will refuse.
   */
  async assignableDevelopers(ticket: TicketScopeRef) {
    const developers = await this.prisma.user.findMany({
      where: { role: UserRole.DEVELOPER, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: 'asc' },
    });

    const allowed = new Set(
      await this.filterMentionable(
        ticket,
        developers.map((d) => d.id),
      ),
    );
    return developers.filter((d) => allowed.has(d.id));
  }

  /**
   * Narrows a mention list to users who can actually open the ticket, so a
   * mention never notifies (or emails) somebody outside its scope.
   */
  async filterMentionable(ticket: TicketScopeRef, candidateIds: string[]): Promise<string[]> {
    const unique = [...new Set(candidateIds)].filter(Boolean);
    if (!unique.length) return [];

    const readAllRoles = rolesWith('ticket:read-all');
    const candidates = await this.prisma.user.findMany({
      where: { id: { in: unique }, isActive: true },
      select: {
        id: true,
        role: true,
        companyId: true,
        systems: { where: { systemId: ticket.systemId }, select: { systemId: true } },
        companies: { where: { companyId: ticket.companyId }, select: { companyId: true } },
        assignments: { where: { ticketId: ticket.id, isActive: true }, select: { id: true } },
        tasksAssigned: { where: { ticketId: ticket.id }, select: { id: true } },
        _count: { select: { systems: true, companies: true } },
      },
    });

    return candidates
      .filter((c) => {
        if (c.id === ticket.creatorId) return true;
        if (ticket.systemOwnerId && c.id === ticket.systemOwnerId) return true;

        const onSystem = c.systems.length > 0;
        const onCompany = c.companies.length > 0 || c.companyId === ticket.companyId;

        if (readAllRoles.includes(c.role)) {
          // Mirrors portfolioScope: org-wide until they are given a portfolio,
          // then only inside it.
          const hasPortfolio = c._count.systems > 0 || c._count.companies > 0;
          return !hasPortfolio || onSystem || c.companies.length > 0;
        }

        if (c.role === UserRole.DEVELOPER) {
          return (
            c.assignments.length > 0 || c.tasksAssigned.length > 0 || onSystem || onCompany
          );
        }
        if (c.role === UserRole.SYSTEM_OWNER) {
          // Mirrors ticketScope: explicit system grants override the company net.
          return c._count.systems > 0 ? onSystem : onCompany;
        }
        // TICKET_REQUESTER and unknown roles: only their own tickets, already
        // covered by the creator check above.
        return false;
      })
      .map((c) => c.id);
  }

  // ------------------------------------------------------------------- helpers

  /** Re-exported so services can gate on the matrix without a second import. */
  can(user: Actor | undefined, action: Action): boolean {
    return can(user?.role, action);
  }

  assertCan(user: Actor | undefined, action: Action): void {
    assertCan(user, action);
  }
}
