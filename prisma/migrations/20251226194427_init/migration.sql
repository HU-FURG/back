-- CreateEnum
CREATE TYPE "Hierarquia" AS ENUM ('admin', 'user');

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "login" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "email" TEXT,
    "nome" TEXT,
    "descricao" TEXT,
    "telefone" TEXT,
    "hierarquia" "Hierarquia" NOT NULL DEFAULT 'user',
    "especialidadeId" INTEGER,
    "lastLogin_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspecialidadeUser" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "EspecialidadeUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspecialidadeRoom" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "especialidadesAceitas" TEXT,

    CONSTRAINT "EspecialidadeRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlocoRoom" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "BlocoRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" SERIAL NOT NULL,
    "ID_Ambiente" TEXT NOT NULL,
    "blocoId" INTEGER NOT NULL,
    "especialidadeId" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "banheiro" BOOLEAN NOT NULL,
    "ambiente" TEXT NOT NULL,
    "area" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomPeriod" (
    "id" SERIAL NOT NULL,
    "roomId" INTEGER NOT NULL,
    "userId" INTEGER,
    "nome" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "maxScheduleTime" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomScheduleTemplate" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "nome" TEXT NOT NULL,
    "durationInMinutes" INTEGER NOT NULL,
    "roomIdAmbiente" TEXT NOT NULL,
    "roomBloco" TEXT NOT NULL,
    "originalStart" TIMESTAMP(3) NOT NULL,
    "originalEnd" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomScheduleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodHistory" (
    "id" SERIAL NOT NULL,
    "roomIdAmbiente" TEXT NOT NULL,
    "roomBloco" TEXT NOT NULL,
    "userId" INTEGER,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "weekday" INTEGER,
    "nome" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "startService" TIMESTAMP(3),
    "endService" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRoomReport" (
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

-- CreateTable
CREATE TABLE "RoomStats" (
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

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,
    "relatedRoomId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SystemLog_key_key" ON "SystemLog"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EspecialidadeUser_nome_key" ON "EspecialidadeUser"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EspecialidadeRoom_nome_key" ON "EspecialidadeRoom"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "BlocoRoom_nome_key" ON "BlocoRoom"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Room_ID_Ambiente_key" ON "Room"("ID_Ambiente");

-- CreateIndex
CREATE INDEX "RoomPeriod_roomId_start_idx" ON "RoomPeriod"("roomId", "start");

-- CreateIndex
CREATE INDEX "RoomPeriod_roomId_end_idx" ON "RoomPeriod"("roomId", "end");

-- CreateIndex
CREATE INDEX "RoomPeriod_userId_idx" ON "RoomPeriod"("userId");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_idx" ON "PeriodHistory"("roomIdAmbiente");

-- CreateIndex
CREATE INDEX "PeriodHistory_weekday_idx" ON "PeriodHistory"("weekday");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_start_idx" ON "PeriodHistory"("roomIdAmbiente", "start");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_weekday_used_idx" ON "PeriodHistory"("roomIdAmbiente", "weekday", "used");

-- CreateIndex
CREATE INDEX "DailyRoomReport_date_idx" ON "DailyRoomReport"("date");

-- CreateIndex
CREATE INDEX "DailyRoomReport_roomIdAmbiente_date_idx" ON "DailyRoomReport"("roomIdAmbiente", "date");

-- CreateIndex
CREATE INDEX "RoomStats_roomIdAmbiente_monthRef_idx" ON "RoomStats"("roomIdAmbiente", "monthRef");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "EspecialidadeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_blocoId_fkey" FOREIGN KEY ("blocoId") REFERENCES "BlocoRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "EspecialidadeRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPeriod" ADD CONSTRAINT "RoomPeriod_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomPeriod" ADD CONSTRAINT "RoomPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomScheduleTemplate" ADD CONSTRAINT "RoomScheduleTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodHistory" ADD CONSTRAINT "PeriodHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
