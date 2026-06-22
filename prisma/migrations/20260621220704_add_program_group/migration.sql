-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "programGroupId" INTEGER;

-- CreateTable
CREATE TABLE "ProgramGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramGroup_name_key" ON "ProgramGroup"("name");

-- CreateIndex
CREATE INDEX "Program_programGroupId_idx" ON "Program"("programGroupId");

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_programGroupId_fkey" FOREIGN KEY ("programGroupId") REFERENCES "ProgramGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
