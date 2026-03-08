/*
  Warnings:

  - You are about to drop the column `availabilityStatus` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `createdById` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `end` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `idPeriod` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `roomDailyId` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledForId` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `start` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `typeSchedule` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the column `used` on the `PeriodReportDaily` table. All the data in the column will be lost.
  - You are about to drop the `roomTimeUsedDaily` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `idPeriod` to the `PeriodHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `SalaAtiva` to the `PeriodReportDaily` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ScheduleDay` to the `PeriodReportDaily` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dayWeek` to the `PeriodReportDaily` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roomBloco` to the `PeriodReportDaily` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roomIdAmbiente` to the `PeriodReportDaily` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PeriodReportDaily" DROP CONSTRAINT "PeriodReportDaily_roomDailyId_fkey";

-- DropIndex
DROP INDEX "PeriodReportDaily_idPeriod_roomDailyId_key";

-- AlterTable
ALTER TABLE "PeriodHistory" ADD COLUMN     "availabilityStatus" "availabilityStatus" DEFAULT 'ok',
ADD COLUMN     "idPeriod" INTEGER NOT NULL,
ADD COLUMN     "typeSchedule" "typeSchedule";

-- AlterTable
ALTER TABLE "PeriodReportDaily" DROP COLUMN "availabilityStatus",
DROP COLUMN "createdById",
DROP COLUMN "end",
DROP COLUMN "idPeriod",
DROP COLUMN "roomDailyId",
DROP COLUMN "scheduledForId",
DROP COLUMN "start",
DROP COLUMN "typeSchedule",
DROP COLUMN "used",
ADD COLUMN     "SalaAtiva" BOOLEAN NOT NULL,
ADD COLUMN     "ScheduleDay" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "dayWeek" INTEGER NOT NULL,
ADD COLUMN     "roomBloco" TEXT NOT NULL,
ADD COLUMN     "roomIdAmbiente" TEXT NOT NULL,
ADD COLUMN     "totalScheduleMinutes" INTEGER;

-- DropTable
DROP TABLE "roomTimeUsedDaily";
