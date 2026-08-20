import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';

const SYSTEM_ID = 'sys-1';
const existing = { id: SYSTEM_ID, name: 'POS', isActive: false, companyId: 'company-1' };

describe('SystemsService', () => {
  let service: SystemsService;
  let prisma: { system: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      system: {
        findUnique: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data })),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
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
});
