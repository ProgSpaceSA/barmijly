import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { GuidesService } from './guides.service';

const head = { id: 'head-1', role: UserRole.PROGRAMMING_HEAD };
const developer = { id: 'dev-1', role: UserRole.DEVELOPER };

const sample = {
  id: 'guide-1',
  title: 'Requirements',
  summary: 'Clear before code',
  steps: ['Document the goal', 'Get approval'],
  sortOrder: 0,
  createdById: head.id,
  updatedById: head.id,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: { id: head.id, firstName: 'Sara', lastName: 'H', role: UserRole.PROGRAMMING_HEAD },
  updatedBy: { id: head.id, firstName: 'Sara', lastName: 'H', role: UserRole.PROGRAMMING_HEAD },
};

describe('GuidesService', () => {
  let service: GuidesService;
  const prisma = {
    hubGuide: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuidesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(GuidesService);
  });

  it('lists guides for any hub reader', async () => {
    prisma.hubGuide.findMany.mockResolvedValue([sample]);
    const rows = await service.findAll(developer);
    expect(rows).toEqual([sample]);
  });

  it('forbids create for non-managers', async () => {
    await expect(
      service.create(
        { title: 'X', summary: 'Y', steps: ['one'] },
        developer,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a guide at the end of the list', async () => {
    prisma.hubGuide.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
    prisma.hubGuide.create.mockResolvedValue({ ...sample, sortOrder: 3 });
    const row = await service.create(
      { title: 'Security', summary: 'Protect data', steps: ['No secrets in git'] },
      head,
    );
    expect(prisma.hubGuide.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sortOrder: 3, createdById: head.id }),
      }),
    );
    expect(row.sortOrder).toBe(3);
    expect(audit.log).toHaveBeenCalled();
  });

  it('404s when updating a missing guide', async () => {
    prisma.hubGuide.findUnique.mockResolvedValue(null);
    await expect(
      service.update('missing', { title: 'Nope' }, head),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids delete for non-managers and deletes for managers', async () => {
    prisma.hubGuide.findUnique.mockResolvedValue(sample);
    await expect(service.remove(sample.id, developer)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.hubGuide.delete.mockResolvedValue(sample);
    await expect(service.remove(sample.id, head)).resolves.toEqual({ id: sample.id });
  });
});