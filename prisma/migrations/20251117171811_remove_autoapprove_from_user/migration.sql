/*
  Warnings:

  - You are about to drop the column `autoApprove` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."SystemLog" ADD COLUMN     "autoApprove" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "autoApprove";
