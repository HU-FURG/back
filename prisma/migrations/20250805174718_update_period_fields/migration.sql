/*
  Warnings:

  - You are about to drop the column `endTime` on the `PeriodHistory` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `PeriodHistory` table. All the data in the column will be lost.
  - You are about to drop the column `endTime` on the `RoomPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `startTime` on the `RoomPeriod` table. All the data in the column will be lost.
  - Added the required column `day` to the `PeriodHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `end` to the `PeriodHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nome` to the `PeriodHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start` to the `PeriodHistory` table without a default value. This is not possible if the table is not empty.
  - Added the required column `day` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.
  - Added the required column `end` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nome` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.
  - Added the required column `start` to the `RoomPeriod` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PeriodHistory" DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "day" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "end" TEXT NOT NULL,
ADD COLUMN     "nome" TEXT NOT NULL,
ADD COLUMN     "start" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "RoomPeriod" DROP COLUMN "endTime",
DROP COLUMN "startTime",
ADD COLUMN     "day" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "end" TEXT NOT NULL,
ADD COLUMN     "nome" TEXT NOT NULL,
ADD COLUMN     "start" TEXT NOT NULL;
