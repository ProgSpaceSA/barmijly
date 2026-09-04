import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';

/**
 * The dev hub's tools catalogue and its request/decide flow. Nothing here is
 * company- or system-scoped, so no access module is imported — the role matrix
 * is the whole gate.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [ToolsService],
  controllers: [ToolsController],
})
export class ToolsModule {}
