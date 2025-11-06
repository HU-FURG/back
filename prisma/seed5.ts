import { DateTime } from "luxon";
import { prisma } from "./client";

const main = async (mes: string) => {
  await prisma.roomStats.deleteMany({})
  const dtInicio = DateTime.fromISO(mes + "-01").startOf("month");
  const dtFim = dtInicio.endOf("month");

  const salas = await prisma.room.findMany({
    select: {
      ID_Ambiente: true,
      bloco: true,
    }});

  const dadosParaSalvar: any[] = [];

  for (const sala of salas) {
    const periodos = await prisma.periodHistory.findMany({
      where: {
        roomIdAmbiente: sala.ID_Ambiente,
        start: { gte: dtInicio.toJSDate(), lte: dtFim.toJSDate() }
      }
    });

    if (periodos.length === 0) continue;

    let totalReservedMin = 0;
    let totalUsedMin = 0;
    let totalBookings = 0;
    let totalUsed = 0;
    let totalCanceled = 0;

    const usedByWeekday: Record<string, number> = {};
    const reservedByWeekday: Record<string, number> = {};

    let sortedByStart = periodos.sort((a, b) => a.start.getTime() - b.start.getTime());
    let ultimoFim: Date | null = null;
    let idleTimes: number[] = [];

    for (const p of sortedByStart) {
      totalBookings++;
      totalReservedMin += p.durationMinutes ?? 0;
      if (p.used) {
        totalUsed++;
        totalUsedMin += p.actualDurationMinutes ?? 0;
      } else {
        totalCanceled++;
      }

      const wd = p.weekday ?? p.start.getDay();
      reservedByWeekday[`reservado${wd}`] = (reservedByWeekday[`reservado${wd}`] || 0) + (p.durationMinutes ?? 0);
      usedByWeekday[`used${wd}`] = (usedByWeekday[`used${wd}`] || 0) + (p.actualDurationMinutes ?? 0);

      if (ultimoFim) {
        const idle = (p.start.getTime() - ultimoFim.getTime()) / 60000;
        if (idle > 0) idleTimes.push(idle);
      }
      ultimoFim = p.endService ?? p.end;
    }

    const avgIdleMin = idleTimes.length > 0 
    ? Math.ceil(idleTimes.reduce((a, b) => a + b, 0) / idleTimes.length) 
    : 0;

    const avgUsageRate = totalReservedMin > 0 
    ? Math.ceil((totalUsedMin / totalReservedMin) * 100) 
    : 0;

    dadosParaSalvar.push({
        roomIdAmbiente: sala.ID_Ambiente,
        roomBloco: sala.bloco,
        monthRef: dtInicio.toJSDate(),
        totalReservedMin: Math.ceil(totalReservedMin),
        totalUsedMin: Math.ceil(totalUsedMin),
        avgIdleMin,
        avgUsageRate,
        usageByWeekday: { ...usedByWeekday, ...reservedByWeekday },
        totalBookings,
        totalUsed,
        totalCanceled,
        });
  }

  if (dadosParaSalvar.length > 0) {
    // Cria todos os registros de uma vez
    await prisma.roomStats.createMany({ data: dadosParaSalvar });
  }

  return { sucesso: true, salasProcessadas: salas.length };
};


main("2025-09")
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
