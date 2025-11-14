import { prisma } from "./client";
import { updateSystemLog } from "./systemLog";
import { Prisma } from "@prisma/client";

function durationInMinutes(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60));
}

export const clearPeriodsandUpdate = async () => {
  const agora = new Date();
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;

  try {
    const expiredPeriods = await prisma.$transaction(async (tx) => {
      const periods = await tx.roomPeriod.findMany({
        where: { end: { lt: agora } },
        include: {
          room: { select: { ID_Ambiente: true, bloco: true } },
          user: { select: { id: true, login: true } },
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
        const { room, user } = period;
        const roomIdAmbiente = room.ID_Ambiente;
        const roomBloco = room.bloco;
        const userId = user?.id ?? null;
        const duration = durationInMinutes(period.start, period.end);

        historyData.push({
          roomIdAmbiente,
          roomBloco,
          userId,
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

        templateData.push({
          userId,
          nome: period.nome,
          durationInMinutes: duration,
          roomIdAmbiente,
          roomBloco,
          originalStart: period.start,
          originalEnd: period.end,
          reason: "Vencido",
        });

        if (period.isRecurring) recurrentToUpdate.push(period);
        else nonRecurrentToDeleteIds.push(period.id);
      }

      if (historyData.length > 0)
        await tx.periodHistory.createMany({ data: historyData });
      if (templateData.length > 0)
        await tx.roomScheduleTemplate.createMany({ data: templateData });
      if (nonRecurrentToDeleteIds.length > 0)
        await tx.roomPeriod.deleteMany({
          where: { id: { in: nonRecurrentToDeleteIds } },
        });

      return recurrentToUpdate;
    });

    if (expiredPeriods.length > 0) {
      const chunkSize = 50;
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      for (let i = 0; i < expiredPeriods.length; i += chunkSize) {
        const chunk = expiredPeriods.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((period) =>
            prisma.roomPeriod.update({
              where: { id: period.id },
              data: {
                start: new Date(period.start.getTime() + sevenDaysInMs),
                end: new Date(period.end.getTime() + sevenDaysInMs),
                updatedAt: new Date(),
              },
            })
          )
        );
      }
    }

    await updateSystemLog("last_clear_update", agora.toISOString());
    console.log(`[✅] Processamento concluído. ${expiredPeriods.length} períodos arquivados.`);
  } catch (error) {
    console.error("[❌] Erro crítico ao processar períodos:", error);
  }
};
