ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "taskId" TEXT;
ALTER TABLE "TicketAttachment" DROP CONSTRAINT IF EXISTS "TicketAttachment_taskId_fkey";
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "TicketTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
