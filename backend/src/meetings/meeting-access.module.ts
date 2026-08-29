import { Global, Module } from '@nestjs/common';
import { MeetingAccessService } from './meetings.access';

/**
 * Global for the same reason `AccessModule` is: meetings and requirements are
 * reachable from comments, attachments and notifications as well as from their
 * own controllers, and every one of those has to answer the same scope question.
 * Handing the service out globally is what keeps that answer in one place —
 * and it breaks the cycle a plain `MeetingsModule` export would create, since
 * meetings themselves depend on notifications.
 */
@Global()
@Module({
  providers: [MeetingAccessService],
  exports: [MeetingAccessService],
})
export class MeetingAccessModule {}
