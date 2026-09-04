-- CreateTable
CREATE TABLE "HubGuide" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "steps" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubGuide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubGuide_sortOrder_idx" ON "HubGuide"("sortOrder");

-- AddForeignKey
ALTER TABLE "HubGuide" ADD CONSTRAINT "HubGuide_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubGuide" ADD CONSTRAINT "HubGuide_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
