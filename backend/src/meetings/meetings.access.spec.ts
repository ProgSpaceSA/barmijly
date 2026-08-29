import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MeetingAccessService } from './meetings.access';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';

const MEETING = 'meeting-1';
const REQUIREMENT = 'req-1';
const COMPANY = 'company-1';
const OTHER_COMPANY = 'company-9';
const SYSTEM = 'system-1';
const OTHER_SYSTEM = 'system-9';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: COMPANY,
});

const LEADERSHIP = [
  UserRole.PROGRAMMING_HEAD,
  UserRole.PROJECT_MANAGER,
  UserRole.SENIOR_MANAGEMENT,
];

const READ_ONLY_ROLES = [UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA];

describe('MeetingAccessService', () => {
  let service: MeetingAccessService;
  let prisma: any;

  /** Pins the caller's company grants. No grants at all = org-wide. */
  const grantCompanies = (companyIds: string[]) => {
    prisma.userCompany.findMany.mockResolvedValue(companyIds.map((companyId) => ({ companyId })));
  };

  const grantSystems = (systemIds: string[]) => {
    prisma.userSystem.findMany.mockResolvedValue(systemIds.map((systemId) => ({ systemId })));
  };

  beforeEach(async () => {
    prisma = {
      meeting: {
        findUnique: jest.fn().mockResolvedValue({ id: MEETING, companyId: COMPANY }),
      },
      requirement: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: REQUIREMENT, companyId: COMPANY, systemId: SYSTEM }),
      },
      meetingPoint: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'point-1',
          meetingId: MEETING,
          meeting: {
            id: MEETING,
            companyId: COMPANY,
            status: 'HELD',
            isArchived: false,
            title: 'مراجعة',
          },
        }),
      },
      system: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MeetingAccessService);
  });

  describe('the requester is locked out entirely', () => {
    it.each([
      ['meetingScope', (u: any) => service.meetingScope(u)],
      ['requirementScope', (u: any) => service.requirementScope(u)],
      ['loadVisibleMeeting', (u: any) => service.loadVisibleMeeting(MEETING, u)],
      ['loadVisibleRequirement', (u: any) => service.loadVisibleRequirement(REQUIREMENT, u)],
      ['loadVisiblePoint', (u: any) => service.loadVisiblePoint('point-1', u)],
    ])('refuses TICKET_REQUESTER on %s', async (_name, call) => {
      await expect(call(asUser(UserRole.TICKET_REQUESTER))).rejects.toThrow(ForbiddenException);
    });
  });

  describe('minutes are leadership-only', () => {
    it.each(LEADERSHIP)('lets %s read the meetings list', async (role) => {
      await expect(service.meetingScope(asUser(role))).resolves.toBeDefined();
    });

    it.each(READ_ONLY_ROLES)('refuses %s the meetings list', async (role) => {
      await expect(service.meetingScope(asUser(role))).rejects.toThrow(ForbiddenException);
    });

    it.each(READ_ONLY_ROLES)('refuses %s a meeting by id', async (role) => {
      await expect(service.loadVisibleMeeting(MEETING, asUser(role))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('leaves an unassigned head of programming unrestricted', async () => {
      await expect(service.meetingScope(asUser(UserRole.PROGRAMMING_HEAD))).resolves.toEqual({});
    });

    it('narrows a project manager to the companies they hold', async () => {
      grantCompanies([COMPANY]);
      await expect(service.meetingScope(asUser(UserRole.PROJECT_MANAGER))).resolves.toEqual({
        companyId: { in: [COMPANY] },
      });
    });

    it('404s a meeting that does not exist', async () => {
      prisma.meeting.findUnique.mockResolvedValue(null);
      await expect(
        service.loadVisibleMeeting(MEETING, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(NotFoundException);
    });

    it('403s a meeting in another company rather than hiding it as a 404', async () => {
      grantCompanies([OTHER_COMPANY]);
      await expect(
        service.loadVisibleMeeting(MEETING, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('the backlog is wider than the minutes', () => {
    it.each([...LEADERSHIP, ...READ_ONLY_ROLES])('lets %s read requirements', async (role) => {
      await expect(service.requirementScope(asUser(role))).resolves.toBeDefined();
    });

    it('filters leadership by company', async () => {
      grantCompanies([COMPANY]);
      await expect(service.requirementScope(asUser(UserRole.PROJECT_MANAGER))).resolves.toEqual({
        companyId: { in: [COMPANY] },
      });
    });

    it('filters everyone else by the systems they hold', async () => {
      grantSystems([SYSTEM]);
      await expect(service.requirementScope(asUser(UserRole.SYSTEM_OWNER))).resolves.toEqual({
        systemId: { in: [SYSTEM] },
      });
    });

    it.each(READ_ONLY_ROLES)(
      'never hands %s an unpinned requirement, even org-wide',
      async (role) => {
        // No grants at all: `visibleSystemIds` would return null for the
        // org-wide roles, which must still exclude systemId: null.
        const scope = await service.requirementScope(asUser(role));
        expect(scope).not.toEqual({});
        expect(JSON.stringify(scope)).toContain('systemId');
      },
    );

    it('refuses a SYSTEM_OWNER a requirement that is not pinned yet', async () => {
      grantSystems([SYSTEM]);
      prisma.requirement.findUnique.mockResolvedValue({
        id: REQUIREMENT,
        companyId: COMPANY,
        systemId: null,
      });
      await expect(
        service.loadVisibleRequirement(REQUIREMENT, asUser(UserRole.SYSTEM_OWNER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('hands leadership the same unpinned requirement', async () => {
      prisma.requirement.findUnique.mockResolvedValue({
        id: REQUIREMENT,
        companyId: COMPANY,
        systemId: null,
      });
      await expect(
        service.loadVisibleRequirement(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD)),
      ).resolves.toMatchObject({ id: REQUIREMENT });
    });

    it('refuses a requirement pinned to a system the reader is not on', async () => {
      grantSystems([OTHER_SYSTEM]);
      await expect(
        service.loadVisibleRequirement(REQUIREMENT, asUser(UserRole.DEVELOPER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s a requirement that does not exist', async () => {
      prisma.requirement.findUnique.mockResolvedValue(null);
      await expect(
        service.loadVisibleRequirement(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('points answer to their meeting', () => {
    it('loads a point for leadership in the same company', async () => {
      await expect(
        service.loadVisiblePoint('point-1', asUser(UserRole.PROGRAMMING_HEAD)),
      ).resolves.toMatchObject({ id: 'point-1' });
    });

    it('404s a point that belongs to a different meeting', async () => {
      await expect(
        service.loadVisiblePoint('point-1', asUser(UserRole.PROGRAMMING_HEAD), 'meeting-other'),
      ).rejects.toThrow(NotFoundException);
    });

    it('403s a point whose meeting sits in another company', async () => {
      grantCompanies([OTHER_COMPANY]);
      await expect(
        service.loadVisiblePoint('point-1', asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('isLeadership', () => {
    it.each(LEADERSHIP)('is true for %s', (role) => {
      expect(service.isLeadership(asUser(role))).toBe(true);
    });

    it.each([...READ_ONLY_ROLES, UserRole.TICKET_REQUESTER])('is false for %s', (role) => {
      expect(service.isLeadership(asUser(role))).toBe(false);
    });
  });
});
