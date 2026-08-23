-- Enum value only. Postgres refuses to *use* a newly added enum value in the
-- same transaction that adds it, so nothing that writes 'BLOCKED' may share this
-- migration — including the columns in the next one. Splitting it here is what
-- keeps `migrate deploy` from failing in production while passing locally on a
-- fresh database.
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'BLOCKED';
