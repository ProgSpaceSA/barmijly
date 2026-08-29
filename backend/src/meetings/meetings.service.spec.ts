import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  MeetingStatus,
  MeetingType,
  NotificationType,
  PointKind,
  RequirementSource,
  RequirementStatus,
  UserRole,
} from '@prisma/client';
import { MeetingsService, moveTo } from './meetings.service';
import { MeetingAccessService } from './meetings.access';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

const MEETING = 'meeting-1';
const POINT = 'point-1';
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

const meetingRow = (over: Record<string, any> = {}) => ({
  id: MEETING,
  meetingNumber: 7,
  title: 'مراجعة الرئيس التنفيذي',
  description: null,
  type: MeetingType.CEO_REVIEW,
  status: MeetingStatus.SCHEDULED,
  heldAt: null,
  durationMins: 60,
  location: 'المقر الرئيسي',
  companyId: COMPANY,
  organizerId: 'actor-1',
  isArchived: false,
  ...over,
});

const pointRow = (over: Record<string, any> = {}) => ({
  id: POINT,
  meetingId: MEETING,
  order: 0,
  kind: PointKind.REQUEST,
  body: 'نريد تقريراً يومياً للمبيعات',
  raisedById: null,
  raisedByName: 'الرئيس التنفيذي',
  meeting: {
    id: MEETING,
    companyId: COMPANY,
    status: MeetingStatus.HELD,
    isArchived: false,
    title: 'مراجعة الرئيس التنفيذي',
    meetingNumber: 7,
  },
  ...over,
});

