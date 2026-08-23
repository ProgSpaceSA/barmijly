import {
  Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { can, rolesWith } from '../access/permissions';
import {
  buildSystemsByCompany,
  mergeMembershipGrants,
  normalizeMembershipGrants,
} from '../access/membership.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/** Roles that carry administrative reach and cannot be handed out casually. */
const PRIVILEGED_ROLES: UserRole[] = [
  UserRole.PROGRAMMING_HEAD,
  UserRole.PROJECT_MANAGER,
  UserRole.SENIOR_MANAGEMENT,
];

const MEMBERSHIP_ROLES: UserRole[] = [UserRole.DEVELOPER, UserRole.QA];

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private audit: AuditService,
  ) {}

  /**
   * The mention picker. With a `ticketId` it returns exactly the people the API
   * will accept a mention for, so the dropdown cannot offer a name that is then
   * silently dropped on save. Without one it falls back to the caller's own
   * reach — an unrestricted list here is a staff directory with emails.
   */
  async findMentionable(user: any, ticketId?: string) {
    if (ticketId) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, creatorId: true, systemOwnerId: true, systemId: true, companyId: true },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      await this.access.assertCanViewTicket(ticketId, user);

      const candidates = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, role: true, email: true, companyId: true },
        orderBy: { firstName: 'asc' },
      });
      const allowed = new Set(
        await this.access.filterMentionable(
          ticket,
          candidates.map((c) => c.id),
        ),
      );
      return candidates.filter((c) => allowed.has(c.id));
    }

    const companyIds = await this.access.visibleCompanyIds(user);

    return this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(companyIds === null
          ? {}
          : {
              OR: [
                { role: { in: rolesWith('ticket:read-all') } },
                { companyId: { in: companyIds } },
                { companies: { some: { companyId: { in: companyIds } } } },
              ],
            }),
      },
      select: { id: true, firstName: true, lastName: true, role: true, email: true, companyId: true },
      orderBy: { firstName: 'asc' },
    });
  }

  async findAll(
    filters: { role?: UserRole; companyId?: string; isActive?: boolean },
    actor?: any,
  ) {
    const directoryOnly = actor && can(actor.role, 'user:read-directory') && !can(actor.role, 'user:read');

    return this.prisma.user.findMany({
      where: {
        ...(directoryOnly && { role: { in: MEMBERSHIP_ROLES } }),
        ...(filters.role && { role: filters.role }),
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(filters.isActive !== undefined && { isActive: filters.isActive }),
      },
      include: {
        company: true,
        department: true,
        companies: { include: { company: true } },
        systems: {
          include: {
            system: {
              select: {
                id: true,
                name: true,
                companyId: true,
                company: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        company: true,
        department: true,
        companies: { include: { company: true } },
        systems: { include: { system: { include: { company: { select: { id: true, name: true } } } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getUserComments(userId: string) {
    await this.findOne(userId);
    return this.prisma.ticketComment.findMany({
      where: {
        OR: [
          { authorId: userId },
          { mentions: { has: userId } },
        ],
      },
      include: {
        author: { select: { id: true, firstName: true, lastName: true } },
        ticket: { select: { id: true, title: true, ticketNumber: true, status: true } },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateUserDto, actor?: any) {
    // Same escalation guard as update() — creating an account with a role is
    // granting that role.
    if (PRIVILEGED_ROLES.includes(dto.role) && !can(actor?.role, 'user:assign-role')) {
      throw new ForbiddenException('Only the head of programming can create a privileged role');
    }

    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already in use');

    const { systemIds, password, ...data } = dto;
    const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

    return this.prisma.user.create({
      data: {
        ...data,
        ...(hashedPassword && { password: hashedPassword }),
        ...(systemIds && {
          systems: {
            create: systemIds.map((systemId) => ({ systemId })),
          },
        }),
      },
      include: { company: true, department: true, systems: { include: { system: true } } },
    });
  }

  async update(id: string, dto: UpdateUserDto, actor?: any) {
    const existing = await this.findOne(id);
    const membershipOnly =
      actor &&
      can(actor.role, 'user:manage-membership') &&
      !can(actor.role, 'user:manage');

    if (membershipOnly) {
      this.access.assertCanManageUserMembership(actor, existing);
      const { companyIds, systemIds } = dto as any;
      if (companyIds === undefined && systemIds === undefined) {
        throw new BadRequestException('Nothing to update');
      }
      if (
        dto.firstName !== undefined ||
        dto.lastName !== undefined ||
        dto.role !== undefined ||
        dto.companyId !== undefined ||
        dto.departmentId !== undefined ||
        dto.password !== undefined
      ) {
        throw new ForbiddenException('Only project membership can be changed');
      }
      return this.applyMembershipChange(id, existing, companyIds, systemIds, actor);
    }

    const { systemIds, companyIds, ...data } = dto as any;

    if (data.role !== undefined && data.role !== existing.role) {
      // Granting a role is granting every permission behind it, so it is gated
      // separately from ordinary profile edits.
      if (!can(actor?.role, 'user:assign-role')) {
        throw new ForbiddenException('Only the head of programming can change roles');
      }
      if (actor?.id === id) {
        throw new BadRequestException('Cannot change your own role');
      }
    }

    let resolvedCompanyIds = companyIds as string[] | undefined;
    let resolvedSystemIds = systemIds as string[] | undefined;

    if (companyIds !== undefined || systemIds !== undefined) {
      const allSystems = await this.prisma.system.findMany({
        where: { isActive: true },
        select: { id: true, companyId: true },
      });
      const systemsByCompany = buildSystemsByCompany(allSystems);
      const nextCompanyIds = companyIds ?? existing.companies.map((c) => c.companyId);
      const nextSystemIds = systemIds ?? existing.systems.map((s) => s.systemId);
      const normalized = normalizeMembershipGrants(
        nextCompanyIds,
        nextSystemIds,
        systemsByCompany,
      );
      resolvedCompanyIds = normalized.companyIds;
      resolvedSystemIds = normalized.systemIds;
    }

    if (systemIds !== undefined) {
      await this.prisma.userSystem.deleteMany({ where: { userId: id } });
    }

    if (companyIds !== undefined) {
      await this.prisma.userCompany.deleteMany({ where: { userId: id } });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        ...(resolvedCompanyIds !== undefined
          ? { companyId: resolvedCompanyIds.length ? resolvedCompanyIds[0] : null }
          : {}),
        ...(resolvedSystemIds && {
          systems: { create: resolvedSystemIds.map((systemId: string) => ({ systemId })) },
        }),
        ...(resolvedCompanyIds && {
          companies: {
            create: resolvedCompanyIds.map((companyId: string) => ({ companyId })),
          },
        }),
      },
      include: {
        company: true,
        department: true,
        systems: {
          include: {
            system: {
              select: {
                id: true,
                name: true,
                companyId: true,
                company: { select: { id: true, name: true } },
              },
            },
          },
        },
        companies: { include: { company: true } },
      },
    });

    if (actor?.id && (companyIds !== undefined || systemIds !== undefined)) {
      await this.audit.log({
        action: 'MEMBERSHIP_CHANGE',
        entity: 'User',
        entityId: id,
        userId: actor.id,
        oldValues: {
          companyIds: existing.companies.map((c) => c.companyId),
          systemIds: existing.systems.map((s) => s.systemId),
        },
        newValues: {
          companyIds: updated.companies.map((c) => c.companyId),
          systemIds: updated.systems.map((s) => s.systemId),
        },
      });
    }

    if (actor?.id && data.role && data.role !== existing.role) {
      await this.audit.log({
        action: 'ROLE_CHANGE',
        entity: 'User',
        entityId: id,
        userId: actor.id,
        oldValues: { role: existing.role },
        newValues: { role: data.role },
      });
    }

    return updated;
  }

  private async applyMembershipChange(
    id: string,
    existing: Awaited<ReturnType<UsersService['findOne']>>,
    companyIds: string[] | undefined,
    systemIds: string[] | undefined,
    actor: any,
  ) {
    const allSystems = await this.prisma.system.findMany({
      where: { isActive: true },
      select: { id: true, companyId: true },
    });
    const systemsByCompany = buildSystemsByCompany(allSystems);
    const scope = await this.access.editableMembershipScope(actor);

    const existingGrants = {
      companyIds: existing.companies.map((c) => c.companyId),
      systemIds: existing.systems.map((s) => s.systemId),
    };

    const patch = {
      companyIds: companyIds ?? existingGrants.companyIds.filter((cid) =>
        scope.companyIds?.includes(cid),
      ),
      systemIds: systemIds ?? existingGrants.systemIds.filter((sid) =>
        scope.systemIds?.includes(sid),
      ),
    };

    const merged = mergeMembershipGrants(
      existingGrants,
      patch,
      scope.companyIds,
      scope.systemIds,
      systemsByCompany,
    );

    await this.prisma.userSystem.deleteMany({ where: { userId: id } });
    await this.prisma.userCompany.deleteMany({ where: { userId: id } });

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        // Always rewrite the legacy single-company FK so the list column and
        // reopen-edit tree match UserCompany after a clear or company switch.
        companyId: merged.companyIds.length ? merged.companyIds[0] : null,
        ...(merged.systemIds.length
          ? { systems: { create: merged.systemIds.map((systemId) => ({ systemId })) } }
          : {}),
        ...(merged.companyIds.length
          ? { companies: { create: merged.companyIds.map((companyId) => ({ companyId })) } }
          : {}),
      },
      include: {
        company: true,
        department: true,
        systems: {
          include: {
            system: {
              select: {
                id: true,
                name: true,
                companyId: true,
                company: { select: { id: true, name: true } },
              },
            },
          },
        },
        companies: { include: { company: true } },
      },
    });

    await this.audit.log({
      action: 'MEMBERSHIP_CHANGE',
      entity: 'User',
      entityId: id,
      userId: actor.id,
      oldValues: existingGrants,
      newValues: {
        companyIds: updated.companies.map((c) => c.companyId),
        systemIds: updated.systems.map((s) => s.systemId),
      },
    });

    return updated;
  }

  async deactivate(id: string, actor?: any) {
    await this.findOne(id);
    // Locking yourself out is never the intent, and it can strip the last head.
    if (actor?.id === id) throw new BadRequestException('Cannot deactivate your own account');
    return this.prisma.user.update({ where: { id }, data: { isActive: false } });
  }

  async activate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({ where: { id }, data: { isActive: true } });
  }

  /**
   * Developers the caller may filter or assign by.
   *
   * - With `ticketId`: people assignable to that ticket.
   * - With `pool=roster`: every active developer (PM/head staffing a system).
   * - Default: caller's company/portfolio reach — tickets assignment chips and
   *   reports use this so a PM only sees developers in their portfolio.
   */
  async getDevelopers(
    user: any,
    ticketId?: string,
    opts?: { pool?: 'roster' },
  ) {
    if (ticketId) {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, creatorId: true, systemOwnerId: true, systemId: true, companyId: true },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      await this.access.assertCanViewTicket(ticketId, user);
      return this.access.assignableDevelopers(ticket);
    }

    if (
      opts?.pool === 'roster' &&
      (can(user?.role, 'structure:manage-roster') || can(user?.role, 'user:read-directory'))
    ) {
      return this.prisma.user.findMany({
        where: { role: UserRole.DEVELOPER, isActive: true },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: { firstName: 'asc' },
      });
    }

    const companyIds = await this.access.visibleCompanyIds(user);
    return this.prisma.user.findMany({
      where: {
        role: UserRole.DEVELOPER,
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
      select: { id: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: 'asc' },
    });
  }
}
