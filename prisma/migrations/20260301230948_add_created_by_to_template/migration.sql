/*
  Warnings:

  - You are about to drop the column `nome` on the `RoomScheduleTemplate` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `RoomScheduleTemplate` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `RoomScheduleTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "RoomScheduleTemplate" DROP CONSTRAINT "RoomScheduleTemplate_userId_fkey";

-- AlterTable
ALTER TABLE "RoomScheduleTemplate" DROP COLUMN "nome",
DROP COLUMN "userId",
ADD COLUMN     "createdById" INTEGER NOT NULL,
ADD COLUMN     "scheduledForId" INTEGER;

-- CreateTable
CREATE TABLE "_RoomScheduleTemplateToUser" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_RoomScheduleTemplateToUser_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_RoomScheduleTemplateToUser_B_index" ON "_RoomScheduleTemplateToUser"("B");

-- AddForeignKey
ALTER TABLE "RoomScheduleTemplate" ADD CONSTRAINT "RoomScheduleTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomScheduleTemplate" ADD CONSTRAINT "RoomScheduleTemplate_scheduledForId_fkey" FOREIGN KEY ("scheduledForId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoomScheduleTemplateToUser" ADD CONSTRAINT "_RoomScheduleTemplateToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "RoomScheduleTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoomScheduleTemplateToUser" ADD CONSTRAINT "_RoomScheduleTemplateToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
