-- AlterEnum
BEGIN;
CREATE TYPE "TaskStatus_new" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED');
ALTER TABLE "public"."TicketTask" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TicketTask" ALTER COLUMN "status" TYPE "TaskStatus_new" USING ("status"::text::"TaskStatus_new");
ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";
ALTER TYPE "TaskStatus_new" RENAME TO "TaskStatus";
DROP TYPE "public"."TaskStatus_old";
ALTER TABLE "TicketTask" ALTER COLUMN "status" SET DEFAULT 'NEW';
COMMIT;

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "logoUrl" TEXT;

-- AlterTable
ALTER TABLE "Ticket" ADD COLUMN     "ticketNumber" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "TicketTask" ALTER COLUMN "status" SET DEFAULT 'NEW',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");

