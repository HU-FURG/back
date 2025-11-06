-- AlterTable
ALTER TABLE "public"."PeriodHistory" ADD COLUMN     "actualDurationMinutes" INTEGER,
ADD COLUMN     "durationMinutes" INTEGER,
ADD COLUMN     "weekday" INTEGER;

-- CreateTable
CREATE TABLE "public"."RoomStats" (
    "id" SERIAL NOT NULL,
    "roomIdAmbiente" TEXT NOT NULL,
    "roomBloco" TEXT NOT NULL,
    "monthRef" TIMESTAMP(3) NOT NULL,
    "totalReservedMin" INTEGER NOT NULL,
    "totalUsedMin" INTEGER NOT NULL,
    "avgIdleMin" DOUBLE PRECISION,
    "avgUsageRate" DOUBLE PRECISION,
    "usageByWeekday" JSONB,
    "totalBookings" INTEGER NOT NULL,
    "totalUsed" INTEGER NOT NULL,
    "totalCanceled" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomStats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomStats_roomIdAmbiente_monthRef_idx" ON "public"."RoomStats"("roomIdAmbiente", "monthRef");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_idx" ON "public"."PeriodHistory"("roomIdAmbiente");

-- CreateIndex
CREATE INDEX "PeriodHistory_weekday_idx" ON "public"."PeriodHistory"("weekday");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_start_idx" ON "public"."PeriodHistory"("roomIdAmbiente", "start");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_weekday_used_idx" ON "public"."PeriodHistory"("roomIdAmbiente", "weekday", "used");
