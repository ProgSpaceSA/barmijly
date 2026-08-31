-- AlterTable
ALTER TABLE "TicketTask" ADD COLUMN     "isBlocking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "TicketTask_ticketId_order_idx" ON "TicketTask"("ticketId", "order");

-- Every existing task lands on order 0, which would make the list order
-- arbitrary. Tasks were rendered by creation time until now, so replay that as
-- the starting order and no ticket's list moves on deploy.
UPDATE "TicketTask" t
SET "order" = o.rn - 1
FROM (
  SELECT "id",
         ROW_NUMBER() OVER (PARTITION BY "ticketId" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "TicketTask"
) o
WHERE t."id" = o."id";
