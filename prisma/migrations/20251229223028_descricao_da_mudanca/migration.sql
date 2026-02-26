/*
  Warnings:

  - You are about to drop the column `especialidadesAceitas` on the `EspecialidadeRoom` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "EspecialidadeRoom" DROP COLUMN "especialidadesAceitas";

-- CreateTable
CREATE TABLE "_RoomAceitas" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RoomAceitas_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RoomAceitas_B_index" ON "_RoomAceitas"("B");

-- AddForeignKey
ALTER TABLE "_RoomAceitas" ADD CONSTRAINT "_RoomAceitas_A_fkey" FOREIGN KEY ("A") REFERENCES "EspecialidadeRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoomAceitas" ADD CONSTRAINT "_RoomAceitas_B_fkey" FOREIGN KEY ("B") REFERENCES "EspecialidadeUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
