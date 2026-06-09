-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('diploma', 'certificate');

-- AlterTable
ALTER TABLE "Applicant" ADD COLUMN     "additionalScores" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "citizenship" TEXT,
ADD COLUMN     "documentType" "DocumentType",
ADD COLUMN     "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "passportNumber" TEXT,
ADD COLUMN     "passportSeries" TEXT,
ADD COLUMN     "specialQuota" BOOLEAN NOT NULL DEFAULT false;
