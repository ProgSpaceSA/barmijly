import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { CommentsService } from './comments.service';
import { AccessService } from '../access/access.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { MeetingAccessService } from '../meetings/meetings.access';

const TICKET_ID = 'ticket-1';
const REQUIREMENT_ID = 'req-1';
const ALL_ROLES = Object.values(UserRole);

const asUser = (role: UserRole, id = 'actor-1') => ({
  id,
  role,
  firstName: 'ف',
  lastName: 'ل',
  companyId: 'company-1',
});

const TICKET = {
  id: TICKET_ID,
  title: 'تعديل شاشة الفواتير',
  creatorId: 'creator-1',
  systemOwnerId: null,
  systemId: 'system-1',
  companyId: 'company-1',
};

describe('comment access', () => {
  let service: CommentsService;
  let prisma: any;
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  let email: { sendMentionEmail: jest.Mock; sendRequirementMention: jest.Mock };

  beforeEach(async () => {
    prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(TICKET),
        count: jest.fn().mockResolvedValue(1),
      },
      ticketComment: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'c1', ...data })),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([{ systemId: 'system-1' }]) },
      system: { findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { notify: jest.fn(), notifyMany: jest.fn() };
    email = { sendMentionEmail: jest.fn(), sendRequirementMention: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        MeetingAccessService,
        { provide: AttachmentsService, useValue: { deleteForComment: jest.fn() } },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: email },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://barmijly.ai') } },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('INTERNAL visibility — req.md §12', () => {
    const INSIDERS: UserRole[] = [
      UserRole.DEVELOPER,
      UserRole.QA,
      UserRole.PROJECT_MANAGER,
      UserRole.PROGRAMMING_HEAD,
      UserRole.SENIOR_MANAGEMENT,
    ];

    it.each(ALL_ROLES)('%s posting an internal comment', async (role) => {
      const call = service.create({ ticketId: TICKET_ID }, { content: 'ملاحظة', visibility: 'INTERNAL' } as any, asUser(role));

      if (INSIDERS.includes(role)) {
        await expect(call).resolves.toMatchObject({ visibility: 'INTERNAL' });
      } else {
        await expect(call).rejects.toThrow(ForbiddenException);
      }
    });

    it.each(ALL_ROLES)('%s posting a public comment', async (role) => {
      await expect(
        service.create({ ticketId: TICKET_ID }, { content: 'سؤال' } as any, asUser(role)),
      ).resolves.toMatchObject({ visibility: 'PUBLIC' });
    });
  });

  describe('ticket scope', () => {
    it('refuses a comment on a ticket the author cannot read', async () => {
      prisma.ticket.count.mockResolvedValue(0);

      await expect(
        service.create({ ticketId: TICKET_ID }, { content: 'مرحبا' } as any, asUser(UserRole.TICKET_REQUESTER, 'stranger')),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticketComment.create).not.toHaveBeenCalled();
    });

    it('refuses to delete a comment on a ticket the moderator cannot read', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue({
        id: 'c1',
        authorId: 'someone',
        ticketId: TICKET_ID,
      });
      prisma.ticket.count.mockResolvedValue(0);

      await expect(
        service.delete('c1', asUser(UserRole.TICKET_REQUESTER, 'stranger')),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('mentions', () => {
    /** Row shape the mention filter reads. */
    const candidate = (over: Record<string, any>) => ({
      id: 'u1',
      role: UserRole.TICKET_REQUESTER,
      companyId: null,
      systems: [],
      companies: [],
      assignments: [],
      tasksAssigned: [],
      _count: { systems: 0, companies: 0 },
      ...over,
    });

    it('drops a mention of somebody who cannot open the ticket', async () => {
      prisma.user.findMany.mockResolvedValue([candidate({ id: 'outsider' })]);

      const comment: any = await service.create(
        { ticketId: TICKET_ID },
        { content: 'مرحبا @فلان', mentions: ['outsider'] } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      // Stored empty, so the mention cannot hand out list access either.
      expect(comment.mentions).toEqual([]);
      expect(notifications.notifyMany).not.toHaveBeenCalled();
      expect(email.sendMentionEmail).not.toHaveBeenCalled();
    });

    it('keeps a mention of somebody who can', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([candidate({ id: 'qa-1', role: UserRole.QA })])
        .mockResolvedValueOnce([{ email: 'qa@company.com' }]);

      const comment: any = await service.create(
        { ticketId: TICKET_ID },
        { content: 'مرحبا', mentions: ['qa-1'] } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(comment.mentions).toEqual(['qa-1']);
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['qa-1'],
        expect.objectContaining({ title: 'تمت الإشارة إليك في تعليق' }),
        'actor-1',
      );
    });

    it('drops an outsider mentioned on an internal comment', async () => {
      // Passes the ticket-scope filter, then fails the internal-read check.
      prisma.user.findMany
        .mockResolvedValueOnce([candidate({ id: 'creator-1' })])
        .mockResolvedValueOnce([{ id: 'creator-1', role: UserRole.TICKET_REQUESTER }]);

      const comment: any = await service.create(
        { ticketId: TICKET_ID },
        { content: 'داخلي', visibility: 'INTERNAL', mentions: ['creator-1'] } as any,
        asUser(UserRole.PROGRAMMING_HEAD),
      );

      expect(comment.mentions).toEqual([]);
    });

    it('mails a person once even if the list names them twice', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([candidate({ id: 'qa-1', role: UserRole.QA })])
        .mockResolvedValueOnce([{ email: 'qa@company.com' }]);

      await service.create(
        { ticketId: TICKET_ID },
        { content: '@جود ثم @جود', mentions: ['qa-1', 'qa-1'] } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(notifications.notifyMany).toHaveBeenCalledWith(['qa-1'], expect.anything(), 'actor-1');
      expect(email.sendMentionEmail).toHaveBeenCalledTimes(1);
    });

    it('strips leftover bidi marks so they cannot show up in the stored body', async () => {
      await service.create(
        { ticketId: TICKET_ID },
        { content: 'مرحبا \u2067@جود\u2069', mentions: [] } as any,
        asUser(UserRole.PROJECT_MANAGER),
      );

      expect(prisma.ticketComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'مرحبا @جود' }),
        }),
      );
    });

    it('never lets an author mention themselves into a notification', async () => {
      await service.create(
        { ticketId: TICKET_ID },
        { content: 'ملاحظة', mentions: ['actor-1'] } as any,
        asUser(UserRole.PROJECT_MANAGER, 'actor-1'),
      );

      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });
  });

  /**
   * The same thread hung off a requirement. What matters is that the parent
   * check moves with it: the ticket scope must not be what decides whether a
   * requirement comment is readable.
   */
  describe('a requirement is the other parent', () => {
    beforeEach(() => {
      prisma.requirement = {
        findUnique: jest.fn().mockResolvedValue({
          id: REQUIREMENT_ID,
          title: 'تقرير مبيعات يومي',
          requirementNumber: 4,
          createdById: 'pm-1',
          ownerId: null,
          systemId: 'system-1',
          companyId: 'company-1',
          company: { name: 'شركة 1' },
          system: { name: 'نظام 1' },
        }),
      };
    });

    it('stores the requirement id and leaves ticketId null', async () => {
      await service.create(
        { requirementId: REQUIREMENT_ID },
        { content: 'ملاحظة' } as any,
        asUser(UserRole.PROGRAMMING_HEAD),
      );

      expect(prisma.ticketComment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            requirementId: REQUIREMENT_ID,
            ticketId: null,
          }),
        }),
      );
    });

    it('refuses TICKET_REQUESTER, who has no backlog at all', async () => {
      await expect(
        service.create(
          { requirementId: REQUIREMENT_ID },
          { content: 'ملاحظة' } as any,
          asUser(UserRole.TICKET_REQUESTER),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a SYSTEM_OWNER whose systems do not include it', async () => {
      prisma.userSystem.findMany.mockResolvedValue([{ systemId: 'system-9' }]);
      await expect(
        service.create(
          { requirementId: REQUIREMENT_ID },
          { content: 'ملاحظة' } as any,
          asUser(UserRole.SYSTEM_OWNER),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses an unpinned requirement to a SYSTEM_OWNER', async () => {
      prisma.requirement.findUnique.mockResolvedValue({
        id: REQUIREMENT_ID,
        title: 'تقرير',
        requirementNumber: 4,
        createdById: 'pm-1',
        ownerId: null,
        systemId: null,
        companyId: 'company-1',
      });
      await expect(
        service.create(
          { requirementId: REQUIREMENT_ID },
          { content: 'ملاحظة' } as any,
          asUser(UserRole.SYSTEM_OWNER),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('notifies the filer, not the ticket creator', async () => {
      await service.create(
        { requirementId: REQUIREMENT_ID },
        { content: 'ملاحظة' } as any,
        asUser(UserRole.PROGRAMMING_HEAD),
      );

      expect(notifications.notify).toHaveBeenCalledWith(
        'pm-1',
        expect.objectContaining({ requirementId: REQUIREMENT_ID }),
        'actor-1',
      );
    });

    it('sends the requirement-shaped mention mail, not the ticket one', async () => {
      // One mock serves two reads: the mentionable filter, then the address
      // lookup for the mail — so the row carries an email as well as a scope.
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'qa-1',
          role: UserRole.QA,
          email: 'qa-1@test.local',
          companyId: 'company-1',
          systems: [{ systemId: 'system-1' }],
          companies: [],
          assignments: [],
          tasksAssigned: [],
          _count: { systems: 1, companies: 0 },
        },
      ]);

      await service.create(
        { requirementId: REQUIREMENT_ID },
        { content: 'مرحبا', mentions: ['qa-1'] } as any,
        asUser(UserRole.PROGRAMMING_HEAD),
      );

      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['qa-1'],
        expect.objectContaining({ requirementId: REQUIREMENT_ID }),
        'actor-1',
      );
      expect(email.sendMentionEmail).not.toHaveBeenCalled();
      expect(email.sendRequirementMention).toHaveBeenCalledWith(
        'qa-1@test.local',
        'ف ل',
        'تقرير مبيعات يومي',
        'https://barmijly.ai/requirements/req-1',
        4,
        expect.objectContaining({ companyName: 'شركة 1', systemName: 'نظام 1' }),
      );
    });

    it('refuses a comment addressed to neither parent', async () => {
      await expect(
        service.create({}, { content: 'ملاحظة' } as any, asUser(UserRole.PROGRAMMING_HEAD)),
      ).rejects.toThrow(/ticketId or requirementId/);
    });
  });
});
