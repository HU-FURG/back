import { prisma } from "./client";
import { Prisma } from "@prisma/client";

// Função utilitária para calcular a diferença em minutos entre duas datas
function durationInMinutes(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

export const clearPeriodsandUpdate = async () => {
  const agora = new Date();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000; // 7 dias em ms

  try {
    // ------------------------
    // 1️⃣ Transação principal: histórico, template e delete
    // ------------------------
    const expiredPeriods = await prisma.$transaction(async (tx) => {
      const periods = await tx.roomPeriod.findMany({
        where: { end: { lt: agora } },
        include: {
          room: { select: { ID_Ambiente: true, bloco: true } },
          user: { select: { login: true } },
        },
      });

      if (periods.length === 0) {
        console.log("[✅] Nenhum período expirado encontrado.");
        return [];
      }

      const recurrentToUpdate: typeof periods = [];
      const nonRecurrentToDeleteIds: number[] = [];
      const historyData: Prisma.PeriodHistoryCreateManyInput[] = [];
      const templateData: Prisma.RoomScheduleTemplateCreateManyInput[] = [];

      for (const period of periods) {
        const roomIdAmbiente = period.room.ID_Ambiente;
        const roomBloco = period.room.bloco;
        const userName = period.user?.login ?? "Usuário Deletado/Não Registrado";
        const duration = durationInMinutes(period.start, period.end);

        // Histórico
        historyData.push({
          roomIdAmbiente,
          roomBloco,
          userName,
          start: period.start,
          end: period.end,
          nome: period.nome,
          weekday: period.start.getDay(),
          used: false,
          startService: null,
          endService: null,
          durationMinutes: duration,
          actualDurationMinutes: null,
          archivedAt: new Date(),
        });

        // Template de Re-agendamento
        templateData.push({
          userId: period.userId,
          nome: period.nome,
          durationInMinutes: duration,
          roomIdAmbiente,
          roomBloco,
          originalStart: period.start,
          originalEnd: period.end,
          reason: "Vencido",
        });

        // Separar para update ou delete
        if (period.isRecurring) {
          recurrentToUpdate.push(period);
        } else {
          nonRecurrentToDeleteIds.push(period.id);
        }
      }

      // Criar histórico
      if (historyData.length > 0) {
        await tx.periodHistory.createMany({ data: historyData });
      }

      // Criar templates
      if (templateData.length > 0) {
        await tx.roomScheduleTemplate.createMany({ data: templateData });
      }

      // Deletar não recorrentes
      if (nonRecurrentToDeleteIds.length > 0) {
        await tx.roomPeriod.deleteMany({ where: { id: { in: nonRecurrentToDeleteIds } } });
      }

      return recurrentToUpdate;
    });

    // ------------------------
    // 2️⃣ Atualizar recorrentes fora da transação em batches
    // ------------------------
    if (expiredPeriods.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < expiredPeriods.length; i += chunkSize) {
        const chunk = expiredPeriods.slice(i, i + chunkSize);
        const promises = chunk.map((period) => {
          const novaStart = new Date(period.start.getTime() + sevenDaysInMs);
          const novaEnd = new Date(period.end.getTime() + sevenDaysInMs);
          return prisma.roomPeriod.update({
            where: { id: period.id },
            data: { start: novaStart, end: novaEnd },
          });
        });
        await Promise.all(promises);
      }
    }

    console.log(
      `[✅] Processamento concluído. Períodos arquivados: ${expiredPeriods.length}.`
    );
  } catch (error) {
    console.error("[❌] Erro crítico ao processar períodos:", error);
  }
};
