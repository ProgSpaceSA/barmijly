import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
const COMMENT_ID = 'comment-1';

const asUser = (role: UserRole, id = 'author-1') => ({
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

/** Row shape `filterMentionable` reads back for each candidate. */
const candidate = (over: Record<string, any>) => ({
  id: 'u1',
  role: UserRole.QA,
  companyId: 'company-1',
  systems: [],
  companies: [],
  assignments: [],
  tasksAssigned: [],
  _count: { systems: 0, companies: 0 },
  ...over,
});

describe('CommentsService — editing and deleting', () => {
  let service: CommentsService;
  let prisma: any;
  let attachments: { deleteForComment: jest.Mock };
  let notifications: { notify: jest.Mock; notifyMany: jest.Mock };
  let email: { sendMentionEmail: jest.Mock; sendRequirementMention: jest.Mock };

  const storedComment = (over: Record<string, any> = {}) => ({
    id: COMMENT_ID,
    authorId: 'author-1',
    ticketId: TICKET_ID,
    content: 'النص القديم',
    visibility: 'PUBLIC',
    mentions: [],
    ...over,
  });

  beforeEach(async () => {
    prisma = {
      ticket: {
        findUnique: jest.fn().mockResolvedValue(TICKET),
        count: jest.fn().mockResolvedValue(1),
      },
      ticketComment: {
        create: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(storedComment()),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: COMMENT_ID, ...data })),
        delete: jest.fn().mockResolvedValue({ id: COMMENT_ID }),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      userCompany: { findMany: jest.fn().mockResolvedValue([{ companyId: 'company-1' }]) },
      userSystem: { findMany: jest.fn().mockResolvedValue([{ systemId: 'system-1' }]) },
      system: { findMany: jest.fn().mockResolvedValue([]) },
    };
    attachments = { deleteForComment: jest.fn().mockResolvedValue(0) };
    notifications = { notify: jest.fn(), notifyMany: jest.fn() };
    email = { sendMentionEmail: jest.fn(), sendRequirementMention: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        AccessService,
        MeetingAccessService,
        { provide: AttachmentsService, useValue: attachments },
        { provide: NotificationsService, useValue: notifications },
        { provide: EmailService, useValue: email },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://barmijly.ai') } },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('update', () => {
    it('lets the author rewrite their own comment', async () => {
      const updated: any = await service.update(
        COMMENT_ID,
        { content: 'النص الجديد' },
        asUser(UserRole.DEVELOPER, 'author-1'),
      );

      expect(updated.content).toBe('النص الجديد');
    });

    it('refuses an edit by anyone else, moderator included', async () => {
      await expect(
        service.update(COMMENT_ID, { content: 'تحريف' }, asUser(UserRole.PROGRAMMING_HEAD, 'head-1')),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.ticketComment.update).not.toHaveBeenCalled();
    });

    it('refuses an edit on a ticket the author can no longer read', async () => {
      prisma.ticket.count.mockResolvedValue(0);

      await expect(
        service.update(COMMENT_ID, { content: 'نص' }, asUser(UserRole.DEVELOPER, 'author-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s on a comment that is gone', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue(null);

      await expect(
        service.update(COMMENT_ID, { content: 'نص' }, asUser(UserRole.DEVELOPER)),
      ).rejects.toThrow(NotFoundException);
    });

    it('keeps the stored mentions when the field is omitted', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue(storedComment({ mentions: ['qa-1'] }));

      const updated: any = await service.update(
        COMMENT_ID,
        { content: 'تصحيح إملائي' },
        asUser(UserRole.DEVELOPER, 'author-1'),
      );

      expect(updated.mentions).toEqual(['qa-1']);
      expect(notifications.notifyMany).not.toHaveBeenCalled();
    });

    it('drops a mention the author deleted from the text', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue(storedComment({ mentions: ['qa-1'] }));

      const updated: any = await service.update(
        COMMENT_ID,
        { content: 'بدون ذكر', mentions: [] },
        asUser(UserRole.DEVELOPER, 'author-1'),
      );

      // The stored array is the read grant, so removing the name has to remove it.
      expect(updated.mentions).toEqual([]);
    });

    it('notifies only the newly added mention, not the ones already there', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue(storedComment({ mentions: ['qa-1'] }));
      prisma.user.findMany
        .mockResolvedValueOnce([
          candidate({ id: 'qa-1', role: UserRole.QA }),
          candidate({ id: 'qa-2', role: UserRole.QA }),
        ])
        .mockResolvedValueOnce([{ email: 'qa2@company.com' }]);

      await service.update(
        COMMENT_ID,
        { content: 'مرحبا @qa1 @qa2', mentions: ['qa-1', 'qa-2'] },
        asUser(UserRole.DEVELOPER, 'author-1'),
      );

      expect(notifications.notifyMany).toHaveBeenCalledTimes(1);
      expect(notifications.notifyMany).toHaveBeenCalledWith(
        ['qa-2'],
        expect.objectContaining({ title: 'تمت الإشارة إليك في تعليق' }),
        'author-1',
      );
      expect(email.sendMentionEmail).toHaveBeenCalledTimes(1);
    });

    it('does not hold the comment response open while mention email is sending', async () => {
      let finishEmail!: () => void;
      const pendingEmail = new Promise<void>((resolve) => {
        finishEmail = resolve;
      });
      prisma.ticketComment.findUnique.mockResolvedValue(storedComment());
      prisma.user.findMany
        .mockResolvedValueOnce([candidate({ id: 'qa-1', role: UserRole.QA })])
        .mockResolvedValueOnce([{ email: 'qa1@company.com' }]);
      email.sendMentionEmail.mockReturnValue(pendingEmail);

      const result = service.update(
        COMMENT_ID,
        { content: 'مرحبا @qa1', mentions: ['qa-1'] },
        asUser(UserRole.DEVELOPER, 'author-1'),
      );

      await expect(
        Promise.race([
          result.then(() => 'saved'),
          new Promise((resolve) => setTimeout(() => resolve('blocked'), 100)),
        ]),
      ).resolves.toBe('saved');

      finishEmail();
      await pendingEmail;
    });

    it('still refuses an outsider mention added on an internal comment', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue(
        storedComment({ visibility: 'INTERNAL' }),
      );
      prisma.user.findMany
        .mockResolvedValueOnce([candidate({ id: 'creator-1', role: UserRole.TICKET_REQUESTER })])
        .mockResolvedValueOnce([{ id: 'creator-1', role: UserRole.TICKET_REQUESTER }]);

      const updated: any = await service.update(
        COMMENT_ID,
        { content: 'داخلي', mentions: ['creator-1'] },
        asUser(UserRole.DEVELOPER, 'author-1'),
      );

      expect(updated.mentions).toEqual([]);
    });
  });

  describe('delete', () => {
    it('clears the attachments before the row, or the foreign key blocks it', async () => {
      await service.delete(COMMENT_ID, asUser(UserRole.DEVELOPER, 'author-1'));

      expect(attachments.deleteForComment).toHaveBeenCalledWith(COMMENT_ID);
      expect(attachments.deleteForComment.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.ticketComment.delete.mock.invocationCallOrder[0],
      );
    });

    it('refuses a delete by anyone but the author, however senior', async () => {
      prisma.ticketComment.findUnique.mockResolvedValue(storedComment({ authorId: 'someone' }));

      for (const role of [UserRole.PROGRAMMING_HEAD, UserRole.SENIOR_MANAGEMENT, UserRole.PROJECT_MANAGER, UserRole.DEVELOPER]) {
        await expect(service.delete(COMMENT_ID, asUser(role, 'other-1'))).rejects.toThrow(
          ForbiddenException,
        );
      }
      expect(attachments.deleteForComment).not.toHaveBeenCalled();
      expect(prisma.ticketComment.delete).not.toHaveBeenCalled();
    });
  });
});
