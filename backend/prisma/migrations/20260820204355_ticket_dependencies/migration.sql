-- CreateTable
CREATE TABLE "TicketDependency" (
    "id" TEXT NOT NULL,
    "blockingTicketId" TEXT NOT NULL,
    "blockedTicketId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketDependency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketDependency_blockedTicketId_idx" ON "TicketDependency"("blockedTicketId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketDependency_blockingTicketId_blockedTicketId_key" ON "TicketDependency"("blockingTicketId", "blockedTicketId");

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_blockingTicketId_fkey" FOREIGN KEY ("blockingTicketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_blockedTicketId_fkey" FOREIGN KEY ("blockedTicketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketDependency" ADD CONSTRAINT "TicketDependency_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Carry over whatever meaning Ticket.relatedTicketId had: it was only ever set
-- as "this ticket relates to that one", and the only writer treated the target
-- as the earlier ticket. The column stays for now so this migration is
-- reversible; it is dropped separately once the new model is proven.
INSERT INTO "TicketDependency" ("id", "blockingTicketId", "blockedTicketId", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."relatedTicketId", t."id", t."creatorId", t."createdAt", t."createdAt"
FROM "Ticket" t
WHERE t."relatedTicketId" IS NOT NULL AND t."relatedTicketId" <> t."id"
ON CONFLICT DO NOTHING;
