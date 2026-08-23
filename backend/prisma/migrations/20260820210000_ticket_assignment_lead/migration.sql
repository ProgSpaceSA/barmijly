-- TicketAssignment becomes a membership table: one row per (ticket, developer),
-- with one of the active rows flagged as the lead. Assignment history moves to
-- AuditLog, which is where a "who changed what" record belongs anyway.

-- 1. Collapse duplicate pairs left over from the old append-only behaviour.
--    Ordering by isActive first guarantees a live row is never dropped in
--    favour of a stale one.
DELETE FROM "TicketAssignment" WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", ROW_NUMBER() OVER (
      PARTITION BY "ticketId", "developerId"
      ORDER BY "isActive" DESC, "createdAt" DESC, "id" DESC
    ) AS rn
    FROM "TicketAssignment"
  ) ranked WHERE rn > 1
);

-- 2. Add the flag.
ALTER TABLE "TicketAssignment" ADD COLUMN "isLead" BOOLEAN NOT NULL DEFAULT false;

-- 3. Elect the existing single active developer as lead. DISTINCT ON is
--    defensive: assign() already kept one active row per ticket, but electing
--    two leads would make step 5 fail on live data.
UPDATE "TicketAssignment" SET "isLead" = true WHERE "id" IN (
  SELECT DISTINCT ON ("ticketId") "id" FROM "TicketAssignment"
  WHERE "isActive" = true
  ORDER BY "ticketId", "createdAt" DESC, "id" DESC
);

-- 4. One membership row per developer per ticket.
CREATE UNIQUE INDEX "TicketAssignment_ticketId_developerId_key"
  ON "TicketAssignment"("ticketId", "developerId");

CREATE INDEX "TicketAssignment_ticketId_isActive_idx"
  ON "TicketAssignment"("ticketId", "isActive");

-- 5. One lead per ticket, as a database guarantee rather than a convention.
CREATE UNIQUE INDEX "TicketAssignment_one_active_lead"
  ON "TicketAssignment"("ticketId") WHERE "isLead" AND "isActive";
