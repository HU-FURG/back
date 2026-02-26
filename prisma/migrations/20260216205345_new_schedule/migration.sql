/*
  Warnings:

  - You are about to drop the column `maxScheduleTime` on the `RoomPeriod` table. All the data in the column will be lost.
  - You are about to drop the `DailyRoomReport` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `endSchedule` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startSchedule` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "typeSchedule" AS ENUM ('consulta', 'aula');

-- CreateEnum
CREATE TYPE "availabilityStatus" AS ENUM ('ok', 'bom', 'exelente');

-- AlterTable
ALTER TABLE "RoomPeriod" DROP COLUMN "maxScheduleTime",
ADD COLUMN     "atualRecurrenceCount" INTEGER DEFAULT 0,
ADD COLUMN     "availabilityStatus" "availabilityStatus" DEFAULT 'ok',
ADD COLUMN     "countRecurrence" INTEGER,
ADD COLUMN     "endSchedule" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "startSchedule" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "typeSchedule" "typeSchedule" DEFAULT 'consulta';

-- DropTable
DROP TABLE "DailyRoomReport";

-- CreateTable
CREATE TABLE "PeriodReportDaily" (
    "id" SERIAL NOT NULL,
    "idPeriod" INTEGER NOT NULL,
    "createdById" INTEGER NOT NULL,
    "scheduledForId" INTEGER NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "totalUsedMinutes" INTEGER,
    "availabilityStatus" "availabilityStatus" DEFAULT 'ok',
    "typeSchedule" "typeSchedule",
    "used" BOOLEAN DEFAULT true,
    "roomDailyId" INTEGER NOT NULL,

    CONSTRAINT "PeriodReportDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roomTimeUsedDaily" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weekday" INTEGER NOT NULL,
    "roomIdAmbiente" TEXT NOT NULL,
    "roomBloco" TEXT NOT NULL,
    "totalUsedMinutes" INTEGER NOT NULL,

    CONSTRAINT "roomTimeUsedDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PeriodReportDaily_idPeriod_roomDailyId_key" ON "PeriodReportDaily"("idPeriod", "roomDailyId");

-- CreateIndex
CREATE INDEX "roomTimeUsedDaily_date_idx" ON "roomTimeUsedDaily"("date");

-- CreateIndex
CREATE INDEX "roomTimeUsedDaily_roomIdAmbiente_date_idx" ON "roomTimeUsedDaily"("roomIdAmbiente", "date");

-- AddForeignKey
ALTER TABLE "PeriodReportDaily" ADD CONSTRAINT "PeriodReportDaily_roomDailyId_fkey" FOREIGN KEY ("roomDailyId") REFERENCES "roomTimeUsedDaily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
