-- Create TaskStatus enum if not exists
DO $$ BEGIN
  CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add TASK_ASSIGNED to NotificationType enum if not exists
DO $$ BEGIN
  ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TASK_ASSIGNED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create TicketTask table if not exists
CREATE TABLE IF NOT EXISTS "TicketTask" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketTask_pkey" PRIMARY KEY ("id")
);

-- Add FKs for TicketTask if not exists
DO $$ BEGIN
  ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TicketTask" ADD CONSTRAINT "TicketTask_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add taskId to TicketAttachment if not exists
ALTER TABLE "TicketAttachment" ADD COLUMN IF NOT EXISTS "taskId" TEXT;

DO $$ BEGIN
  ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "TicketTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add changedById to TicketStatusHistory if not exists
ALTER TABLE "TicketStatusHistory" ADD COLUMN IF NOT EXISTS "changedById" TEXT;

DO $$ BEGIN
  ALTER TABLE "TicketStatusHistory" ADD CONSTRAINT "TicketStatusHistory_changedById_fkey"
    FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add dueDate to TicketTask if not exists
ALTER TABLE "TicketTask" ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3);
