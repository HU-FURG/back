-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "login" TEXT NOT NULL,
    "senha" TEXT NOT NULL,
    "hierarquia" TEXT NOT NULL,
    "lastLogin_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Room" (
    "id" SERIAL NOT NULL,
    "ID_Ambiente" TEXT NOT NULL,
    "bloco" TEXT NOT NULL,
    "especialidade" TEXT NOT NULL,
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
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "nome" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
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
    "roomAla" TEXT NOT NULL,
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
    "roomAla" TEXT NOT NULL,
    "userName" TEXT,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "nome" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodHistory_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "User_login_key" ON "public"."User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "Room_ID_Ambiente_key" ON "public"."Room"("ID_Ambiente");

-- CreateIndex
CREATE INDEX "RoomPeriod_roomId_start_idx" ON "public"."RoomPeriod"("roomId", "start");

-- CreateIndex
CREATE INDEX "RoomPeriod_roomId_end_idx" ON "public"."RoomPeriod"("roomId", "end");

-- AddForeignKey
ALTER TABLE "public"."RoomPeriod" ADD CONSTRAINT "RoomPeriod_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoomPeriod" ADD CONSTRAINT "RoomPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RoomScheduleTemplate" ADD CONSTRAINT "RoomScheduleTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
