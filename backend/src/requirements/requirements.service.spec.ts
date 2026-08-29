import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  NotificationType,
  Priority,
  RequirementSource,
  RequirementStatus,
  TicketStatus,
  TicketType,
  UserRole,
} from '@prisma/client';
import { RequirementsService } from './requirements.service';
import { MeetingAccessService } from '../meetings/meetings.access';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const REQUIREMENT = 'req-1';
const SYSTEM = 'system-1';
const OTHER_SYSTEM = 'system-9';
const COMPANY = 'company-1';

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'أ',
  lastName: 'ب',
  companyId: COMPANY,
});

const requirementRow = (over: Record<string, any> = {}) => ({
  id: REQUIREMENT,
  requirementNumber: 4,
  title: 'تقرير مبيعات يومي',
  description: 'يريد الرئيس التنفيذي تقريراً يومياً.',
  source: RequirementSource.MEETING,
  sourceNote: null,
  meetingPointId: 'point-1',
  status: RequirementStatus.NEW,
  priority: Priority.HIGH,
  requestedById: null,
  requestedByName: 'الرئيس التنفيذي',
  ownerId: null,
  dueDate: null,
  systemId: SYSTEM,
  companyId: COMPANY,
  createdById: 'pm-1',
  decidedById: null,
  decidedAt: null,
  decisionNote: null,
  isArchived: false,
  meetingPoint: null,
  ...over,
});

