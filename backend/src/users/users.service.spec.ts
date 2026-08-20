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
};

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: { findUnique: jest.Mock; update: jest.Mock };
    userSystem: { deleteMany: jest.Mock };
    userCompany: { deleteMany: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(existingUser),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existingUser, ...data })),
      },
      userSystem: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userCompany: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
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
});
