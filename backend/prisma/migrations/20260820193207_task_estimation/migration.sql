-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "tasksEstimatedHours" INTEGER,
ADD COLUMN     "tasksWeightTotal" INTEGER;

-- AlterTable
ALTER TABLE "TicketTask" ADD COLUMN     "difficultyLevel" INTEGER,
ADD COLUMN     "estimatedHours" INTEGER;

-- CreateIndex
CREATE INDEX "TicketTask_ticketId_status_idx" ON "TicketTask"("ticketId", "status");

-- CreateIndex
CREATE INDEX "TicketTask_assignedToId_status_idx" ON "TicketTask"("assignedToId", "status");

-- Difficulty is a 1-5 scale everywhere it appears. DTO validation only covers
-- the HTTP path; seeds, migrations and raw SQL reach the column directly.
ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_difficultyLevel_range"
  CHECK ("difficultyLevel" IS NULL OR ("difficultyLevel" BETWEEN 1 AND 5));
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_difficultyLevel_range"
  CHECK ("difficultyLevel" IS NULL OR ("difficultyLevel" BETWEEN 1 AND 5));
