/*
  Warnings:

  - You are about to drop the column `cancelDescription` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `canceledByLogin` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `canceledByNome` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `createdByLogin` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `createdByNome` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `originalPeriodId` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `roomBloco` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `roomIdAmbiente` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `roomTipo` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledForLogin` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledForNome` on the `RoomPeriodCanceled` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "RoomPeriodCanceled_cancelReason_idx";

-- DropIndex
DROP INDEX "RoomPeriodCanceled_roomIdAmbiente_idx";

-- DropIndex
DROP INDEX "RoomPeriodCanceled_start_idx";

-- AlterTable
ALTER TABLE "RoomPeriodCanceled" DROP COLUMN "cancelDescription",
DROP COLUMN "canceledByLogin",
DROP COLUMN "canceledByNome",
DROP COLUMN "createdByLogin",
DROP COLUMN "createdByNome",
DROP COLUMN "originalPeriodId",
DROP COLUMN "roomBloco",
DROP COLUMN "roomIdAmbiente",
DROP COLUMN "roomTipo",
DROP COLUMN "scheduledForLogin",
DROP COLUMN "scheduledForNome",
ADD COLUMN     "roomId" INTEGER;

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_roomId_idx" ON "RoomPeriodCanceled"("roomId");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_createdById_idx" ON "RoomPeriodCanceled"("createdById");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_scheduledForId_idx" ON "RoomPeriodCanceled"("scheduledForId");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_canceledById_idx" ON "RoomPeriodCanceled"("canceledById");

-- AddForeignKey
ALTER TABLE "RoomPeriodCanceled" ADD CONSTRAINT "RoomPeriodCanceled_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPeriodCanceled" ADD CONSTRAINT "RoomPeriodCanceled_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPeriodCanceled" ADD CONSTRAINT "RoomPeriodCanceled_scheduledForId_fkey" FOREIGN KEY ("scheduledForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPeriodCanceled" ADD CONSTRAINT "RoomPeriodCanceled_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
