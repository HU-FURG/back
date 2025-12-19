/*
  Warnings:

  - You are about to drop the column `especialidade` on the `Room` table. All the data in the column will be lost.
  - Added the required column `especialidadeId` to the `Room` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."Room" DROP COLUMN "especialidade",
ADD COLUMN     "especialidadeId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "descricao" TEXT,
ADD COLUMN     "telefone" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Room" ADD CONSTRAINT "Room_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "public"."Especialidade"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
