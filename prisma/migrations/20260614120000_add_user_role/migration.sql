-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'operator');

-- AlterTable: добавляем роль с дефолтом operator
ALTER TABLE "User" ADD COLUMN "role" "Role" NOT NULL DEFAULT 'operator';

-- Существующие пользователи получают роль admin, чтобы не потерять доступ к /manage
UPDATE "User" SET "role" = 'admin';
