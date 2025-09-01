// src/prisma/clear.ts
import { prisma } from "./client";

export const clearPeriodsandUpdate = async () => {
  const agora = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Processar períodos não recorrentes
      const antigosNaoRecorrentes = await tx.roomPeriod.findMany({
        where: {
          start: { lt: agora },  // usa "start" em vez de day
          isRecurring: false,
        },
      });

      if (antigosNaoRecorrentes.length > 0) {
        // Criar histórico
        await tx.periodHistory.createMany({
          data: antigosNaoRecorrentes.map((p) => ({
            roomId: p.roomId,
            userId: p.userId ?? null,
            start: p.start,
            end: p.end,
            nome: p.nome,
            archivedAt: new Date(),
          })),
        });

        // Deletar períodos antigos
        await tx.roomPeriod.deleteMany({
          where: {
            id: { in: antigosNaoRecorrentes.map((p) => p.id) },
          },
        });
      }

      // 2. Processar períodos recorrentes
      const recorrentes = await tx.roomPeriod.findMany({
        where: {
          start: { lt: agora }, // usa "start"
          isRecurring: true,
        },
      });

      for (const period of recorrentes) {
        // Adicionar ao histórico antes de atualizar
        await tx.periodHistory.create({
          data: {
            roomId: period.roomId,
            userId: period.userId ?? null,
            start: period.start,
            end: period.end,
            nome: period.nome,
            archivedAt: new Date(),
          },
        });

        // Atualizar para a próxima semana
        const novaStart = new Date(period.start);
        const novaEnd = new Date(period.end);

        novaStart.setDate(novaStart.getDate() + 7);
        novaEnd.setDate(novaEnd.getDate() + 7);

        await tx.roomPeriod.update({
          where: { id: period.id },
          data: {
            start: novaStart,
            end: novaEnd,
          },
        });
      }
    });

    console.log("[✅] Períodos processados e recorrentes atualizados.");
  } catch (error) {
    console.error("[❌] Erro ao atualizar períodos:", error);
  }
};
