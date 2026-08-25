import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

// `fs` properties are non-configurable on modern Node, so the module is mocked
// rather than spied on. The service touches disk in its constructor.
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

import { AttachmentsService } from './attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';

const SYSTEM = 'system-1';
const STEP = 'step-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: 'company-1',
});

const file = (over: Partial<Express.Multer.File> = {}) =>
  ({
    originalname: 'shot.png',
    filename: 'generated.png',
    size: 1024,
    mimetype: 'image/png',
    ...over,
  }) as Express.Multer.File;

describe('AttachmentsService', () => {
  let service: AttachmentsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      ticketAttachment: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'a1', ...data })),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ticketComment: { findUnique: jest.fn().mockResolvedValue({ ticketId: 'ticket-1' }) },
      ticketTask: { findUnique: jest.fn().mockResolvedValue({ ticketId: 'ticket-1' }) },
      testCase: {
        findUnique: jest.fn().mockResolvedValue({ suite: { systemId: SYSTEM } }),
      },
      bug: { findUnique: jest.fn().mockResolvedValue({ systemId: SYSTEM }) },
      testStep: {
        findUnique: jest.fn().mockResolvedValue({
          testCase: { suite: { systemId: SYSTEM } },
          bug: null,
        }),
      },
      ticket: { count: jest.fn().mockResolvedValue(1) },
      system: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttachmentsService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('./uploads') } },
      ],
    }).compile();

    service = module.get(AttachmentsService);
  });

  describe('upload — an owner is required', () => {
    it('refuses a file with nothing to hang off', async () => {
      await expect(service.upload(file(), {}, asUser(UserRole.QA))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('stores a ticket file against the ticket', async () => {
      await service.upload(file(), { ticketId: 'ticket-1' }, asUser(UserRole.QA));
      expect(prisma.ticketAttachment.create.mock.calls[0][0].data).toMatchObject({
        ticketId: 'ticket-1',
        testStepId: null,
      });
    });
  });

  describe('upload — one screenshot per step', () => {
    it('accepts the first image on a step', async () => {
      await service.upload(file(), { testStepId: STEP }, asUser(UserRole.QA));
      expect(prisma.ticketAttachment.create.mock.calls[0][0].data).toMatchObject({
        testStepId: STEP,
      });
    });

    it('rejects a second file on the same step — replacing is delete-then-upload', async () => {
      prisma.ticketAttachment.count.mockResolvedValue(1);
      await expect(
        service.upload(file(), { testStepId: STEP }, asUser(UserRole.QA)),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.ticketAttachment.create).not.toHaveBeenCalled();
    });

    it('rejects a non-image on a step, however wide the general allow-list is', async () => {
      await expect(
        service.upload(
          file({ mimetype: 'application/pdf', originalname: 'spec.pdf' }),
          { testStepId: STEP },
          asUser(UserRole.QA),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('still accepts a PDF on a ticket', async () => {
      await expect(
        service.upload(
          file({ mimetype: 'application/pdf' }),
          { ticketId: 'ticket-1' },
          asUser(UserRole.QA),
        ),
      ).resolves.toBeDefined();
    });
  });

  describe('scope — QA owners answer to the system, ticket owners to the ticket', () => {
    it('refuses a case upload from someone outside the system', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-9' }]);
      await expect(
        service.upload(file(), { testCaseId: 'case-1' }, asUser(UserRole.QA)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a bug upload from a role with no QA surface at all', async () => {
      await expect(
        service.upload(file(), { bugId: 'bug-1' }, asUser(UserRole.TICKET_REQUESTER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('resolves a step on a bug through the bug’s own system', async () => {
      prisma.testStep.findUnique.mockResolvedValue({ testCase: null, bug: { systemId: SYSTEM } });
      await expect(
        service.upload(file(), { testStepId: STEP }, asUser(UserRole.QA)),
      ).resolves.toBeDefined();
    });

    it('refuses a ticket upload from outside the ticket scope', async () => {
      prisma.ticket.count.mockResolvedValue(0);
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: SYSTEM }]);
      await expect(
        service.upload(file(), { ticketId: 'ticket-1' }, asUser(UserRole.DEVELOPER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('resolveDownload — the guard on the bytes themselves', () => {
    const attachment = {
      id: 'a1',
      fileName: 'shot.png',
      mimeType: 'image/png',
      url: '/uploads/generated.png',
      ticketId: null,
      commentId: null,
      taskId: null,
      testCaseId: null,
      bugId: null,
      testStepId: STEP,
    };

    it('404s an attachment that does not exist', async () => {
      await expect(service.resolveDownload('a1', asUser(UserRole.QA))).rejects.toThrow(
        NotFoundException,
      );
    });

    it('checks the step’s system before handing over the file', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue(attachment);
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-9' }]);
      await expect(service.resolveDownload('a1', asUser(UserRole.QA))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('serves a step screenshot to someone inside the system', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue(attachment);
      const { attachment: served } = await service.resolveDownload('a1', asUser(UserRole.QA));
      expect(served.fileName).toBe('shot.png');
    });

    it('takes the basename, so a crafted url cannot walk out of the upload dir', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        ...attachment,
        url: '/uploads/../../etc/passwd',
      });
      const { filePath } = await service.resolveDownload('a1', asUser(UserRole.QA));
      expect(filePath).not.toContain('etc');
      expect(filePath).toContain('passwd');
    });
  });

  describe('delete', () => {
    it('refuses somebody else’s upload when the caller cannot moderate', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        id: 'a1',
        url: '/uploads/x.png',
        uploadedById: 'someone-else',
        ticketId: 'ticket-1',
      });
      await expect(service.delete('a1', asUser(UserRole.DEVELOPER))).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lets the uploader remove their own step screenshot', async () => {
      prisma.ticketAttachment.findUnique.mockResolvedValue({
        id: 'a1',
        url: '/uploads/x.png',
        uploadedById: 'actor-1',
        testStepId: STEP,
      });
      await expect(service.delete('a1', asUser(UserRole.QA))).resolves.toBeDefined();
      expect(prisma.ticketAttachment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    });
  });
});
