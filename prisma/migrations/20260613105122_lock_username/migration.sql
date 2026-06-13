/*
  Warnings:

  - Added the required column `lockedByUsername` to the `Lock` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Lock" ADD COLUMN     "lockedByUsername" TEXT NOT NULL;
