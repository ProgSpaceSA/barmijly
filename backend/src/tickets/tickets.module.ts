import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { TicketWorkModule } from './ticket-work.module';

@Module({
  imports: [NotificationsModule, AuditModule, EmailModule, TicketWorkModule],
  providers: [TicketsService],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
