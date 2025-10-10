/*
  Warnings:

  - You are about to drop the column `roomAla` on the `PeriodHistory` table. All the data in the column will be lost.
  - Added the required column `roomBloco` to the `PeriodHistory` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."PeriodHistory" DROP COLUMN "roomAla",
ADD COLUMN     "roomBloco" TEXT NOT NULL;
