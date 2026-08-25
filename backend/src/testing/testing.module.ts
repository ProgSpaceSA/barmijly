import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SuitesController } from './suites.controller';
import { SuitesService } from './suites.service';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { StepsService } from './steps.service';
import { TestingAccessService } from './testing.access';
import { TestRollupService } from './test-rollup.service';

/**
 * Suites, cases, results and the ordered steps both cases and bugs use.
 *
 * `StepsService` and `TestingAccessService` are exported because the bugs
 * module leans on them: a bug's repro steps are the same rows as a case's
 * execution steps, and both surfaces answer scope the same way.
 */
@Module({
  imports: [AuditModule, NotificationsModule],
  providers: [
    SuitesService,
    CasesService,
    StepsService,
    TestingAccessService,
    TestRollupService,
  ],
  controllers: [SuitesController, CasesController],
  exports: [StepsService, TestingAccessService, TestRollupService],
})
export class TestingModule {}
