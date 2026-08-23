-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "blockedByTicketId" TEXT,
ADD COLUMN     "pauseReason" TEXT;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_blockedByTicketId_fkey" FOREIGN KEY ("blockedByTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
