-- CreateEnum
CREATE TYPE "ToolCategory" AS ENUM ('AI_CODING', 'TESTING', 'DESIGN', 'DEPLOYMENT', 'MONITORING', 'DATABASE', 'COMMUNICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DECLINED', 'RETIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TOOL_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'TOOL_DECIDED';

-- CreateTable
CREATE TABLE "Tool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "gettingStarted" TEXT NOT NULL,
    "categories" "ToolCategory"[],
    "status" "ToolStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tool_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Tool_status_idx" ON "Tool"("status");

-- CreateIndex
CREATE INDEX "Tool_requestedById_idx" ON "Tool"("requestedById");

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tool" ADD CONSTRAINT "Tool_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
