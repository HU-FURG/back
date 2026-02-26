-- CreateTable
CREATE TABLE "Map" (
    "id" SERIAL NOT NULL,
    "blocoId" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "svgPath" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "andar" INTEGER NOT NULL,

    CONSTRAINT "Map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapRoom" (
    "id" SERIAL NOT NULL,
    "mapId" INTEGER NOT NULL,
    "roomId" INTEGER NOT NULL,
    "svgElementId" TEXT NOT NULL,

    CONSTRAINT "MapRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Map_blocoId_key" ON "Map"("blocoId");

-- CreateIndex
CREATE UNIQUE INDEX "MapRoom_mapId_roomId_key" ON "MapRoom"("mapId", "roomId");

-- AddForeignKey
ALTER TABLE "Map" ADD CONSTRAINT "Map_blocoId_fkey" FOREIGN KEY ("blocoId") REFERENCES "BlocoRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRoom" ADD CONSTRAINT "MapRoom_mapId_fkey" FOREIGN KEY ("mapId") REFERENCES "Map"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MapRoom" ADD CONSTRAINT "MapRoom_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
