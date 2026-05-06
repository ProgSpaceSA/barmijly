import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AttachmentsService {
  private uploadDir: string;

  constructor(private prisma: PrismaService, private config: ConfigService) {
    this.uploadDir = config.get<string>('UPLOAD_DIR', './uploads');
    if (!fs.existsSync(this.uploadDir)) fs.mkdirSync(this.uploadDir, { recursive: true });
  }

  async upload(file: Express.Multer.File, ticketId: string | undefined, commentId: string | undefined, user: any) {
    if (!ticketId && !commentId) throw new BadRequestException('Must provide ticketId or commentId');
    const url = `/uploads/${file.filename}`;
    return this.prisma.ticketAttachment.create({
      data: { fileName: file.originalname, fileSize: file.size, mimeType: file.mimetype, url, ticketId, commentId, uploadedById: user.id },
    });
  }

  async delete(id: string, user: any) {
    const attachment = await this.prisma.ticketAttachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const managerRoles: string[] = [UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER];
    const canDelete = attachment.uploadedById === user.id || managerRoles.includes(user.role);
    if (!canDelete) throw new ForbiddenException('Cannot delete this attachment');
    const filePath = path.join(process.cwd(), attachment.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return this.prisma.ticketAttachment.delete({ where: { id } });
  }
}
