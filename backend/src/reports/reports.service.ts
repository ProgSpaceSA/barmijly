import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketStatus, Priority } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(companyId?: string) {
    const where = companyId ? { companyId } : {};

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

  async getDeveloperStats(from?: Date, to?: Date) {
    const dateFilter = from && to ? { createdAt: { gte: from, lte: to } } : {};

    const developers = await this.prisma.user.findMany({
      where: { role: 'DEVELOPER', isActive: true },
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

  async getSystemStats(companyId?: string) {
    const systems = await this.prisma.system.findMany({
      where: { ...(companyId && { companyId }), isActive: true },
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

  async getCompanyStats(companyId?: string) {
    const where = companyId ? { companyId } : {};
    return this.prisma.company.findMany({
      where: companyId ? { id: companyId } : {},
      include: {
        _count: { select: { tickets: true, users: true, systems: true } },
      },
    });
  }

  async getOverdueTickets(companyId?: string) {
    return this.prisma.ticket.findMany({
      where: {
        ...(companyId && { companyId }),
        isArchived: false,
        estimatedDeadline: { lt: new Date() },
        status: { notIn: [TicketStatus.CLOSED, TicketStatus.COMPLETED, TicketStatus.REJECTED] },
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
        system: true,
        assignments: { where: { isActive: true }, include: { developer: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { estimatedDeadline: 'asc' },
    });
  }

  async getTicketTrend(months = 6, companyId?: string) {
    const from = new Date();
    from.setMonth(from.getMonth() - months);

    const tickets = await this.prisma.ticket.findMany({
      where: {
        ...(companyId && { companyId }),
        createdAt: { gte: from },
      },
      select: { createdAt: true, status: true },
    });

    const byMonth: Record<string, { created: number; closed: number }> = {};
    tickets.forEach((t) => {
      const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { created: 0, closed: 0 };
      byMonth[key].created++;
      if (t.status === TicketStatus.CLOSED || t.status === TicketStatus.COMPLETED) {
        byMonth[key].closed++;
      }
    });

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({ month, ...stats }));
  }
}
