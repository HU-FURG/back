/*
  Warnings:

  - You are about to drop the column `especialidade` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "especialidade",
ADD COLUMN     "especialidadeId" INTEGER;

-- CreateTable
CREATE TABLE "public"."Especialidade" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Especialidade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Especialidade_nome_key" ON "public"."Especialidade"("nome");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_especialidadeId_fkey" FOREIGN KEY ("especialidadeId") REFERENCES "public"."Especialidade"("id") ON DELETE SET NULL ON UPDATE CASCADE;
