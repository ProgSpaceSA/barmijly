-- CreateEnum
CREATE TYPE "ToolTeam" AS ENUM ('FRONTEND', 'BACKEND', 'MOBILE', 'QA', 'PROJECT_MANAGEMENT');

-- AlterTable
ALTER TABLE "Tool" ADD COLUMN     "teams" "ToolTeam"[];
