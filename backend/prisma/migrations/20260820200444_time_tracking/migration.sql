-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TicketTask" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- Backfill from the status history so tickets that are already in flight do not
-- report a null start. MIN, not MAX: startedAt is the first time work began,
-- even if the ticket bounced back to IN_PROGRESS later.
UPDATE "Ticket" t SET "startedAt" = h.first_at FROM (
  SELECT "ticketId", MIN("createdAt") AS first_at FROM "TicketStatusHistory"
  WHERE "toStatus" = 'IN_PROGRESS' GROUP BY "ticketId"
) h WHERE h."ticketId" = t.id;

UPDATE "Ticket" t SET "completedAt" = h.first_at FROM (
  SELECT "ticketId", MIN("createdAt") AS first_at FROM "TicketStatusHistory"
  WHERE "toStatus" = 'COMPLETED' GROUP BY "ticketId"
) h WHERE h."ticketId" = t.id AND t."status" IN ('COMPLETED', 'CLOSED');
