-- CreateTable strategic_objectives
CREATE TABLE "strategic_objectives" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'blue',
    "icon" TEXT NOT NULL DEFAULT '🎯',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "strategic_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable strategic_lines
CREATE TABLE "strategic_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "strategic_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strategic_objectives_organizationId_idx" ON "strategic_objectives"("organizationId");
CREATE UNIQUE INDEX "strategic_objectives_organizationId_code_key" ON "strategic_objectives"("organizationId", "code");

-- CreateIndex
CREATE INDEX "strategic_lines_organizationId_idx" ON "strategic_lines"("organizationId");
CREATE INDEX "strategic_lines_objectiveId_idx" ON "strategic_lines"("objectiveId");
CREATE UNIQUE INDEX "strategic_lines_organizationId_code_key" ON "strategic_lines"("organizationId", "code");

-- AddForeignKey
ALTER TABLE "strategic_objectives" ADD CONSTRAINT "strategic_objectives_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_lines" ADD CONSTRAINT "strategic_lines_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "strategic_lines" ADD CONSTRAINT "strategic_lines_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "strategic_objectives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
