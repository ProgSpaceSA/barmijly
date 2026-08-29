import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { MeetingAccessService } from '../meetings/meetings.access';
import { assertCan, can } from '../access/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { NotificationType } from '@prisma/client';
import {
  CommentParentRef,
  ResolvedCommentParent,
  pickParent,
} from './comment-parent';

/**
 * The author shape the thread renders: the role rides along so the UI can badge
 * "who is talking" without a second lookup per comment (req.md §12).
 */
const COMMENT_INCLUDE = {
  author: { select: { id: true, firstName: true, lastName: true, role: true } },
  attachments: true,
} as const;

const BIDI_ISOLATE = /[⁦⁧⁨⁩]/g;

function stripBidiIsolates(content: string) {
  return content.replace(BIDI_ISOLATE, '');
}

/**
 * One comment thread, two parents: a ticket or a requirement.
 *
 * They are the same object — text, a visibility, mentions and files — and the
 * rules that matter (INTERNAL is the programming team's channel, a mention is a
 * read grant so it has to be filtered before it is stored) are identical. The
 * only thing that differs is which row answers "can this person reach it", and
 * that is what `resolveParent` returns.
 */
@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private attachments: AttachmentsService,
    private meetings: MeetingAccessService,
    private notifications: NotificationsService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async create(ref: CommentParentRef, dto: CreateCommentDto, user: any) {
    assertCan(user, 'comment:create');
    const parent = await this.resolveParent(ref, user);

    if (dto.visibility === 'INTERNAL') {
      // INTERNAL is the programming team's channel (req.md §12) — the business
      // roles cannot write there any more than they can read it.
      assertCan(user, 'comment:internal');
    }

    const visibility = dto.visibility || 'PUBLIC';
    const mentions = await this.resolveMentions(parent, visibility, dto.mentions, user);

    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId: parent.kind === 'ticket' ? parent.id : null,
        requirementId: parent.kind === 'requirement' ? parent.id : null,
        authorId: user.id,
        content: stripBidiIsolates(dto.content),
        visibility,
        mentions,
      },
      include: COMMENT_INCLUDE,
    });

    for (const userId of parent.notifyUserIds) {
      await this.notifications.notify(
        userId,
        {
          type: NotificationType.COMMENT_ADDED,
          title:
            parent.kind === 'ticket' ? 'تعليق جديد على تذكرتك' : 'تعليق جديد على متطلبك',
          body: `${user.firstName} ${user.lastName} علّق على «${parent.title}»`,
          ...this.parentKeys(parent),
        },
        user.id,
      );
    }

    await this.announceMentions(mentions, parent, user);

    return comment;
  }

  /**
   * Editing rewrites the mention list too — a name deleted from the text has to
   * lose the read grant that mention carried, and a name added has to gain it.
   * Only people newly mentioned are notified, so re-saving a typo stays quiet.
   */
  async update(id: string, dto: UpdateCommentDto, user: any) {
    const comment = await this.prisma.ticketComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id) throw new ForbiddenException('Not your comment');

    const parent = await this.resolveParent(comment, user);

    const mentions =
      dto.mentions === undefined
        ? comment.mentions
        : await this.resolveMentions(parent, comment.visibility, dto.mentions, user);

    const updated = await this.prisma.ticketComment.update({
      where: { id },
      data: {
        content: dto.content === undefined ? undefined : stripBidiIsolates(dto.content),
        mentions,
      },
      include: COMMENT_INCLUDE,
    });

    const previous = new Set(comment.mentions);
    await this.announceMentions(
      mentions.filter((mid) => !previous.has(mid)),
      parent,
      user,
    );

    return updated;
  }

  /**
   * A comment belongs to whoever wrote it: editing and deleting are the author's
   * alone, no matter how senior the reader. Nobody else may rewrite the record
   * of what was said.
   *
   * Attachments hang off the comment by a foreign key, so the files go first —
   * otherwise the delete fails and leaves orphaned uploads on disk. Tickets are
   * never deleted (req.md §21); a comment is not a ticket.
   */
  async delete(id: string, user: any) {
    const comment = await this.prisma.ticketComment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== user.id) throw new ForbiddenException('Not your comment');
    await this.resolveParent(comment, user);

    await this.attachments.deleteForComment(id);
    return this.prisma.ticketComment.delete({ where: { id } });
  }

  // ----------------------------------------------------------------- parents

  /**
   * Loads the thread's parent and checks the caller against it. Every public
   * method goes through here, so there is no path to a comment on a row the
   * reader could not have opened.
   */
  private async resolveParent(
    ref: CommentParentRef,
    user: any,
  ): Promise<ResolvedCommentParent> {
    const { kind, id } = pickParent(ref);
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';

    if (kind === 'ticket') {
      const ticket = await this.prisma.ticket.findUnique({
        where: { id },
        include: {
          company: { select: { name: true } },
          system: { select: { name: true } },
        },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      await this.access.assertCanViewTicket(id, user);

      return {
        kind,
        id,
        title: ticket.title,
        number: ticket.ticketNumber,
        scope: {
          id: ticket.id,
          creatorId: ticket.creatorId,
          systemOwnerId: ticket.systemOwnerId,
          systemId: ticket.systemId,
          companyId: ticket.companyId,
        },
        notifyUserIds: [ticket.creatorId],
        url: `${frontendUrl}/tickets/${id}`,
        companyName: ticket.company?.name,
        systemName: ticket.system?.name,
      };
    }

    const requirement = await this.prisma.requirement.findUnique({
      where: { id },
      include: {
        company: { select: { name: true } },
        system: { select: { name: true } },
      },
    });
    if (!requirement) throw new NotFoundException('Requirement not found');
    this.meetings.assertCan(user, 'requirement:read');
    await this.meetings.assertCanViewRequirement(requirement, user);

    return {
      kind,
      id,
      title: requirement.title,
      number: requirement.requirementNumber,
      scope: {
        id: requirement.id,
        // The person who filed it plays the creator's part: they always reach
        // their own row, exactly as a ticket's creator does.
        creatorId: requirement.createdById,
        systemOwnerId: requirement.ownerId,
        systemId: requirement.systemId,
        companyId: requirement.companyId,
      },
      notifyUserIds: [requirement.createdById, requirement.ownerId].filter(
        (value): value is string => Boolean(value),
      ),
      url: `${frontendUrl}/requirements/${id}`,
      companyName: requirement.company?.name,
      systemName: requirement.system?.name,
    };
  }

  /** The foreign key a notification about this parent should carry. */
  private parentKeys(parent: ResolvedCommentParent) {
    return parent.kind === 'ticket'
      ? { ticketId: parent.id }
      : { requirementId: parent.id };
  }

  /**
   * A mention notifies and emails the thread's title, and a mentioned developer
   * gains the row in their list — so it is a read grant in disguise. Filter
   * before the insert, not after, or the stored array hands out that access.
   */
  private async resolveMentions(
    parent: ResolvedCommentParent,
    visibility: string,
    raw: string[] | undefined,
    user: any,
  ): Promise<string[]> {
    let mentions = await this.access.filterMentionable(
      parent.scope,
      (raw ?? []).filter((id: string) => id !== user.id),
    );

    if (visibility === 'INTERNAL' && mentions.length) {
      const candidates = await this.prisma.user.findMany({
        where: { id: { in: mentions } },
        select: { id: true, role: true },
      });
      mentions = candidates.filter((u) => can(u.role, 'ticket:read-internal')).map((u) => u.id);
    }

    return mentions;
  }

  private async announceMentions(
    mentions: string[],
    parent: ResolvedCommentParent,
    user: any,
  ) {
    if (!mentions.length) return;

    await this.notifications.notifyMany(
      mentions,
      {
        type: NotificationType.COMMENT_ADDED,
        title: 'تمت الإشارة إليك في تعليق',
        body: `${user.firstName} ${user.lastName} أشار إليك في «${parent.title}»`,
        ...this.parentKeys(parent),
      },
      user.id,
    );

    // SMTP can take seconds. The comment and in-app notification are already
    // durable, so email delivery must not hold the HTTP response open.
    void this.sendMentionEmails(mentions, parent, user).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to prepare mention emails: ${message}`);
    });
  }

  private async sendMentionEmails(
    mentions: string[],
    parent: ResolvedCommentParent,
    user: any,
  ) {
    const mentionedUsers = await this.prisma.user.findMany({
      where: { id: { in: mentions } },
      select: { email: true },
    });

    const mentionerName = `${user.firstName} ${user.lastName}`;
    const scope = {
      companyName: parent.companyName ?? undefined,
      systemName: parent.systemName ?? undefined,
    };

    // Same mail, two nouns: the subject and the CTA name what the reader is
    // being sent to, and a requirement is not a ticket.
    await Promise.all(
      mentionedUsers.map((mentionedUser) =>
        parent.kind === 'ticket'
          ? this.email.sendMentionEmail(
              mentionedUser.email,
              mentionerName,
              parent.title,
              parent.url,
              parent.number,
              scope,
            )
          : this.email.sendRequirementMention(
              mentionedUser.email,
              mentionerName,
              parent.title,
              parent.url,
              parent.number,
              scope,
            ),
      ),
    );
  }
}
