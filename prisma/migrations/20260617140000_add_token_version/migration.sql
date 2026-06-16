-- AlterTable: версия токена для отзыва JWT (logout/смена пароля)
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;
