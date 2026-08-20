import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AccessService } from '../access/access.service';
import { assertCan, can } from '../access/permissions';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private config: ConfigService,
  ) {
    this.uploadDir = config.get<string>('UPLOAD_DIR', './uploads');
    if (!fs.existsSync(this.uploadDir)) fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  async upload(
    file: Express.Multer.File,
    ticketId: string | undefined,
    commentId: string | undefined,
    taskId: string | undefined,
    user: any,
  ) {
    assertCan(user, 'attachment:upload');
    if (!ticketId && !commentId && !taskId) {
      throw new BadRequestException('Must provide ticketId, commentId, or taskId');
    }

    // Every target resolves to one ticket, and that ticket decides the answer.
    await this.access.assertCanViewTicket(
      await this.resolveTicketId({ ticketId, commentId, taskId }),
      user,
    );

    const url = `/uploads/${file.filename}`;
    return this.prisma.ticketAttachment.create({
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        url,
        ticketId: ticketId || null,
        commentId: commentId || null,
        taskId: taskId || null,
        uploadedById: user.id,
      },
    });
  }

  /**
   * Resolves an attachment to a file on disk, for the authorised download route.
   * Static `/uploads` serving stays in place for company logos, so this is the
   * only path that enforces ticket scope on the bytes themselves.
   */
  async resolveDownload(id: string, user: any) {
    const attachment = await this.prisma.ticketAttachment.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        url: true,
        ticketId: true,
        commentId: true,
        taskId: true,
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.access.assertCanViewTicket(await this.resolveTicketId(attachment), user);

    // url is always `/uploads/<generated-name>`; take the basename so a crafted
    // record can never walk out of the upload directory.
    const filePath = path.join(this.uploadDir, path.basename(attachment.url));
    if (!fs.existsSync(filePath)) throw new NotFoundException('File is no longer on disk');

    return { filePath: path.resolve(filePath), attachment };
  }

  async delete(id: string, user: any) {
    const attachment = await this.prisma.ticketAttachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('Attachment not found');

    const canDelete = attachment.uploadedById === user.id || can(user.role, 'attachment:moderate');
    if (!canDelete) throw new ForbiddenException('Cannot delete this attachment');
    await this.access.assertCanViewTicket(await this.resolveTicketId(attachment), user);

    const filePath = path.join(this.uploadDir, path.basename(attachment.url));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return this.prisma.ticketAttachment.delete({ where: { id } });
  }

  /**
   * Clears a comment's uploads ahead of deleting the comment itself. Access was
   * already decided by the caller that owns the comment, so this only does the
   * disk + row cleanup that the foreign key would otherwise block.
   */
  async deleteForComment(commentId: string) {
    const attachments = await this.prisma.ticketAttachment.findMany({
      where: { commentId },
      select: { id: true, url: true },
    });
    if (!attachments.length) return 0;

    for (const attachment of attachments) {
      const filePath = path.join(this.uploadDir, path.basename(attachment.url));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const { count } = await this.prisma.ticketAttachment.deleteMany({ where: { commentId } });
    return count;
  }

  /** Walks comment / task links back to the ticket that governs access. */
  private async resolveTicketId(ref: {
    ticketId?: string | null;
    commentId?: string | null;
    taskId?: string | null;
  }): Promise<string> {
    if (ref.ticketId) return ref.ticketId;

    if (ref.commentId) {
      const comment = await this.prisma.ticketComment.findUnique({
        where: { id: ref.commentId },
        select: { ticketId: true },
      });
      if (!comment) throw new NotFoundException('Comment not found');
      return comment.ticketId;
    }

    if (ref.taskId) {
      const task = await this.prisma.ticketTask.findUnique({
        where: { id: ref.taskId },
        select: { ticketId: true },
      });
      if (!task) throw new NotFoundException('Task not found');
      return task.ticketId;
    }

    throw new BadRequestException('Attachment is not linked to a ticket');
  }
}
