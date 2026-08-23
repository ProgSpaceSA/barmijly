import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { SystemsService } from './systems.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const SYSTEM_ID = 'sys-1';
const existing = { id: SYSTEM_ID, name: 'POS', isActive: false, companyId: 'company-1' };
const PM = { id: 'pm-1', role: UserRole.PROJECT_MANAGER, companyId: null };

describe('SystemsService', () => {
  let service: SystemsService;
  let prisma: {
    system: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
    userSystem: { upsert: jest.Mock; delete: jest.Mock };
    userCompany: { findMany: jest.Mock };
  };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      system: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findMany: jest.fn().mockResolvedValue([{ id: SYSTEM_ID, companyId: 'company-1' }]),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
        create: jest.fn().mockResolvedValue({ ...existing, isActive: true }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'dev-1',
          role: UserRole.DEVELOPER,
          isActive: true,
        }),
      },
      userSystem: {
        upsert: jest.fn().mockResolvedValue({ userId: 'dev-1', systemId: SYSTEM_ID }),
        delete: jest.fn().mockResolvedValue({ userId: 'dev-1', systemId: SYSTEM_ID }),
        findMany: jest.fn().mockResolvedValue([{ systemId: SYSTEM_ID }]),
      },
      userCompany: { findMany: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]) },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get<SystemsService>(SystemsService);
  });

  describe('activate', () => {
    it('sets isActive true', async () => {
      await service.activate(SYSTEM_ID);

      expect(prisma.system.update).toHaveBeenCalledWith({
        where: { id: SYSTEM_ID },
        data: { isActive: true },
      });
    });

    it('rejects an unknown system', async () => {
      prisma.system.findUnique.mockResolvedValue(null);

      await expect(service.activate('missing')).rejects.toThrow(NotFoundException);
      expect(prisma.system.update).not.toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('sets isActive false', async () => {
      await service.deactivate(SYSTEM_ID);

      expect(prisma.system.update).toHaveBeenCalledWith({
        where: { id: SYSTEM_ID },
        data: { isActive: false },
      });
    });
  });

  describe('create — PM portfolio', () => {
    it('allows a PM to create a system in a managed company and audits it', async () => {
      await service.create({ name: 'New', companyId: 'company-1' }, PM);

      expect(prisma.system.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SYSTEM_CREATE', userId: PM.id }),
      );
    });

    it('refuses a PM outside their portfolio', async () => {
      await expect(
        service.create({ name: 'New', companyId: 'company-9' }, PM),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('roster', () => {
    it('adds a developer and audits the roster change', async () => {
      await service.addUser(SYSTEM_ID, 'dev-1', PM);

      expect(prisma.userSystem.upsert).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SYSTEM_ROSTER_ADD', userId: PM.id }),
      );
    });

    it('refuses non-developer roster targets', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'pm-2',
        role: UserRole.PROJECT_MANAGER,
        isActive: true,
      });

      await expect(service.addUser(SYSTEM_ID, 'pm-2', PM)).rejects.toThrow(ForbiddenException);
    });

    it('removes a developer and audits the roster change', async () => {
      await service.removeUser(SYSTEM_ID, 'dev-1', PM);

      expect(prisma.userSystem.delete).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SYSTEM_ROSTER_REMOVE', userId: PM.id }),
      );
    });
  });
});
