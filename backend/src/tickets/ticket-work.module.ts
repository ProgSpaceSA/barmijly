import { Module } from '@nestjs/common';
import { AssignmentSyncService } from './assignment-sync.service';
import { TaskRollupService } from './task-rollup.service';

/**
 * The slice of ticket bookkeeping that both TicketsService and TasksService need.
 *
 * It exists to break what would otherwise be a circular import: a task write has
 * to update its ticket, and a ticket write has to read its tasks. Nothing in here
 * imports either service, so both modules can depend on it.
 */
@Module({
  providers: [AssignmentSyncService, TaskRollupService],
  exports: [AssignmentSyncService, TaskRollupService],
})
export class TicketWorkModule {}
