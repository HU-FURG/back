/*
  Warnings:

  - Made the column `especialidade` on table `User` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "public"."User" ALTER COLUMN "especialidade" SET NOT NULL;

-- CreateTable
CREATE TABLE "public"."DailyRoomReport" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "roomIdAmbiente" TEXT NOT NULL,
    "roomBloco" TEXT NOT NULL,
    "wasActive" BOOLEAN NOT NULL,
    "totalUsedMinutes" INTEGER,
    "totalUnusedMinutes" INTEGER,
    "cancellationCount" INTEGER,
    "attendedUsersList" JSONB,

    CONSTRAINT "DailyRoomReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyRoomReport_date_idx" ON "public"."DailyRoomReport"("date");

-- CreateIndex
CREATE INDEX "DailyRoomReport_roomIdAmbiente_date_idx" ON "public"."DailyRoomReport"("roomIdAmbiente", "date");
