import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { UsersService } from './users.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const USER_ID = 'user-1';
const ACTOR = { id: 'actor-1', role: UserRole.PROGRAMMING_HEAD };

const existingUser = {
  id: USER_ID,
  firstName: 'محمد',
  lastName: 'العلي',
  email: 'user@company.com',
  role: UserRole.TICKET_REQUESTER,
  companyId: 'company-1',
  companies: [],
  systems: [],
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    userSystem: { deleteMany: jest.Mock; findMany: jest.Mock };
    userCompany: { deleteMany: jest.Mock; findMany: jest.Mock };
    system: { findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(existingUser),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...existingUser,
            ...data,
            companies: data.companies?.create?.map((c: { companyId: string }) => ({ companyId: c.companyId })) ?? [],
            systems: data.systems?.create?.map((s: { systemId: string }) => ({ systemId: s.systemId })) ?? [],
          }),
        ),
      },
      system: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('update — PM membership', () => {
    const pm = { id: 'pm-1', role: UserRole.PROJECT_MANAGER, companyId: null };
    const dev = {
      ...existingUser,
      role: UserRole.DEVELOPER,
      companies: [{ companyId: 'company-1' }],
      systems: [{ systemId: 'system-1' }],
    };

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(dev);
      prisma.system.findMany.mockResolvedValue([
        { id: 'system-1', companyId: 'company-1' },
        { id: 'system-2', companyId: 'company-1' },
      ]);
      prisma.userCompany.findMany.mockResolvedValue([{ companyId: 'company-1' }]);
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-1' }]);
    });

    it('allows a PM to patch dev/QA membership only', async () => {
      await service.update(
        USER_ID,
        { companyIds: ['company-1'], systemIds: ['system-2'] },
        pm,
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: 'company-1',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEMBERSHIP_CHANGE', userId: pm.id }),
      );
    });

    it('clears companyId when membership is emptied', async () => {
      await service.update(USER_ID, { companyIds: [], systemIds: [] }, pm);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: null }),
        }),
      );
    });

    it('refuses membership edits on non dev/QA users', async () => {
      prisma.user.findUnique.mockResolvedValue(existingUser);

      await expect(
        service.update(USER_ID, { companyIds: ['company-1'] }, pm),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update — role auditing', () => {
    it('logs ROLE_CHANGE with old and new role when the role changes', async () => {
      await service.update(USER_ID, { role: UserRole.DEVELOPER }, ACTOR);

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith({
        action: 'ROLE_CHANGE',
        entity: 'User',
        entityId: USER_ID,
        userId: ACTOR.id,
        oldValues: { role: UserRole.TICKET_REQUESTER },
        newValues: { role: UserRole.DEVELOPER },
      });
    });

    it('does not log when the submitted role matches the current role', async () => {
      await service.update(USER_ID, { role: UserRole.TICKET_REQUESTER }, ACTOR);

      expect(prisma.user.update).toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('does not log when the role is absent from the payload', async () => {
      await service.update(USER_ID, { firstName: 'أحمد' }, ACTOR);

      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses a role change with no actor to attribute it to', async () => {
      // An unattributable role change is exactly what the audit trail exists to
      // prevent, so it is refused rather than applied and left unlogged.
      await expect(service.update(USER_ID, { role: UserRole.DEVELOPER })).rejects.toThrow(
        ForbiddenException,
      );

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('logs only after the update succeeds', async () => {
      prisma.user.update.mockRejectedValueOnce(new Error('db down'));

      await expect(service.update(USER_ID, { role: UserRole.DEVELOPER }, ACTOR)).rejects.toThrow('db down');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('rejects an unknown user without updating or logging', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      await expect(service.update(USER_ID, { role: UserRole.DEVELOPER }, ACTOR)).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('update — persistence', () => {
    it('returns the updated user', async () => {
      const result = await service.update(USER_ID, { role: UserRole.QA }, ACTOR);

      expect(result).toMatchObject({ id: USER_ID, role: UserRole.QA });
    });

    it('writes the new role through to prisma', async () => {
      await service.update(USER_ID, { role: UserRole.QA }, ACTOR);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: USER_ID },
          data: expect.objectContaining({ role: UserRole.QA }),
        }),
      );
    });

    it('replaces company links rather than appending them', async () => {
      await service.update(USER_ID, { companyIds: ['company-2', 'company-3'] }, ACTOR);

      expect(prisma.userCompany.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companies: { create: [{ companyId: 'company-2' }, { companyId: 'company-3' }] },
          }),
        }),
      );
    });

    it('replaces system links rather than appending them', async () => {
      await service.update(USER_ID, { systemIds: ['system-1'] }, ACTOR);

      expect(prisma.userSystem.deleteMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ systems: { create: [{ systemId: 'system-1' }] } }),
        }),
      );
    });

    it('leaves company and system links untouched when neither is submitted', async () => {
      await service.update(USER_ID, { firstName: 'أحمد' }, ACTOR);

      expect(prisma.userCompany.deleteMany).not.toHaveBeenCalled();
      expect(prisma.userSystem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('findAll — directory', () => {
    it('lists only DEV and QA for a project manager', async () => {
      const pm = { id: 'pm-1', role: UserRole.PROJECT_MANAGER };
      prisma.user.findMany.mockResolvedValue([{ id: 'd1', role: UserRole.DEVELOPER }]);

      await service.findAll({}, pm);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { in: [UserRole.DEVELOPER, UserRole.QA] },
          }),
        }),
      );
    });

    it('does not role-narrow the list for programming head', async () => {
      await service.findAll({}, ACTOR);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            role: { in: [UserRole.DEVELOPER, UserRole.QA] },
          }),
        }),
      );
    });
  });

  describe('getDevelopers — portfolio vs roster', () => {
    it('scopes the default list to a PM portfolio', async () => {
      const pm = { id: 'pm-1', role: UserRole.PROJECT_MANAGER };
      prisma.user.findMany.mockResolvedValue([]);
      // AccessService reads portfolio through these mocks when visibleCompanyIds runs.
      (prisma as any).userCompany = {
        findMany: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]),
      };
      (prisma as any).userSystem = { findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).system = {
        ...(prisma as any).system,
        findMany: jest.fn().mockResolvedValue([{ id: 'system-1', companyId: 'company-1' }]),
      };

      await service.getDevelopers(pm);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: UserRole.DEVELOPER,
            isActive: true,
            OR: expect.any(Array),
          }),
        }),
      );
    });

    it('returns the full pool when pool=roster for a PM', async () => {
      const pm = { id: 'pm-1', role: UserRole.PROJECT_MANAGER };
      prisma.user.findMany.mockResolvedValue([]);

      await service.getDevelopers(pm, undefined, { pool: 'roster' });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: UserRole.DEVELOPER, isActive: true },
        }),
      );
    });
  });
});