describe('RequirementsService', () => {
  let service: RequirementsService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  /** What the post-write read-back reports back as the history. */
  let historyRows: Record<string, unknown>[];

  const grantSystems = (systemIds: string[]) => {
    prisma.userSystem.findMany.mockResolvedValue(systemIds.map((systemId) => ({ systemId })));
  };

  beforeEach(async () => {
    historyRows = [{ id: 'h1', fromStatus: null, toStatus: RequirementStatus.NEW }];
    prisma = {
      requirement: {
        findUnique: jest.fn().mockResolvedValue(requirementRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            ...requirementRow(),
            status: RequirementStatus.NEW,
            ...data,
            id: REQUIREMENT,
          }),
        ),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ ...requirementRow(), ...data }),
          ),
        /**
         * The read-back at the end of every write. It answers with whatever
         * the history mock has been told to hold, which is how these specs
         * check that the reply carries the row that was just inserted.
         */
        findUniqueOrThrow: jest.fn().mockImplementation(() =>
          Promise.resolve({ ...requirementRow(), statusHistory: historyRows }),
        ),
      },
      requirementStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticket: {
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({ id: 'ticket-new', ticketNumber: 142, ...data }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      ticketStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketAttachment: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      ticketAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockImplementation(({ where, select }: any) =>
          Promise.resolve({
            id: where.id,
            isActive: true,
            ...(select?.role ? { role: UserRole.PROJECT_MANAGER } : {}),
          }),
        ),
        findMany: jest.fn().mockResolvedValue([]),
      },
      system: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: SYSTEM, companyId: COMPANY, isActive: true }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      userCompany: { findMany: jest.fn().mockResolvedValue([]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest
        .fn()
        .mockImplementation((arg: any) =>
          typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
        ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    notifications = {
      notify: jest.fn().mockResolvedValue(undefined),
      notifyMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequirementsService,
        MeetingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(RequirementsService);
  });

  describe('who reaches the backlog', () => {
    it('refuses TICKET_REQUESTER outright', async () => {
      await expect(service.findAll(asUser(UserRole.TICKET_REQUESTER), {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it.each([
      UserRole.SYSTEM_OWNER,
      UserRole.DEVELOPER,
      UserRole.QA,
      UserRole.PROJECT_MANAGER,
      UserRole.PROGRAMMING_HEAD,
      UserRole.SENIOR_MANAGEMENT,
    ])('lets %s read it', async (role) => {
      await expect(service.findAll(asUser(role), {})).resolves.toBeDefined();
    });

    it.each([UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA])(
      'refuses %s a new requirement — they file tickets',
      async (role) => {
        await expect(
          service.create({ title: 'طلب', companyId: COMPANY }, asUser(role)),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it('hides an unpinned requirement from a SYSTEM_OWNER', async () => {
      grantSystems([SYSTEM]);
      prisma.requirement.findUnique.mockResolvedValue(requirementRow({ systemId: null }));
      await expect(
        service.findOne(REQUIREMENT, asUser(UserRole.SYSTEM_OWNER)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('filters the thread for a reader who cannot see INTERNAL', async () => {
      grantSystems([SYSTEM]);
      await service.findOne(REQUIREMENT, asUser(UserRole.SYSTEM_OWNER));
      const args = prisma.requirement.findUnique.mock.calls[0][0];
      expect(args.include.comments.where).toEqual({ visibility: 'PUBLIC' });
    });

    it('leaves the thread whole for the programming team', async () => {
      await service.findOne(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      const args = prisma.requirement.findUnique.mock.calls[0][0];
      expect(args.include.comments.where).toEqual({});
    });
  });

  describe('create', () => {
    it('refuses source = MEETING — that path is capture', async () => {
      await expect(
        service.create(
          { title: 'طلب', companyId: COMPANY, source: RequirementSource.MEETING },
          asUser(UserRole.PROGRAMMING_HEAD),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('files a WhatsApp ask with its note', async () => {
      await service.create(
        {
          title: 'تعديل الفاتورة',
          companyId: COMPANY,
          source: RequirementSource.WHATSAPP,
          sourceNote: 'واتساب من م. أحمد',
        },
        asUser(UserRole.PROJECT_MANAGER),
      );
      expect(prisma.requirement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: RequirementSource.WHATSAPP,
            sourceNote: 'واتساب من م. أحمد',
            createdById: 'actor-1',
          }),
        }),
      );
    });

    it('opens the status history at NEW', async () => {
      await service.create(
        { title: 'طلب', companyId: COMPANY },
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(prisma.requirementStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromStatus: null, toStatus: RequirementStatus.NEW }),
        }),
      );
    });

    it('refuses a system outside the stated company', async () => {
      prisma.system.findUnique.mockResolvedValue({
        id: OTHER_SYSTEM,
        companyId: 'company-9',
        isActive: true,
      });
      await expect(
        service.create(
          { title: 'طلب', companyId: COMPANY, systemId: OTHER_SYSTEM },
          asUser(UserRole.PROGRAMMING_HEAD),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('triage', () => {
    it('is closed to the read-only roles', async () => {
      await expect(
        service.update(REQUIREMENT, { priority: Priority.LOW }, asUser(UserRole.QA)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('pins the system after checking it', async () => {
      await service.update(
        REQUIREMENT,
        { systemId: SYSTEM },
        asUser(UserRole.PROJECT_MANAGER),
      );
      expect(prisma.system.findUnique).toHaveBeenCalled();
      expect(prisma.requirement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ systemId: SYSTEM }) }),
      );
    });

    it('tells the new owner', async () => {
      await service.update(REQUIREMENT, { ownerId: 'dev-2' }, asUser(UserRole.PROJECT_MANAGER));
      expect(notifications.notify).toHaveBeenCalledWith(
        'dev-2',
        expect.objectContaining({ type: NotificationType.REQUIREMENT_ASSIGNED }),
        'actor-1',
      );
    });

    it('refuses to edit one that already became a ticket', async () => {
      prisma.requirement.findUnique.mockResolvedValue(
        requirementRow({ status: RequirementStatus.CONVERTED }),
      );
      await expect(
        service.update(REQUIREMENT, { title: 'جديد' }, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('status', () => {
    it('answers with the history that was just written, not the one before it', async () => {
      // The write used to reply with the row as it stood *before* the history
      // insert, so the page rendered a move with no record of it.
      historyRows = [
        { id: 'h1', toStatus: RequirementStatus.NEW },
        { id: 'h2', toStatus: RequirementStatus.ACCEPTED, note: 'موافق' },
      ];
      const updated = await service.changeStatus(
        REQUIREMENT,
        { status: RequirementStatus.ACCEPTED, note: 'موافق' },
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(prisma.requirement.findUniqueOrThrow).toHaveBeenCalled();
      expect((updated as any).statusHistory).toHaveLength(2);
    });

    it('writes a history row on every move', async () => {
      await service.changeStatus(
        REQUIREMENT,
        { status: RequirementStatus.ACCEPTED, note: 'موافق' },
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(prisma.requirementStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: RequirementStatus.NEW,
            toStatus: RequirementStatus.ACCEPTED,
            note: 'موافق',
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REQUIREMENT_STATUS_CHANGE' }),
      );
    });

    it('refuses CONVERTED by hand — promote owns it', async () => {
      await expect(
        service.changeStatus(
          REQUIREMENT,
          { status: RequirementStatus.CONVERTED },
          asUser(UserRole.PROGRAMMING_HEAD),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('is closed to the read-only roles', async () => {
      await expect(
        service.changeStatus(
          REQUIREMENT,
          { status: RequirementStatus.DECLINED },
          asUser(UserRole.DEVELOPER),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('promote', () => {
    it('refuses a requirement with no system', async () => {
      prisma.requirement.findUnique.mockResolvedValue(requirementRow({ systemId: null }));
      await expect(
        service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([UserRole.SYSTEM_OWNER, UserRole.DEVELOPER, UserRole.QA])(
      'refuses %s',
      async (role) => {
        await expect(service.promote(REQUIREMENT, asUser(role))).rejects.toThrow(
          ForbiddenException,
        );
      },
    );

    it('creates a DRAFT ticket — never bypasses approval', async () => {
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.ticket.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: TicketStatus.DRAFT,
            systemId: SYSTEM,
            companyId: COMPANY,
            requirementId: REQUIREMENT,
          }),
        }),
      );
    });

    it('defaults to NEW_FEATURE and takes an override', async () => {
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.ticket.create.mock.calls[0][0].data.type).toBe(TicketType.NEW_FEATURE);

      prisma.ticket.create.mockClear();
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD), {
        type: TicketType.MODIFICATION,
      });
      expect(prisma.ticket.create.mock.calls[0][0].data.type).toBe(TicketType.MODIFICATION);
    });

    it('moves the requirement to CONVERTED and records it', async () => {
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.requirement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: RequirementStatus.CONVERTED }),
        }),
      );
      expect(prisma.requirementStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ toStatus: RequirementStatus.CONVERTED }),
        }),
      );
    });

    it('opens the ticket history so the link reads from both ends', async () => {
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.ticketStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromStatus: null, toStatus: TicketStatus.DRAFT }),
        }),
      );
      const actions = audit.log.mock.calls.map((c) => c[0].action);
      expect(actions).toContain('REQUIREMENT_PROMOTE');
      expect(actions).toContain('TICKET_CREATED');
      expect(audit.log.mock.calls.find((c) => c[0].action === 'TICKET_CREATED')[0].newValues).toMatchObject(
        { requirementNumber: 4 },
      );
    });

    it('assigns a developer owner onto the ticket roster', async () => {
      prisma.requirement.findUnique.mockResolvedValue(
        requirementRow({ ownerId: 'dev-1' }),
      );
      prisma.user.findUnique.mockImplementation(({ where, select }: any) =>
        Promise.resolve({
          id: where.id,
          isActive: true,
          role: select?.role ? UserRole.DEVELOPER : undefined,
        }),
      );
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.ticketAssignment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticketId_developerId: { ticketId: 'ticket-new', developerId: 'dev-1' } },
        }),
      );
    });

    it('copies requirement attachments onto the new ticket', async () => {
      prisma.ticketAttachment.findMany.mockResolvedValueOnce([
        {
          fileName: 'spec.pdf',
          fileSize: 100,
          mimeType: 'application/pdf',
          url: '/uploads/spec.pdf',
          uploadedById: 'u1',
        },
      ]);
      await service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.ticketAttachment.createMany).toHaveBeenCalled();
    });

    it('refuses a declined requirement', async () => {
      prisma.requirement.findUnique.mockResolvedValue(
        requirementRow({ status: RequirementStatus.DECLINED }),
      );
      await expect(
        service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses an archived requirement', async () => {
      prisma.requirement.findUnique.mockResolvedValue(requirementRow({ isArchived: true }));
      await expect(
        service.promote(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('archive', () => {
    it('flips the flag rather than deleting', async () => {
      await service.archive(REQUIREMENT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.requirement.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isArchived: true } }),
      );
      expect((prisma.requirement as any).delete).toBeUndefined();
    });

    it('is closed to the read-only roles', async () => {
      await expect(service.archive(REQUIREMENT, asUser(UserRole.QA))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
