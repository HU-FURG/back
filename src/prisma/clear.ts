// src/prisma/clear.ts
import { prisma } from "./client";

export const clearPeriodsandUpdate = async () => {
  const agora = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Processar períodos não recorrentes
      const antigosNaoRecorrentes = await tx.roomPeriod.findMany({
        where: {
          day: { lt: agora },  // usa "day" em vez de startTime
          isRecurring: false,
        },
      });

      if (antigosNaoRecorrentes.length > 0) {
        // Criar histórico
        await tx.periodHistory.createMany({
          data: antigosNaoRecorrentes.map((p) => ({
            roomId: p.roomId,
            userId: p.userId ?? null,
            day: p.day,
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
          day: { lt: agora }, // usa "day"
          isRecurring: true,
        },
      });

      for (const period of recorrentes) {
        // Adicionar ao histórico antes de atualizar
        await tx.periodHistory.create({
          data: {
            roomId: period.roomId,
            userId: period.userId ?? null,
            day: period.day,
            start: period.start,
            end: period.end,
            nome: period.nome,
            archivedAt: new Date(),
          },
        });

        // Atualizar para a próxima semana
        const novaDay = new Date(period.day);
        novaDay.setDate(novaDay.getDate() + 7);

        await tx.roomPeriod.update({
          where: { id: period.id },
          data: {
            day: novaDay,
            start: period.start,
            end: period.end,
          },
        });
      }
    });

    console.log("[✅] Períodos processados e recorrentes atualizados.");
  } catch (error) {
    console.error("[❌] Erro ao atualizar períodos:", error);
  }
};
