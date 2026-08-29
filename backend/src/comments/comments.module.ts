import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController, RequirementCommentsController } from './comments.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AttachmentsModule } from '../attachments/attachments.module';

@Module({
  imports: [NotificationsModule, EmailModule, AttachmentsModule],
  providers: [CommentsService],
  controllers: [CommentsController, RequirementCommentsController],
  exports: [CommentsService],
})
export class CommentsModule {}
