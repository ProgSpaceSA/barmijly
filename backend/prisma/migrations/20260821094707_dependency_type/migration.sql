-- CreateEnum
CREATE TYPE "TicketDependencyType" AS ENUM ('BLOCKS', 'RELATES_TO', 'DUPLICATES');

-- AlterTable
ALTER TABLE "TicketDependency" ADD COLUMN     "type" "TicketDependencyType" NOT NULL DEFAULT 'BLOCKS';
