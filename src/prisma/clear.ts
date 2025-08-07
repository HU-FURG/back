import { prisma } from "./client";

export const clearPeriodsandUpdate = async () =>{
const agora = new Date();

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Processar períodos não recorrentes
      const antigosNaoRecorrentes = await tx.roomPeriod.findMany({
        where: {
          startTime: { lt: agora },
          isRecurring: false,
        },
      });

      if (antigosNaoRecorrentes.length > 0) {
        await tx.periodHistory.createMany({
          data: antigosNaoRecorrentes.map(p => ({
            roomId: p.roomId,
            startTime: p.startTime,
            endTime: p.endTime,
            archivedAt: new Date(),
          })),
        });

        await tx.roomPeriod.deleteMany({
          where: {
            id: { in: antigosNaoRecorrentes.map(p => p.id) },
          },
        });
      }

      // 2. Processar períodos recorrentes
      const recorrentes = await tx.roomPeriod.findMany({
        where: {
          startTime: { lt: agora },
          isRecurring: true,
        },
      });

      for (const period of recorrentes) {
        // Adicionar ao histórico ANTES de atualizar
        await tx.periodHistory.create({
          data: {
            roomId: period.roomId,
            startTime: period.startTime,
            endTime: period.endTime,
            archivedAt: new Date(),
          },
        });

        // Atualizar para a próxima semana
        const novaStart = new Date(period.startTime);
        const novaEnd = new Date(period.endTime);
        novaStart.setDate(novaStart.getDate() + 7);
        novaEnd.setDate(novaEnd.getDate() + 7);

        await tx.roomPeriod.update({
          where: { id: period.id },
          data: {
            startTime: novaStart,
            endTime: novaEnd,
          },
        });
      }
    });

    console.log('[✅] Períodos processados e recorrentes atualizados.');
  } catch (error) {
    console.error('[❌] Erro ao atualizar períodos:', error);
  }
}
