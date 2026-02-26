/*
  Warnings:

  - You are about to drop the column `nome` on the `PeriodHistory` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `PeriodHistory` table. All the data in the column will be lost.
  - You are about to drop the column `nome` on the `RoomPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `RoomPeriod` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PeriodHistory" DROP CONSTRAINT "PeriodHistory_userId_fkey";

-- DropForeignKey
ALTER TABLE "RoomPeriod" DROP CONSTRAINT "RoomPeriod_userId_fkey";

-- DropIndex
DROP INDEX "PeriodHistory_roomIdAmbiente_weekday_used_idx";

-- DropIndex
DROP INDEX "PeriodHistory_weekday_idx";

-- DropIndex
DROP INDEX "RoomPeriod_userId_idx";

-- AlterTable
ALTER TABLE "PeriodHistory" DROP COLUMN "nome",
DROP COLUMN "userId",
ADD COLUMN     "createdById" INTEGER,
ADD COLUMN     "createdByLogin" TEXT,
ADD COLUMN     "createdByNome" TEXT,
ADD COLUMN     "roomTipo" TEXT,
ADD COLUMN     "scheduledForId" INTEGER,
ADD COLUMN     "scheduledForLogin" TEXT,
ADD COLUMN     "scheduledForNome" TEXT;

-- AlterTable
ALTER TABLE "RoomPeriod" DROP COLUMN "nome",
DROP COLUMN "userId",
ADD COLUMN     "createdById" INTEGER NOT NULL,
ADD COLUMN     "scheduledForId" INTEGER;

-- CreateIndex
CREATE INDEX "PeriodHistory_createdById_idx" ON "PeriodHistory"("createdById");

-- CreateIndex
CREATE INDEX "PeriodHistory_scheduledForId_idx" ON "PeriodHistory"("scheduledForId");

-- CreateIndex
CREATE INDEX "RoomPeriod_createdById_idx" ON "RoomPeriod"("createdById");

-- CreateIndex
CREATE INDEX "RoomPeriod_scheduledForId_idx" ON "RoomPeriod"("scheduledForId");

-- AddForeignKey
ALTER TABLE "RoomPeriod" ADD CONSTRAINT "RoomPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPeriod" ADD CONSTRAINT "RoomPeriod_scheduledForId_fkey" FOREIGN KEY ("scheduledForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
