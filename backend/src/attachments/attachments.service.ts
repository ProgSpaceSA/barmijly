import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AccessService } from '../access/access.service';
import { assertCan, can } from '../access/permissions';
import * as fs from 'fs';
import * as path from 'path';

/** Every owner an attachment can hang off. Exactly one is ever set. */
export interface AttachmentOwnerRef {
  ticketId?: string | null;
  commentId?: string | null;
  taskId?: string | null;
  testCaseId?: string | null;
  bugId?: string | null;
  testStepId?: string | null;
  suiteId?: string | null;
}

/** A step screenshot is a screenshot — the other owners keep the wide list. */
const STEP_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

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

  async upload(file: Express.Multer.File, owner: AttachmentOwnerRef, user: any) {
    assertCan(user, 'attachment:upload');
    if (!Object.values(owner).some(Boolean)) {
      throw new BadRequestException(
        'Must provide ticketId, commentId, taskId, testCaseId, bugId, testStepId, or suiteId',
      );
    }

    if (owner.testStepId) {
      // One image per step in v1: the UI shows a single 40×40 thumbnail, and a
      // second file would have nowhere to go. Replacing is delete-then-upload.
      if (!STEP_IMAGE_TYPES.includes(file.mimetype)) {
        throw new BadRequestException('لقطة الشاشة يجب أن تكون صورة (PNG, JPG, WEBP, GIF)');
      }
      const existing = await this.prisma.ticketAttachment.count({
        where: { testStepId: owner.testStepId },
      });
      if (existing) throw new BadRequestException('لكل خطوة لقطة شاشة واحدة — احذف الحالية أولاً');
    }

    // Every target resolves to one scope, and that scope decides the answer.
    await this.assertCanReach(owner, user);

    const url = `/uploads/${file.filename}`;
    return this.prisma.ticketAttachment.create({
      data: {
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        url,
        ticketId: owner.ticketId || null,
        commentId: owner.commentId || null,
        taskId: owner.taskId || null,
        testCaseId: owner.testCaseId || null,
        bugId: owner.bugId || null,
        testStepId: owner.testStepId || null,
        suiteId: owner.suiteId || null,
        uploadedById: user.id,
      },
    });
  }

  /**
   * Resolves an attachment to a file on disk, for the authorised download route.
   * Static `/uploads` serving stays in place for company logos, so this is the
   * only path that enforces scope on the bytes themselves.
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
        testCaseId: true,
        bugId: true,
        testStepId: true,
        suiteId: true,
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');

    await this.assertCanReach(attachment, user);

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
    await this.assertCanReach(attachment, user);

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

  /**
   * Ticket-shaped owners answer to the ticket scope; QA-shaped owners answer to
   * the system their suite or bug sits in. Both are checked here so a file can
   * never be reachable through an owner its own page would have hidden.
   */
  private async assertCanReach(ref: AttachmentOwnerRef, user: any) {
    const ticketId = await this.resolveTicketId(ref);
    if (ticketId) {
      await this.access.assertCanViewTicket(ticketId, user);
      return;
    }
    const systemId = await this.resolveSystemId(ref);
    if (systemId) {
      assertCan(user, 'test:read');
      await this.access.assertCanViewSystem(systemId, user);
      return;
    }
    throw new BadRequestException('Attachment is not linked to anything readable');
  }

  /** Walks comment / task links back to the ticket that governs access. */
  private async resolveTicketId(ref: AttachmentOwnerRef): Promise<string | null> {
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

    return null;
  }

  /** Walks case / bug / step links back to the system that governs access. */
  private async resolveSystemId(ref: AttachmentOwnerRef): Promise<string | null> {
    if (ref.testCaseId) {
      const testCase = await this.prisma.testCase.findUnique({
        where: { id: ref.testCaseId },
        select: { suite: { select: { systemId: true } } },
      });
      if (!testCase) throw new NotFoundException('Test case not found');
      return testCase.suite.systemId;
    }

    if (ref.bugId) {
      const bug = await this.prisma.bug.findUnique({
        where: { id: ref.bugId },
        select: { systemId: true },
      });
      if (!bug) throw new NotFoundException('Bug not found');
      return bug.systemId;
    }

    if (ref.testStepId) {
      const step = await this.prisma.testStep.findUnique({
        where: { id: ref.testStepId },
        select: {
          testCase: { select: { suite: { select: { systemId: true } } } },
          bug: { select: { systemId: true } },
        },
      });
      if (!step) throw new NotFoundException('Step not found');
      return step.testCase?.suite.systemId ?? step.bug?.systemId ?? null;
    }

    if (ref.suiteId) {
      const suite = await this.prisma.testSuite.findUnique({
        where: { id: ref.suiteId },
        select: { systemId: true },
      });
      if (!suite) throw new NotFoundException('Test suite not found');
      return suite.systemId;
    }

    return null;
  }
}
