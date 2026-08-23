import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { TicketWorkModule } from '../tickets/ticket-work.module';

@Module({
  imports: [NotificationsModule, AuditModule, EmailModule, TicketWorkModule],
  providers: [TasksService],
  controllers: [TasksController],
})
export class TasksModule {}
