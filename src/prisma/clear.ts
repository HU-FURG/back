import { prisma } from "./client";
import { DateTime } from "luxon";

async function applyUpdatesBatch(updates: any[]) {
  if (!updates.length) return;

  await Promise.all(
    updates.map((u) =>
      prisma.roomPeriod.update({
        where: { id: u.id },
        data: {
          start: u.start,
          end: u.end,
          atualRecurrenceCount: u.atualRecurrenceCount,
        },
      }),
    ),
  );
}

async function insertHistoryBatch(history: any[]) {
  if (!history.length) return;

  await prisma.periodHistory.createMany({
    data: history,
  });
}

function processRecurrences(periods: any[]) {
  const history: any[] = [];
  const updates: any[] = [];
  const deletes: number[] = [];

  const yesterday = DateTime.now().minus({ days: 1 }).startOf("day");

  for (const period of periods) {
    let start = DateTime.fromJSDate(period.start);
    let end = DateTime.fromJSDate(period.end);

    let atualRecurrenceCount = period.atualRecurrenceCount ?? 0;

    const endSchedule = period.endSchedule
      ? DateTime.fromJSDate(period.endSchedule)
      : null;

    let deleted = false;
    // RESERVA AINDA FUTURA

    if (start.startOf("day") > yesterday) {
      continue;
    }

    // RESERVA JÁ PASSOU DO SCHEDULE

    if (endSchedule && start > endSchedule) {
      deletes.push(period.id);
      continue;
    }
    while (start.startOf("day") <= yesterday) {
      const duration = Math.floor((end.toMillis() - start.toMillis()) / 60000);

      // -------------------------
      // HISTÓRICO
      // -------------------------

      history.push({
        idPeriod: period.id,

        roomIdAmbiente: period.room.ID_Ambiente,
        roomBloco: period.room.bloco.nome,

        createdById: period.createdBy?.id ?? null,
        scheduledForId: period.scheduledFor?.id ?? null,

        createdByLogin: period.createdBy?.login ?? null,
        createdByNome: period.createdBy?.nome ?? null,

        scheduledForLogin: period.scheduledFor?.login ?? null,
        scheduledForNome: period.scheduledFor?.nome ?? null,

        start: start.toJSDate(),
        end: end.toJSDate(),

        weekday: start.weekday,

        durationMinutes: duration,
        actualDurationMinutes: null,

        archivedAt: new Date(),
      });

      // -------------------------
      // SE NÃO FOR RECORRENTE
      // -------------------------

      if (!period.isRecurring) {
        deletes.push(period.id);
        deleted = true;
        break;
      }

      // -------------------------
      // AVANÇA 7 DIAS
      // -------------------------

      start = start.plus({ days: 7 });
      end = end.plus({ days: 7 });

      atualRecurrenceCount++;

      // -------------------------
      // REGRAS DE DELETE
      // -------------------------

      if (endSchedule && start > endSchedule) {
        deletes.push(period.id);
        deleted = true;
        break;
      }

      if (
        period.countRecurrence &&
        atualRecurrenceCount > period.countRecurrence
      ) {
        deletes.push(period.id);
        deleted = true;
        break;
      }
    }

    // -------------------------
    // UPDATE FINAL
    // -------------------------

    if (!deleted) {
      updates.push({
        id: period.id,
        start: start.toJSDate(),
        end: end.toJSDate(),
        atualRecurrenceCount: atualRecurrenceCount,
      });
    }
  }

  return { history, updates, deletes };
}

async function applyDeletesBatch(deletes: number[]) {
  if (!deletes.length) return;
  console.log("delete");
  await prisma.roomPeriod.deleteMany({
    where: {
      id: { in: deletes },
    },
  });
}

