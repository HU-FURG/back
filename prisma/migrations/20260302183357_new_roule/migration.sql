-- AlterEnum
ALTER TYPE "Hierarquia" ADD VALUE 'boss';

-- CreateTable
CREATE TABLE "AdminScope" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER NOT NULL,
    "blocoId" INTEGER NOT NULL,

    CONSTRAINT "AdminScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomPeriodCanceled" (
    "id" SERIAL NOT NULL,
    "originalPeriodId" INTEGER,
    "roomIdAmbiente" TEXT NOT NULL,
    "roomBloco" TEXT NOT NULL,
    "roomTipo" TEXT,
    "createdById" INTEGER,
    "scheduledForId" INTEGER,
    "createdByLogin" TEXT,
    "createdByNome" TEXT,
    "scheduledForLogin" TEXT,
    "scheduledForNome" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER,
    "canceledById" INTEGER,
    "canceledByLogin" TEXT,
    "canceledByNome" TEXT,
    "cancelReason" TEXT NOT NULL,
    "cancelDescription" TEXT,
    "canceledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomPeriodCanceled_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminScope_adminId_blocoId_key" ON "AdminScope"("adminId", "blocoId");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_roomIdAmbiente_idx" ON "RoomPeriodCanceled"("roomIdAmbiente");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_start_idx" ON "RoomPeriodCanceled"("start");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_canceledAt_idx" ON "RoomPeriodCanceled"("canceledAt");

-- CreateIndex
CREATE INDEX "RoomPeriodCanceled_cancelReason_idx" ON "RoomPeriodCanceled"("cancelReason");

-- AddForeignKey
ALTER TABLE "AdminScope" ADD CONSTRAINT "AdminScope_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminScope" ADD CONSTRAINT "AdminScope_blocoId_fkey" FOREIGN KEY ("blocoId") REFERENCES "BlocoRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
