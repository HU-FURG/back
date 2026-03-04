/*
  Warnings:

  - You are about to drop the column `roomId` on the `RoomPeriodCanceled` table. All the data in the column will be lost.
  - Added the required column `roomBloco` to the `RoomPeriodCanceled` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roomIdAmbiente` to the `RoomPeriodCanceled` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RoomPeriodCanceled" DROP CONSTRAINT "RoomPeriodCanceled_roomId_fkey";

-- DropIndex
DROP INDEX "RoomPeriodCanceled_roomId_idx";

-- AlterTable
ALTER TABLE "RoomPeriodCanceled" DROP COLUMN "roomId",
ADD COLUMN     "roomBloco" TEXT NOT NULL,
ADD COLUMN     "roomIdAmbiente" TEXT NOT NULL;
