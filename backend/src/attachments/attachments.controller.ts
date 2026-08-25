import {
  Controller, Get, Post, Delete, Param, Query, Res, UseGuards,
  UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiOperation } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Attachments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private attachmentsService: AttachmentsService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          const dir = process.env.UPLOAD_DIR || './uploads';
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, `${uuid()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        const allowed = ['image/', 'application/pdf', 'application/vnd.', 'text/', 'video/', 'application/zip'];
        const isAllowed = allowed.some((t) => file.mimetype.startsWith(t) || file.mimetype.includes(t));
        cb(isAllowed ? null : new Error('File type not allowed'), isAllowed);
      },
    }),
  )
  upload(
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })] }))
    file: Express.Multer.File,
    @Query('ticketId') ticketId: string,
    @Query('commentId') commentId: string,
    @Query('taskId') taskId: string,
    @Query('testCaseId') testCaseId: string,
    @Query('bugId') bugId: string,
    @Query('testStepId') testStepId: string,
    @Query('suiteId') suiteId: string,
    @CurrentUser() user: any,
  ) {
    return this.attachmentsService.upload(
      file,
      { ticketId, commentId, taskId, testCaseId, bugId, testStepId, suiteId },
      user,
    );
  }

  @Get(':id/file')
  @ApiOperation({
    summary: 'Download an attachment, enforcing the ticket scope of the caller',
  })
  async download(@Param('id') id: string, @CurrentUser() user: any, @Res() res: Response) {
    const { filePath, attachment } = await this.attachmentsService.resolveDownload(id, user);
    res.type(attachment.mimeType);
    // inline so images still render in the ticket thread
    res.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    res.sendFile(filePath);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.attachmentsService.delete(id, user);
  }
}
