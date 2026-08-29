import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';

/**
 * Meetings, their attendees, the systems they cover, and the ordered minutes.
 *
 * Scope lives in `MeetingAccessModule`, which is global — comments, attachments
 * and notifications all need the same answer, and meetings depend on
 * notifications, so exporting the scope service from here would close a cycle.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [MeetingsService],
  controllers: [MeetingsController],
})
export class MeetingsModule {}