async function processPcUsage() {
  const yesterday = DateTime.now().minus({ days: 1 }).endOf("day").toJSDate();

  const events = await prisma.pcUsageEvent.findMany({
    where: {
      eventTime: { lte: yesterday },
    },
    orderBy: { eventTime: "asc" },
  });

  if (!events.length) return;

  // -------------------------
  // INDEXAÇÃO POR SALA
  // -------------------------

  const eventsByRoom = new Map<string, Date[]>();

  for (const e of events) {
    if (!eventsByRoom.has(e.roomIdAmbiente)) {
      eventsByRoom.set(e.roomIdAmbiente, []);
    }

    eventsByRoom.get(e.roomIdAmbiente)!.push(e.eventTime);
  }

  const histories = await prisma.periodHistory.findMany({
    where: {
      start: { lte: yesterday },
    },
  });

  const updates = [];

  for (const history of histories) {
    const roomEvents = eventsByRoom.get(history.roomIdAmbiente);

    if (!roomEvents) continue;

    const start = history.start.getTime();
    const end = history.end.getTime();

    let first: Date | null = null;
    let last: Date | null = null;

    for (const eventTime of roomEvents) {
      const t = eventTime.getTime();

      if (t < start) continue;
      if (t > end) break;

      if (!first) first = eventTime;
      last = eventTime;
    }

    if (!first || !last) continue;

    const duration = Math.floor((last.getTime() - first.getTime()) / 60000);

    updates.push(
      prisma.periodHistory.update({
        where: { id: history.id },
        data: {
          used: true,
          startService: first,
          endService: last,
          actualDurationMinutes: duration,
        },
      }),
    );
  }

  if (updates.length) {
    await Promise.all(updates);
  }

  // limpa telemetria
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "PcUsageEvent"`);
}

async function generateDailyReports() {
  console.log("GErando relatorio diario salas");
  const yesterday = DateTime.now().minus({ days: 1 }).startOf("day");

  // ------------------------------------------------
  // DESCOBRIR DIA INICIAL
  // ------------------------------------------------

  const lastDaily = await prisma.periodReportDaily.findFirst({
    orderBy: { ScheduleDay: "desc" },
  });

  let startDay: DateTime | null = null;

  if (lastDaily) {
    startDay = DateTime.fromJSDate(lastDaily.ScheduleDay)
      .plus({ days: 1 })
      .startOf("day");
  } else {
    const firstHistory = await prisma.periodHistory.findFirst({
      orderBy: { start: "asc" },
    });

    if (!firstHistory) return;

    startDay = DateTime.fromJSDate(firstHistory.start).startOf("day");
  }

  // ------------------------------------------------
  // LOOP DE DIAS
  // ------------------------------------------------

  while (startDay <= yesterday) {
    const dayStart = startDay.startOf("day").toJSDate();
    const dayEnd = startDay.endOf("day").toJSDate();

    const rooms = await prisma.room.findMany({
      include: { bloco: true },
    });

    const histories = await prisma.periodHistory.findMany({
      where: {
        start: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
    });

    const scheduleMap = new Map<string, number>();
    const usedMap = new Map<string, number>();

    // ----------------------------------------------
    // SOMA DOS HISTÓRICOS
    // ----------------------------------------------

    for (const h of histories) {
      const schedule = scheduleMap.get(h.roomIdAmbiente) ?? 0;

      scheduleMap.set(h.roomIdAmbiente, schedule + (h.durationMinutes ?? 0));

      if (h.used && h.actualDurationMinutes) {
        const used = usedMap.get(h.roomIdAmbiente) ?? 0;

        usedMap.set(h.roomIdAmbiente, used + h.actualDurationMinutes);
      }
    }

    const reports: any[] = [];

    // ----------------------------------------------
    // GERAR REPORT POR SALA
    // ----------------------------------------------

    for (const room of rooms) {
      const scheduleMinutes = scheduleMap.get(room.ID_Ambiente) ?? 0;

      const usedMinutes = usedMap.get(room.ID_Ambiente) ?? 0;

      reports.push({
        dayWeek: startDay.weekday,
        ScheduleDay: dayStart,

        roomIdAmbiente: room.ID_Ambiente,
        roomBloco: room.bloco.nome,

        SalaAtiva: room.active,

        totalScheduleMinutes: scheduleMinutes,
        totalUsedMinutes: usedMinutes,
      });
    }

    // ----------------------------------------------
    // INSERÇÃO
    // ----------------------------------------------

    if (reports.length) {
      await prisma.periodReportDaily.createMany({
        data: reports,
      });
    }

    // próximo dia
    startDay = startDay.plus({ days: 1 });
  }
}

async function cleanupOldCanceledReservations() {
  const limitDate = DateTime.now().minus({ days: 30 }).toJSDate();

  const result = await prisma.roomPeriodCanceled.deleteMany({
    where: {
      canceledAt: {
        lt: limitDate,
      },
    },
  });

  if (result.count) {
    console.log(`🧹 ${result.count} reservas canceladas removidas`);
  }
}

async function cleanupDisabledUsers() {
  const limitDate = DateTime.now().minus({ days: 30 }).toJSDate();

  const users = await prisma.user.findMany({
    where: {
      active: false,
      updatedAt: {
        lt: limitDate,
      },
    },
    select: { id: true },
  });

  if (!users.length) return;

  const deletable: number[] = [];

  for (const user of users) {
    const hasPeriods = await prisma.roomPeriod.findFirst({
      where: {
        OR: [{ createdById: user.id }, { scheduledForId: user.id }],
      },
    });

    if (hasPeriods) continue;

    const hasTemplates = await prisma.roomScheduleTemplate.findFirst({
      where: {
        OR: [{ createdById: user.id }, { scheduledForId: user.id }],
      },
    });

    if (hasTemplates) continue;

    const hasCanceled = await prisma.roomPeriodCanceled.findFirst({
      where: {
        OR: [
          { createdById: user.id },
          { scheduledForId: user.id },
          { canceledById: user.id },
        ],
      },
    });

    if (hasCanceled) continue;

    deletable.push(user.id);
  }

  if (!deletable.length) return;

  await prisma.user.deleteMany({
    where: {
      id: { in: deletable },
    },
  });

  console.log(`🧹 ${deletable.length} usuários desativados removidos`);
}

export const clear = async () => {
  console.log("Starting CLEAR...");

  const periods = await prisma.roomPeriod.findMany({
    include: {
      room: { include: { bloco: true } },
      createdBy: {
        select: { id: true, login: true, nome: true },
      },
      scheduledFor: {
        select: { id: true, login: true, nome: true },
      },
    },
  });
  // criação de historico

  const { history, updates, deletes } = processRecurrences(periods);

  await insertHistoryBatch(history);

  await applyUpdatesBatch(updates);

  await applyDeletesBatch(deletes);

  // validação de uso de salas
  await processPcUsage();

  // Criar daily salas
  await generateDailyReports();

  // limpeza de cancelamentos antigos
  await cleanupOldCanceledReservations();

  // limpeza de usuários desativados
  await cleanupDisabledUsers();

  console.log(
    `CLEAR finished | history: ${history.length} | updates: ${updates.length} | deletes: ${deletes.length}`,
  );
};
