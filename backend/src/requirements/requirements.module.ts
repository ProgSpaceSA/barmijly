import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';

/**
 * The requirements backlog and the promote flow that turns one into a DRAFT
 * ticket. Scope comes from the global `MeetingAccessModule`; nothing here is
 * imported by the meetings module, so the dependency runs one way only.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [RequirementsService],
  controllers: [RequirementsController],
})
export class RequirementsModule {}
