-- CreateEnum
CREATE TYPE "PcEventType" AS ENUM ('iniciou', 'usou', 'encerrou');

-- CreateTable
CREATE TABLE "PcUsageEvent" (
    "id" SERIAL NOT NULL,
    "roomIdAmbiente" TEXT NOT NULL,
    "eventType" "PcEventType" NOT NULL,
    "targetApp" TEXT,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PcUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PcUsageEvent_roomIdAmbiente_eventTime_idx" ON "PcUsageEvent"("roomIdAmbiente", "eventTime");
