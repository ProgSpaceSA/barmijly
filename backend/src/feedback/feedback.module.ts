import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';

/**
 * Complaints and improvements. Not company-scoped — the gate is who may see
 * the row, not which system it belongs to.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [FeedbackService],
  controllers: [FeedbackController],
})
export class FeedbackModule {}
