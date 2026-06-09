-- Сужение enum ApplicantStatus до applied/withdrawn, смена default на 'applied'.
-- Перед применением все строки уже приведены к applied/withdrawn (re-seed).

-- Подстраховка: ремап любых оставшихся старых значений.
ALTER TABLE "Applicant" ALTER COLUMN "status" DROP DEFAULT;

UPDATE "Applicant" SET "status" = 'applied'
  WHERE "status" IN ('new', 'accepted');
UPDATE "Applicant" SET "status" = 'withdrawn'
  WHERE "status" = 'rejected';

-- Пересоздаём enum-тип (PostgreSQL не умеет удалять значения из enum).
ALTER TYPE "ApplicantStatus" RENAME TO "ApplicantStatus_old";
CREATE TYPE "ApplicantStatus" AS ENUM ('applied', 'withdrawn');

ALTER TABLE "Applicant"
  ALTER COLUMN "status" TYPE "ApplicantStatus"
  USING ("status"::text::"ApplicantStatus");

DROP TYPE "ApplicantStatus_old";

ALTER TABLE "Applicant" ALTER COLUMN "status" SET DEFAULT 'applied';
