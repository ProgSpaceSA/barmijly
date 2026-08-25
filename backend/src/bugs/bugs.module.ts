import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TestingModule } from '../testing/testing.module';
import { BugsController } from './bugs.controller';
import { BugsService } from './bugs.service';

/**
 * Depends on `TestingModule` one way only: a bug reads a case's scope and
 * reuses its ordered steps, but nothing in testing reaches back for a bug.
 */
@Module({
  imports: [AuditModule, EmailModule, NotificationsModule, TestingModule],
  providers: [BugsService],
  controllers: [BugsController],
})
export class BugsModule {}
