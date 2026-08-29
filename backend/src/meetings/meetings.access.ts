import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { Action, Actor, assertCan, can, rolesWith } from '../access/permissions';

export type MeetingActor = Actor & { companyId?: string | null };

/**
 * Scope for meetings and requirements, mirroring `TestingAccessService`.
 *
 * `permissions.ts` answers "may this role ever open a meeting?"; this answers
 * "may they open *that* meeting". The two surfaces hang off different anchors
 * and so scope differently:
 *
 * - A **meeting** belongs to exactly one company, and only leadership holds
 *   `meeting:read` at all, so company visibility is the whole answer.
 * - A **requirement** is the backlog. Leadership sees its companies; everybody
 *   else sees only requirements already pinned to a system they can reach.
 *   An unpinned requirement (`systemId: null`) is still being triaged and is
 *   nobody else's business — `IN (...)` never matches NULL, which is what keeps
 *   it hidden, and the `not: null` branch below keeps that true for the
 *   org-wide roles too.
 */
@Injectable()
export class MeetingAccessService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  // ------------------------------------------------------------------ scope

  /** Prisma filter for the meetings list. Empty object means "no restriction". */
  async meetingScope(user: MeetingActor): Promise<Prisma.MeetingWhereInput> {
    assertCan(user, 'meeting:read');
    const ids = await this.access.visibleCompanyIds(user);
    return ids === null ? {} : { companyId: { in: ids } };
  }

  /** Prisma filter for the requirements backlog. */
  async requirementScope(user: MeetingActor): Promise<Prisma.RequirementWhereInput> {
    assertCan(user, 'requirement:read');

    if (this.isLeadership(user)) {
      const companyIds = await this.access.visibleCompanyIds(user);
      return companyIds === null ? {} : { companyId: { in: companyIds } };
    }

    const systemIds = await this.access.visibleSystemIds(user);
    return systemIds === null ? { systemId: { not: null } } : { systemId: { in: systemIds } };
  }

  // ------------------------------------------------------------------ loads

  /**
   * Loads a meeting the caller may see. 404 when it does not exist, 403 when it
   * exists but sits in another company — never leaks one as the other.
   */
  async loadVisibleMeeting<T extends Prisma.MeetingDefaultArgs>(
    id: string,
    user: MeetingActor,
    args?: T,
  ): Promise<Prisma.MeetingGetPayload<T>> {
    assertCan(user, 'meeting:read');
    const meeting = await this.prisma.meeting.findUnique({
      where: { id },
      ...(args ?? {}),
    } as any);
    if (!meeting) throw new NotFoundException('Meeting not found');
    await this.access.assertCanViewCompany((meeting as { companyId: string }).companyId, user);
    return meeting as Prisma.MeetingGetPayload<T>;
  }

  async loadVisibleRequirement<T extends Prisma.RequirementDefaultArgs>(
    id: string,
    user: MeetingActor,
    args?: T,
  ): Promise<Prisma.RequirementGetPayload<T>> {
    assertCan(user, 'requirement:read');
    const requirement = await this.prisma.requirement.findUnique({
      where: { id },
      ...(args ?? {}),
    } as any);
    if (!requirement) throw new NotFoundException('Requirement not found');
    await this.assertCanViewRequirement(
      requirement as { companyId: string; systemId: string | null },
      user,
    );
    return requirement as Prisma.RequirementGetPayload<T>;
  }

  /**
   * Loads a minutes line together with the meeting that governs it. The meeting
   * is always fetched — a point carries no scope of its own, so one loaded
   * without it cannot be checked.
   */
  async loadVisiblePoint(id: string, user: MeetingActor, meetingId?: string) {
    assertCan(user, 'meeting:read');
    const point = await this.prisma.meetingPoint.findUnique({
      where: { id },
      include: {
        meeting: {
          select: {
            id: true,
            companyId: true,
            status: true,
            isArchived: true,
            title: true,
            meetingNumber: true,
          },
        },
      },
    });
    if (!point) throw new NotFoundException('Meeting point not found');
    if (meetingId && point.meetingId !== meetingId) {
      throw new NotFoundException('Meeting point not found');
    }
    await this.access.assertCanViewCompany(point.meeting.companyId, user);
    return point;
  }

  // ------------------------------------------------------------------ gates

  /** Editing the meeting or its minutes. */
  assertCanManage(user: MeetingActor): void {
    assertCan(user, 'meeting:manage');
  }

  /** The scope half of the requirement check, split out for the loaders. */
  async assertCanViewRequirement(
    requirement: { companyId: string; systemId: string | null },
    user: MeetingActor,
  ): Promise<void> {
    if (this.isLeadership(user)) {
      await this.access.assertCanViewCompany(requirement.companyId, user);
      return;
    }
    if (!requirement.systemId) throw new ForbiddenException('Access denied');
    await this.access.assertCanViewSystem(requirement.systemId, user);
  }

  /**
   * Whether the caller runs this surface rather than merely reading it.
   *
   * `requirement:triage` is the marker because it is held by exactly the three
   * roles the plan calls leadership, and it is the action that decides what a
   * requirement *is* — pinning its system, its owner and its status.
   */
  isLeadership(user: MeetingActor | undefined): boolean {
    return can(user?.role, 'requirement:triage');
  }

  /**
   * Leadership who should hear that a requirement was raised in this company.
   *
   * Mirrors `portfolioScope`: an account with no company or system grant is
   * org-wide and hears about everything, and the moment it is given a portfolio
   * it hears only about that. Without this a group with four companies would
   * page every manager on every ask.
   */
  async triageRecipients(companyId: string, exceptUserId?: string): Promise<string[]> {
    const candidates = await this.prisma.user.findMany({
      where: { role: { in: rolesWith('requirement:triage') }, isActive: true },
      select: {
        id: true,
        companyId: true,
        companies: { where: { companyId }, select: { companyId: true } },
        _count: { select: { companies: true, systems: true } },
      },
    });

    return candidates
      .filter((c) => {
        if (c.id === exceptUserId) return false;
        const hasPortfolio = c._count.companies > 0 || c._count.systems > 0;
        if (!hasPortfolio) return true;
        return c.companies.length > 0 || c.companyId === companyId;
      })
      .map((c) => c.id);
  }

  // ---------------------------------------------------------------- helpers

  /** Re-exported so services gate on the matrix without a second import. */
  can(user: MeetingActor | undefined, action: Action): boolean {
    return can(user?.role, action);
  }

  assertCan(user: MeetingActor | undefined, action: Action): void {
    assertCan(user, action);
  }
}