describe('MeetingsService', () => {
  let service: MeetingsService;
  let prisma: any;
  let audit: { log: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  /** Owner the capture read-back reports, so the notification test can steer it. */
  let capturedOwnerId: string | null;

  const grantCompanies = (companyIds: string[]) => {
    prisma.userCompany.findMany.mockResolvedValue(companyIds.map((companyId) => ({ companyId })));
  };

  beforeEach(async () => {
    capturedOwnerId = null;
    prisma = {
      meeting: {
        findUnique: jest.fn().mockResolvedValue(meetingRow()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...meetingRow(), ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...meetingRow(), ...data })),
      },
      meetingAttendee: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'att-1', meetingId: MEETING, userId: 'u2' }),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ id: 'att-1', ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      meetingSystem: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      meetingPoint: {
        findUnique: jest.fn().mockResolvedValue(pointRow()),
        findFirst: jest.fn().mockResolvedValue({ order: 2 }),
        findMany: jest.fn().mockResolvedValue([{ id: POINT }, { id: 'point-2' }]),
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...pointRow(), ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => Promise.resolve({ ...pointRow(), ...data })),
        delete: jest.fn().mockResolvedValue({}),
      },
      requirement: {
        // `status` mirrors the column default, which the row would carry back.
        create: jest.fn().mockImplementation(({ data }: any) =>
          Promise.resolve({
            id: 'req-1',
            requirementNumber: 4,
            status: RequirementStatus.NEW,
            ...data,
          }),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        // The read-back at the end of capture, once the opening history exists.
        findUniqueOrThrow: jest.fn().mockImplementation(() =>
          Promise.resolve({
            id: 'req-1',
            requirementNumber: 4,
            status: RequirementStatus.NEW,
            ownerId: capturedOwnerId,
            title: 'نريد تقريراً يومياً للمبيعات',
            companyId: COMPANY,
            statusHistory: [{ id: 'h1', fromStatus: null, toStatus: RequirementStatus.NEW }],
          }),
        ),
      },
      requirementStatusHistory: { create: jest.fn().mockResolvedValue({}) },
      ticketAttachment: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      user: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, isActive: true })),
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
        MeetingsService,
        MeetingAccessService,
        AccessService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(MeetingsService);
  });

  describe('the board is leadership-only', () => {
    const LOCKED_OUT = [
      UserRole.TICKET_REQUESTER,
      UserRole.SYSTEM_OWNER,
      UserRole.DEVELOPER,
      UserRole.QA,
    ];

    it.each(LOCKED_OUT)('refuses %s the list', async (role) => {
      await expect(service.findAll(asUser(role), {})).rejects.toThrow(ForbiddenException);
    });

    it('filters the list by heldAt range', async () => {
      grantCompanies([COMPANY]);
      prisma.meeting.findMany.mockResolvedValue([]);
      prisma.meeting.count.mockResolvedValue(0);

      const heldFrom = '2026-08-01T00:00:00.000Z';
      const heldTo = '2026-08-31T23:59:59.999Z';
      await service.findAll(asUser(UserRole.PROJECT_MANAGER), { heldFrom, heldTo });

      const args = prisma.meeting.findMany.mock.calls.at(-1)?.[0];
      const heldAt =
        args?.where?.heldAt ??
        args?.where?.AND?.find((clause: { heldAt?: unknown }) => clause.heldAt)?.heldAt;
      expect(heldAt).toEqual({
        gte: new Date(heldFrom),
        lte: new Date(heldTo),
      });
    });

    it.each(LOCKED_OUT)('refuses %s a new meeting', async (role) => {
      await expect(
        service.create({ title: 'اجتماع', companyId: COMPANY }, asUser(role)),
      ).rejects.toThrow(ForbiddenException);
    });

    it.each([UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER, UserRole.SENIOR_MANAGEMENT])(
      'lets %s create one',
      async (role) => {
        await expect(
          service.create({ title: 'اجتماع', companyId: COMPANY }, asUser(role)),
        ).resolves.toBeDefined();
      },
    );

    it('refuses a company the caller does not hold', async () => {
      grantCompanies(['company-9']);
      await expect(
        service.create({ title: 'اجتماع', companyId: COMPANY }, asUser(UserRole.PROJECT_MANAGER)),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create', () => {
    it('seats the organiser without being asked', async () => {
      await service.create({ title: 'اجتماع', companyId: COMPANY }, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.meeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            organizerId: 'actor-1',
            attendees: { create: [{ userId: 'actor-1' }] },
          }),
        }),
      );
    });

    it('refuses a system that belongs to another company', async () => {
      prisma.system.findUnique.mockResolvedValue({
        id: OTHER_SYSTEM,
        companyId: 'company-9',
        isActive: true,
      });
      await expect(
        service.create(
          { title: 'اجتماع', companyId: COMPANY, systemIds: [OTHER_SYSTEM] },
          asUser(UserRole.PROGRAMMING_HEAD),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('writes an audit row', async () => {
      await service.create({ title: 'اجتماع', companyId: COMPANY }, asUser(UserRole.PROGRAMMING_HEAD));
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'MEETING_CREATE', entity: 'Meeting' }),
      );
    });
  });

  describe('status', () => {
    it('stamps heldAt when the meeting never carried a date', async () => {
      await service.hold(MEETING, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: MeetingStatus.HELD, heldAt: expect.any(Date) }),
        }),
      );
    });

    it('keeps a date the organiser already set', async () => {
      const heldAt = new Date('2026-08-01T09:00:00.000Z');
      prisma.meeting.findUnique.mockResolvedValue(meetingRow({ heldAt }));
      await service.hold(MEETING, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: MeetingStatus.HELD } }),
      );
    });

    it('refuses to cancel a meeting that already happened', async () => {
      prisma.meeting.findUnique.mockResolvedValue(meetingRow({ status: MeetingStatus.HELD }));
      await expect(service.cancel(MEETING, asUser(UserRole.PROGRAMMING_HEAD))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('refuses minutes on a cancelled meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue(meetingRow({ status: MeetingStatus.CANCELLED }));
      await expect(
        service.addPoint(MEETING, { body: 'بند' }, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses minutes on an archived meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue(meetingRow({ isArchived: true }));
      await expect(
        service.addPoint(MEETING, { body: 'بند' }, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });

    it('archives rather than deleting', async () => {
      await service.archive(MEETING, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.meeting.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isArchived: true } }),
      );
      expect((prisma.meeting as any).delete).toBeUndefined();
    });
  });

  describe('attendees', () => {
    it('refuses a guest with neither an account nor a name', async () => {
      await expect(
        service.addAttendee(MEETING, {}, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });

    it('takes an external guest by name', async () => {
      await service.addAttendee(
        MEETING,
        { name: 'م. خالد', jobTitle: 'الرئيس التنفيذي', organization: 'المجموعة' },
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(prisma.meetingAttendee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: undefined, name: 'م. خالد' }),
        }),
      );
    });

    it('refuses the same internal attendee twice', async () => {
      prisma.meetingAttendee.findFirst.mockResolvedValue({ id: 'att-1' });
      await expect(
        service.addAttendee(MEETING, { userId: 'u2' }, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('points', () => {
    it('appends after the last line', async () => {
      await service.addPoint(MEETING, { body: 'بند جديد' }, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.meetingPoint.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ order: 3 }) }),
      );
    });

    it('opens an empty line — the text arrives on the first blur', async () => {
      await service.addPoint(MEETING, {}, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.meetingPoint.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: '' }) }),
      );
    });

    it('rebalances every sibling on reorder', async () => {
      prisma.meetingPoint.findMany.mockResolvedValue([
        { id: 'a' },
        { id: POINT },
        { id: 'c' },
      ]);
      await service.reorderPoints(
        MEETING,
        { pointId: POINT, order: 0 },
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(prisma.meetingPoint.update).toHaveBeenCalledWith({
        where: { id: POINT },
        data: { order: 0 },
      });
      expect(prisma.meetingPoint.update).toHaveBeenCalledWith({
        where: { id: 'a' },
        data: { order: 1 },
      });
    });

    it('keeps the requirement when the line it came from is deleted', async () => {
      await service.removePoint(MEETING, POINT, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.requirement.updateMany).toHaveBeenCalledWith({
        where: { meetingPointId: POINT },
        data: { meetingPointId: null },
      });
      expect(prisma.meetingPoint.delete).toHaveBeenCalledWith({ where: { id: POINT } });
    });

    it('refuses a point that belongs to another meeting', async () => {
      prisma.meetingPoint.findUnique.mockResolvedValue(pointRow({ meetingId: 'meeting-other' }));
      await expect(
        service.updatePoint(MEETING, POINT, { body: 'x' }, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('capture', () => {
    it('needs requirement:create, which the read-only roles lack', async () => {
      await expect(
        service.capturePoint(MEETING, POINT, {}, asUser(UserRole.QA)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('stamps source = MEETING and links the point', async () => {
      await service.capturePoint(MEETING, POINT, {}, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.requirement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: RequirementSource.MEETING,
            meetingPointId: POINT,
            companyId: COMPANY,
            createdById: 'actor-1',
          }),
        }),
      );
    });

    it('carries the point body across as title and description', async () => {
      await service.capturePoint(MEETING, POINT, {}, asUser(UserRole.PROGRAMMING_HEAD));
      const { data } = prisma.requirement.create.mock.calls[0][0];
      expect(data.title).toBe('نريد تقريراً يومياً للمبيعات');
      expect(data.description).toBe('نريد تقريراً يومياً للمبيعات');
      expect(data.requestedByName).toBe('الرئيس التنفيذي');
    });

    it('opens the status history at NEW', async () => {
      await service.capturePoint(MEETING, POINT, {}, asUser(UserRole.PROGRAMMING_HEAD));
      expect(prisma.requirementStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ fromStatus: null, toStatus: RequirementStatus.NEW }),
        }),
      );
    });

    it('audits both the requirement and the line it came from', async () => {
      await service.capturePoint(MEETING, POINT, {}, asUser(UserRole.PROGRAMMING_HEAD));
      const actions = audit.log.mock.calls.map((c) => c[0].action);
      expect(actions).toContain('REQUIREMENT_CAPTURE');
      expect(actions).toContain('MEETING_POINT_CAPTURE');
    });

    it('refuses to pin a system from another company', async () => {
      prisma.system.findUnique.mockResolvedValue({
        id: OTHER_SYSTEM,
        companyId: 'company-9',
        isActive: true,
      });
      await expect(
        service.capturePoint(
          MEETING,
          POINT,
          { systemId: OTHER_SYSTEM },
          asUser(UserRole.PROGRAMMING_HEAD),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('answers with the opening history row', async () => {
      const captured: any = await service.capturePoint(
        MEETING,
        POINT,
        {},
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(prisma.requirement.findUniqueOrThrow).toHaveBeenCalled();
      expect(captured.statusHistory).toHaveLength(1);
    });

    it('tells the owner when the capture hands it to somebody', async () => {
      capturedOwnerId = 'pm-2';
      await service.capturePoint(
        MEETING,
        POINT,
        { ownerId: 'pm-2' },
        asUser(UserRole.PROGRAMMING_HEAD),
      );
      expect(notifications.notify).toHaveBeenCalledWith(
        'pm-2',
        expect.objectContaining({ type: NotificationType.REQUIREMENT_ASSIGNED }),
        'actor-1',
      );
    });

    it('refuses a blank line — there is nothing to track yet', async () => {
      prisma.meetingPoint.findUnique.mockResolvedValue(pointRow({ body: '   ' }));
      await expect(
        service.capturePoint(MEETING, POINT, {}, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });

    it('takes a blank line when the caller supplies a title', async () => {
      prisma.meetingPoint.findUnique.mockResolvedValue(pointRow({ body: '' }));
      await expect(
        service.capturePoint(
          MEETING,
          POINT,
          { title: 'طلب من الاجتماع' },
          asUser(UserRole.PROGRAMMING_HEAD),
        ),
      ).resolves.toBeDefined();
    });

    it('refuses on an archived meeting', async () => {
      prisma.meetingPoint.findUnique.mockResolvedValue(
        pointRow({ meeting: { ...pointRow().meeting, isArchived: true } }),
      );
      await expect(
        service.capturePoint(MEETING, POINT, {}, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('moveTo', () => {
    it('moves a row to the front', () => {
      expect(moveTo(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
    });

    it('clamps past the end', () => {
      expect(moveTo(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a']);
    });

    it('leaves an unknown id alone', () => {
      expect(moveTo(['a', 'b'], 'z', 0)).toEqual(['a', 'b']);
    });
  });
});
