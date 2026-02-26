/*
  Warnings:

  - A unique constraint covering the columns `[roomId]` on the table `MapRoom` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[mapId,svgElementId]` on the table `MapRoom` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "MapRoom_mapId_roomId_key";

-- CreateIndex
CREATE UNIQUE INDEX "MapRoom_roomId_key" ON "MapRoom"("roomId");

-- CreateIndex
CREATE UNIQUE INDEX "MapRoom_mapId_svgElementId_key" ON "MapRoom"("mapId", "svgElementId");
