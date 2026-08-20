import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import type { Actor } from '../access/permissions';
import { Prisma, TicketStatus, Priority, UserRole } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService, private access: AccessService) {}

  /**
   * Dashboard numbers must count exactly the tickets the user can open, so the
   * scope comes from the same resolver as the ticket list rather than a second
   * copy of the rules.
   */
  private async buildVisibilityWhere(
    userId: string,
    role: UserRole,
    companyId?: string,
  ): Promise<Prisma.TicketWhereInput> {
    const scope = await this.access.ticketScope({ id: userId, role });
    const companyFilter: Prisma.TicketWhereInput = companyId ? { companyId } : {};

    if (!scope) return companyFilter;
    return companyId ? { AND: [companyFilter, scope] } : scope;
  }

  async getDashboardStats(userId: string, role: UserRole, companyId?: string) {
    const where = await this.buildVisibilityWhere(userId, role, companyId);

    const [
      totalTickets,
      openTickets,
      inProgressTickets,
      overdueTickets,
      criticalTickets,
      ticketsByStatus,
      ticketsByPriority,
    ] = await Promise.all([
      this.prisma.ticket.count({ where: { ...where, isArchived: false } }),
      this.prisma.ticket.count({
        where: {
          ...where,
          isArchived: false,
          status: { notIn: [TicketStatus.CLOSED, TicketStatus.COMPLETED, TicketStatus.REJECTED] },
        },
      }),
      this.prisma.ticket.count({ where: { ...where, status: TicketStatus.IN_PROGRESS } }),
      this.prisma.ticket.count({
        where: {
          ...where,
          isArchived: false,
          estimatedDeadline: { lt: new Date() },
          status: { notIn: [TicketStatus.CLOSED, TicketStatus.COMPLETED] },
        },
      }),
      this.prisma.ticket.count({ where: { ...where, finalPriority: Priority.CRITICAL, isArchived: false } }),
      this.prisma.ticket.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.ticket.groupBy({ by: ['finalPriority'], where, _count: true }),
    ]);

    return {
      totalTickets,
      openTickets,
      inProgressTickets,
      overdueTickets,
      criticalTickets,
      ticketsByStatus,
      ticketsByPriority,
    };
  }

  async getDeveloperStats(user: Actor, _from?: Date, _to?: Date) {
    // Team load is reported for the caller's portfolio, not the whole group.
    const companyIds = await this.access.visibleCompanyIds(user);
    const developers = await this.prisma.user.findMany({
      where: {
        role: 'DEVELOPER',
        isActive: true,
        ...(companyIds === null
          ? {}
          : {
              OR: [
                { companyId: { in: companyIds } },
                { companies: { some: { companyId: { in: companyIds } } } },
                { systems: { some: { system: { companyId: { in: companyIds } } } } },
              ],
            }),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        assignments: {
          where: { isActive: true },
          include: {
            ticket: {
              select: { status: true, finalPriority: true, estimatedDeadline: true, createdAt: true },
            },
          },
        },
      },
    });

    return developers.map((dev) => {
      const assigned = dev.assignments.length;
      const completed = dev.assignments.filter(
        (a) => a.ticket.status === TicketStatus.COMPLETED || a.ticket.status === TicketStatus.CLOSED,
      ).length;
      const overdue = dev.assignments.filter(
        (a) =>
          a.ticket.estimatedDeadline &&
          a.ticket.estimatedDeadline < new Date() &&
          !([TicketStatus.CLOSED, TicketStatus.COMPLETED] as string[]).includes(a.ticket.status),
      ).length;

      return {
        id: dev.id,
        name: `${dev.firstName} ${dev.lastName}`,
        assigned,
        completed,
        overdue,
        completionRate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
      };
    });
  }

  async getSystemStats(user: Actor, companyId?: string) {
    const scope = await this.access.systemListWhere(user);
    const systems = await this.prisma.system.findMany({
      where: { ...scope, ...(companyId && { companyId }), isActive: true },
      include: {
        _count: { select: { tickets: true } },
        tickets: {
          select: { status: true, finalPriority: true },
        },
      },
    });

    return systems.map((s) => ({
      id: s.id,
      name: s.name,
      totalTickets: s._count.tickets,
      openTickets: s.tickets.filter(
        (t) => !([TicketStatus.CLOSED, TicketStatus.COMPLETED, TicketStatus.REJECTED] as string[]).includes(t.status),
      ).length,
      criticalTickets: s.tickets.filter((t) => t.finalPriority === Priority.CRITICAL).length,
    }));
  }

  async getCompanyStats(user: Actor, companyId?: string) {
    const scope = await this.access.companyListWhere(user);
    return this.prisma.company.findMany({
      where: { ...scope, ...(companyId && { id: companyId }) },
      include: {
        _count: { select: { tickets: true, users: true, systems: true } },
      },
    });
  }

  async getOverdueTickets(userId: string, role: UserRole, companyId?: string) {
    const where = await this.buildVisibilityWhere(userId, role, companyId);
    return this.prisma.ticket.findMany({
      where: {
        ...where,
        isArchived: false,
        estimatedDeadline: { lt: new Date() },
        status: { notIn: [TicketStatus.CLOSED, TicketStatus.COMPLETED, TicketStatus.REJECTED] },
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        system: true,
        company: true,
        assignments: { where: { isActive: true }, include: { developer: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { estimatedDeadline: 'asc' },
    });
  }

  async getTicketTrend(user: Actor, months = 6, companyId?: string) {
    const span = Math.min(24, Math.max(1, Number.isFinite(months) ? months : 6));
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - (span - 1), 1);

    const scope = await this.access.ticketScope(user);
    const filters: Prisma.TicketWhereInput = {
      ...(companyId && { companyId }),
      createdAt: { gte: from },
    };
    const tickets = await this.prisma.ticket.findMany({
      where: scope ? { AND: [filters, scope] } : filters,
      select: { createdAt: true, status: true },
    });

    const keys: string[] = [];
    for (let i = span - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const byMonth: Record<string, { created: number; closed: number }> = Object.fromEntries(
      keys.map((key) => [key, { created: 0, closed: 0 }]),
    );

    tickets.forEach((t) => {
      const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) return;
      byMonth[key].created++;
      if (t.status === TicketStatus.CLOSED || t.status === TicketStatus.COMPLETED) {
        byMonth[key].closed++;
      }
    });

    return keys.map((month) => ({ month, ...byMonth[month] }));
  }
}
