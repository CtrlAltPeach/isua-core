-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('ege', 'vi');

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "examType" "ExamType" NOT NULL DEFAULT 'ege',
ADD COLUMN     "viChemistry" INTEGER,
ADD COLUMN     "viGeography" INTEGER,
ADD COLUMN     "viInformatics" INTEGER,
ADD COLUMN     "viMathProfile" INTEGER,
ADD COLUMN     "viPhysics" INTEGER,
ADD COLUMN     "viRussian" INTEGER;

-- Существующие абитуриенты с общим баллом ВИ помечаем как поступающих по ВИ.
UPDATE "Applicant" SET "examType" = 'vi' WHERE "viScore" IS NOT NULL;

