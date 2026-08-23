import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { assertCan, can } from '../access/permissions';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { NotificationType } from '@prisma/client';

/**
 * The author shape the thread renders: the role rides along so the UI can badge
 * "who is talking" without a second lookup per comment (req.md §12).
 */
const COMMENT_INCLUDE = {
  author: { select: { id: true, firstName: true, lastName: true, role: true } },
  attachments: true,
} as const;

const BIDI_ISOLATE = /[\u2066\u2067\u2068\u2069]/g;

function stripBidiIsolates(content: string) {
  return content.replace(BIDI_ISOLATE, '');
}

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private attachments: AttachmentsService,
    private notifications: NotificationsService,
    private email: EmailService,
    private config: ConfigService,
  ) {}

  async create(ticketId: string, dto: CreateCommentDto, user: any) {
    assertCan(user, 'comment:create');

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        company: { select: { name: true } },
        system: { select: { name: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    await this.access.assertCanViewTicket(ticketId, user);

    if (dto.visibility === 'INTERNAL') {
      // INTERNAL is the programming team's channel (req.md §12) — the business
      // roles cannot write there any more than they can read it.
      assertCan(user, 'comment:internal');
    }

    const visibility = dto.visibility || 'PUBLIC';
    const mentions = await this.resolveMentions(ticket, visibility, dto.mentions, user);

    const comment = await this.prisma.ticketComment.create({
      data: {
        ticketId,
        authorId: user.id,
        content: stripBidiIsolates(dto.content),
        visibility,
        mentions,
      },
      include: COMMENT_INCLUDE,
    });

    await this.notifications.notify(ticket.creatorId, {
      type: NotificationType.COMMENT_ADDED,
      title: 'تعليق جديد على تذكرتك',
      body: `${user.firstName} ${user.lastName} علّق على «${ticket.title}»`,
      ticketId,
    }, user.id);

    await this.announceMentions(mentions, ticket, user);

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
    await this.access.assertCanViewTicket(comment.ticketId, user);

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: comment.ticketId },
      include: {
        company: { select: { name: true } },
        system: { select: { name: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const mentions =
      dto.mentions === undefined
        ? comment.mentions
        : await this.resolveMentions(ticket, comment.visibility, dto.mentions, user);

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
      ticket,
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
    await this.access.assertCanViewTicket(comment.ticketId, user);

    await this.attachments.deleteForComment(id);
    return this.prisma.ticketComment.delete({ where: { id } });
  }

  /**
   * A mention notifies and emails the ticket title, and a mentioned developer
   * gains the ticket in their list — so it is a read grant in disguise. Filter
   * before the insert, not after, or the stored array hands out that access.
   */
  private async resolveMentions(
    ticket: { id: string; systemId: string; companyId: string; creatorId: string; systemOwnerId: string | null },
    visibility: string,
    raw: string[] | undefined,
    user: any,
  ): Promise<string[]> {
    let mentions = await this.access.filterMentionable(
      ticket,
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
    ticket: {
      id: string;
      title: string;
      ticketNumber: number;
      company?: { name: string } | null;
      system?: { name: string } | null;
    },
    user: any,
  ) {
    if (!mentions.length) return;

    await this.notifications.notifyMany(mentions, {
      type: NotificationType.COMMENT_ADDED,
      title: 'تمت الإشارة إليك في تعليق',
      body: `${user.firstName} ${user.lastName} أشار إليك في «${ticket.title}»`,
      ticketId: ticket.id,
    }, user.id);

    const mentionedUsers = await this.prisma.user.findMany({
      where: { id: { in: mentions } },
      select: { email: true },
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const ticketUrl = `${frontendUrl}/tickets/${ticket.id}`;
    const mentionerName = `${user.firstName} ${user.lastName}`;
    const scope = {
      companyName: ticket.company?.name,
      systemName: ticket.system?.name,
    };

    for (const u of mentionedUsers) {
      await this.email.sendMentionEmail(
        u.email,
        mentionerName,
        ticket.title,
        ticketUrl,
        ticket.ticketNumber,
        scope,
      );
    }
  }
}
