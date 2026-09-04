import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { NotificationType, ToolCategory, ToolStatus, ToolTeam, UserRole } from '@prisma/client';
import { ToolsService } from './tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const TOOL = 'tool-1';
const DEV = 'dev-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
});

const toolRow = (over: Record<string, any> = {}) => ({
  id: TOOL,
  name: 'Postman',
  website: 'https://www.postman.com',
  description: 'تشغيل طلبات الـ API المحفوظة',
  gettingStarted: '1. ثبّت التطبيق',
  categories: [ToolCategory.TESTING],
  teams: [ToolTeam.BACKEND, ToolTeam.QA],
  status: ToolStatus.REQUESTED,
  requestedById: DEV,
  decidedById: null,
  decidedAt: null,
  decisionNote: null,
  ...over,
});

const validDto = {
  name: 'Postman',
  website: 'https://www.postman.com',
  description: 'تشغيل طلبات الـ API المحفوظة',
  gettingStarted: '1. ثبّت التطبيق',
  categories: [ToolCategory.TESTING],
  teams: [ToolTeam.BACKEND, ToolTeam.QA],
};

describe('ToolsService', () => {
  let service: ToolsService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      tool: {
        findUnique: jest.fn().mockResolvedValue(toolRow()),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...toolRow(), ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...toolRow(), ...data })),
      },
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'pm-1' }]) },
    };
    audit = { log: jest.fn().mockResolvedValue({}) };
    notifications = {
      notify: jest.fn().mockResolvedValue({}),
      notifyMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ToolsService);
  });

  // ------------------------------------------------------------- role gates

  it('refuses a request from a role that only reads the catalogue', async () => {
    await expect(service.create(validDto, asUser(UserRole.TICKET_REQUESTER))).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.tool.create).not.toHaveBeenCalled();
  });

  it('refuses approve, decline and retire from the developer who asked', async () => {
    const dev = asUser(UserRole.DEVELOPER, DEV);
    await expect(service.approve(TOOL, dev)).rejects.toThrow(ForbiddenException);
    await expect(service.decline(TOOL, { note: 'لا' }, dev)).rejects.toThrow(ForbiddenException);
    await expect(service.retire(TOOL, { note: 'لا' }, dev)).rejects.toThrow(ForbiddenException);
    expect(prisma.tool.update).not.toHaveBeenCalled();
  });

  it('refuses an edit from a developer', async () => {
    await expect(
      service.update(TOOL, { name: 'Insomnia' }, asUser(UserRole.DEVELOPER, DEV)),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a non-approved status filter to a role that cannot decide', async () => {
    await expect(
      service.findAll(asUser(UserRole.DEVELOPER, DEV), { status: ToolStatus.DECLINED }),
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.tool.findMany).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- reading

  it('limits a developer to approved tools plus their own non-declined requests', async () => {
    await service.findAll(asUser(UserRole.DEVELOPER, DEV), {});

    const where = prisma.tool.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({
      OR: [
        { status: ToolStatus.APPROVED },
        {
          AND: [
            { requestedById: DEV },
            { status: { not: ToolStatus.DECLINED } },
          ],
        },
      ],
    });
  });

  it('omits declined tools from the unfiltered catalogue for a role that decides', async () => {
    await service.findAll(asUser(UserRole.PROJECT_MANAGER), {});

    const where = prisma.tool.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ status: { not: ToolStatus.DECLINED } });
  });

  it('still returns declined tools when a manager filters by that status', async () => {
    await service.findAll(asUser(UserRole.PROJECT_MANAGER), { status: ToolStatus.DECLINED });

    const where = prisma.tool.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ status: ToolStatus.DECLINED });
    expect(where.AND).not.toContainEqual({ status: { not: ToolStatus.DECLINED } });
  });

  it('hides another developer’s pending request behind a 404', async () => {
    prisma.tool.findUnique.mockResolvedValue(toolRow({ requestedById: 'someone-else' }));

    await expect(service.findOne(TOOL, asUser(UserRole.DEVELOPER, DEV))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('reports no pending queue to a role that cannot decide', async () => {
    expect(await service.pendingCount(asUser(UserRole.DEVELOPER, DEV))).toEqual({ count: 0 });
    expect(prisma.tool.count).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------- writing

  it('lands a new request at REQUESTED and tells the deciders', async () => {
    const tool = await service.create(validDto, asUser(UserRole.DEVELOPER, DEV));

    expect(prisma.tool.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ requestedById: DEV }),
      }),
    );
    // No status in the payload: the column default is the only way in.
    expect(prisma.tool.create.mock.calls[0][0].data.status).toBeUndefined();
    expect(tool.status).toBe(ToolStatus.REQUESTED);
    expect(notifications.notifyMany).toHaveBeenCalledWith(
      ['pm-1'],
      expect.objectContaining({ type: NotificationType.TOOL_REQUESTED }),
      DEV,
    );
  });

  it('lands a request at REQUESTED even when the asker could approve it', async () => {
    const tool = await service.create(validDto, asUser(UserRole.PROGRAMMING_HEAD));

    expect(tool.status).toBe(ToolStatus.REQUESTED);
  });

  it('refuses a duplicate of a tool already in the catalogue', async () => {
    prisma.tool.findFirst.mockResolvedValue({ id: 'other', status: ToolStatus.APPROVED });

    await expect(service.create(validDto, asUser(UserRole.DEVELOPER, DEV))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('approves a pending tool and notifies whoever asked', async () => {
    const tool = await service.approve(TOOL, asUser(UserRole.PROJECT_MANAGER, 'pm-1'));

    expect(tool.status).toBe(ToolStatus.APPROVED);
    expect(prisma.tool.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: ToolStatus.APPROVED, decidedById: 'pm-1' }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TOOL_APPROVED', entity: 'Tool' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      DEV,
      expect.objectContaining({ type: NotificationType.TOOL_DECIDED }),
      'pm-1',
    );
  });

  it('keeps the decline reason on the row', async () => {
    const tool = await service.decline(
      TOOL,
      { note: 'يغطيها Swagger بالفعل' },
      asUser(UserRole.PROGRAMMING_HEAD, 'head-1'),
    );

    expect(tool.status).toBe(ToolStatus.DECLINED);
    expect(tool.decisionNote).toBe('يغطيها Swagger بالفعل');
  });

  // ------------------------------------------------------------ status guard

  it('refuses a second verdict on a decided request', async () => {
    prisma.tool.findUnique.mockResolvedValue(
      toolRow({ status: ToolStatus.DECLINED, decidedById: 'head-1' }),
    );

    await expect(service.approve(TOOL, asUser(UserRole.PROJECT_MANAGER))).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.tool.update).not.toHaveBeenCalled();
  });

  it('refuses to retire a tool that was never approved', async () => {
    await expect(
      service.retire(TOOL, { note: 'لم تُستخدم' }, asUser(UserRole.PROJECT_MANAGER)),
    ).rejects.toThrow(BadRequestException);
  });

  it('retires an approved tool rather than deleting it', async () => {
    prisma.tool.findUnique.mockResolvedValue(toolRow({ status: ToolStatus.APPROVED }));

    const tool = await service.retire(
      TOOL,
      { note: 'استبدلناها بـ Swagger' },
      asUser(UserRole.PROJECT_MANAGER, 'pm-1'),
    );

    expect(tool.status).toBe(ToolStatus.RETIRED);
    expect(prisma.tool.update).toHaveBeenCalled();
  });

  it('refuses a decision on a tool that does not exist', async () => {
    prisma.tool.findUnique.mockResolvedValue(null);

    await expect(service.approve('missing', asUser(UserRole.PROJECT_MANAGER))).rejects.toThrow(
      NotFoundException,
    );
  });
});
