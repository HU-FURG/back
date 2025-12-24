-- CreateEnum
CREATE TYPE "public"."Hierarquia" AS ENUM ('admin', 'user');

-- CreateTable
CREATE TABLE "public"."SystemLog" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "login" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "email" TEXT,
    "nome" TEXT,
    "descricao" TEXT,
    "telefone" TEXT,
    "hierarquia" "public"."Hierarquia" NOT NULL DEFAULT 'user',
    "especialidadeId" INTEGER,
    "lastLogin_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EspecialidadeUser" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "EspecialidadeUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EspecialidadeRoom" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "especialidadesAceitas" TEXT,

    CONSTRAINT "EspecialidadeRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Room" (
    "id" SERIAL NOT NULL,
    "ID_Ambiente" TEXT NOT NULL,
    "bloco" TEXT NOT NULL,
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
CREATE TABLE "public"."RoomPeriod" (
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
CREATE TABLE "public"."RoomScheduleTemplate" (
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
CREATE TABLE "public"."PeriodHistory" (
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

-- CreateTable
CREATE TABLE "public"."Notification" (
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
CREATE UNIQUE INDEX "SystemLog_key_key" ON "public"."SystemLog"("key");

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "public"."User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "EspecialidadeUser_nome_key" ON "public"."EspecialidadeUser"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "EspecialidadeRoom_nome_key" ON "public"."EspecialidadeRoom"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Room_ID_Ambiente_key" ON "public"."Room"("ID_Ambiente");

-- CreateIndex
CREATE INDEX "RoomPeriod_roomId_start_idx" ON "public"."RoomPeriod"("roomId", "start");

-- CreateIndex
CREATE INDEX "RoomPeriod_roomId_end_idx" ON "public"."RoomPeriod"("roomId", "end");

-- CreateIndex
CREATE INDEX "RoomPeriod_userId_idx" ON "public"."RoomPeriod"("userId");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_idx" ON "public"."PeriodHistory"("roomIdAmbiente");

-- CreateIndex
CREATE INDEX "PeriodHistory_weekday_idx" ON "public"."PeriodHistory"("weekday");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_start_idx" ON "public"."PeriodHistory"("roomIdAmbiente", "start");

-- CreateIndex
CREATE INDEX "PeriodHistory_roomIdAmbiente_weekday_used_idx" ON "public"."PeriodHistory"("roomIdAmbiente", "weekday", "used");

-- CreateIndex
CREATE INDEX "DailyRoomReport_date_idx" ON "public"."DailyRoomReport"("date");

-- CreateIndex
CREATE INDEX "DailyRoomReport_roomIdAmbiente_date_idx" ON "public"."DailyRoomReport"("roomIdAmbiente", "date");

-- CreateIndex
CREATE INDEX "RoomStats_roomIdAmbiente_monthRef_idx" ON "public"."RoomStats"("roomIdAmbiente", "monthRef");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "public"."EspecialidadeUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "public"."EspecialidadeRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoomPeriod" ADD CONSTRAINT "RoomPeriod_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoomPeriod" ADD CONSTRAINT "RoomPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoomScheduleTemplate" ADD CONSTRAINT "RoomScheduleTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PeriodHistory" ADD CONSTRAINT "PeriodHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
