import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();
const TZ = "America/Sao_Paulo";

function countWeekdays(start: DateTime, end: DateTime, weekday: number) {
  let count = 0;

  let current = start.startOf("day");

  while (current <= end) {
    if (current.weekday === weekday) {
      count++;
    }
    current = current.plus({ days: 1 });
  }

  return count;
}

async function generatePcUsageEvents(periods: any[], rooms: any[]) {
  const events: any[] = [];

  for (const period of periods) {
    const room = rooms.find((r) => r.id === period.roomId);
    if (!room) continue;

    const start = DateTime.fromJSDate(period.start);
    const end = DateTime.fromJSDate(period.end);

    const rand = Math.random();

    // 20% sala não usada
    if (rand < 0.2) continue;

    let usageStart = start;
    let usageEnd = end;

    // 40% uso parcial
    if (rand < 0.6) {
      usageStart = start.plus({ minutes: 10 + Math.floor(Math.random() * 30) });
      usageEnd = end.minus({ minutes: 10 + Math.floor(Math.random() * 30) });
    }

    const mid = usageStart.plus({
      minutes: Math.floor(usageEnd.diff(usageStart, "minutes").minutes / 2),
    });

    events.push({
      roomIdAmbiente: room.ID_Ambiente,
      eventType: "iniciou",
      targetApp: "chrome.exe",
      eventTime: usageStart.toJSDate(),
    });

    events.push({
      roomIdAmbiente: room.ID_Ambiente,
      eventType: "usou",
      targetApp: "chrome.exe",
      eventTime: mid.toJSDate(),
    });

    events.push({
      roomIdAmbiente: room.ID_Ambiente,
      eventType: "encerrou",
      targetApp: "chrome.exe",
      eventTime: usageEnd.toJSDate(),
    });
  }

  if (events.length) {
    await prisma.pcUsageEvent.createMany({
      data: events,
    });
  }

  console.log(`🖥️ ${events.length} eventos de uso simulados.`);
}

async function main() {
  console.log("🔎 Preparando ambiente de teste do clear...");

  const admin = await prisma.user.findFirst({
    where: { hierarquia: "boss" },
  });

  const users = await prisma.user.findMany({
    where: { hierarquia: "user" },
  });

  const rooms = await prisma.room.findMany({
    include: { bloco: true },
  });

  if (!admin || !users.length || !rooms.length) {
    console.log("❌ Seed abortado: dados insuficientes.");
    return;
  }

  console.log("🧹 Limpando dados antigos...");

  await prisma.periodHistory.deleteMany();
  await prisma.periodReportDaily.deleteMany();
  await prisma.roomPeriod.deleteMany();
  await prisma.pcUsageEvent.deleteMany();

  // -------------------------------------------------
  // BASE 3 MESES ATRÁS
  // -------------------------------------------------

  const scheduleStart = DateTime.now()
    .setZone(TZ)
    .minus({ months: 3 })
    .startOf("day");

  const scheduleEnd = DateTime.now().setZone(TZ).startOf("day");
  const baseDay = scheduleStart.startOf("week");

  const periodsByRoom = new Map<number, any[]>();

  const novosPeriodos: any[] = [];

  for (let dia = 0; dia < 5; dia++) {
    const dayBase = baseDay.plus({ days: dia });

    for (const user of users) {
      const startHour =
        Math.random() < 0.5
          ? 8 + Math.floor(Math.random() * 3)
          : 13 + Math.floor(Math.random() * 3);

      const endHour = startHour + 3;

      const startLocal = dayBase.set({
        hour: startHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      const endLocal = dayBase.set({
        hour: endHour,
        minute: 0,
        second: 0,
        millisecond: 0,
      });

      const weekday = startLocal.weekday;

      const startUTC = startLocal.toUTC().toJSDate();
      const endUTC = endLocal.toUTC().toJSDate();

      let salaFinal = null;

      for (const sala of rooms) {
        const periodos = periodsByRoom.get(sala.id) ?? [];

        const newStartMin = startLocal.hour * 60;
        const newEndMin = endLocal.hour * 60;

        let temConflito = false;

        for (const periodo of periodos) {
          if (periodo.weekday !== weekday) continue;

          const dbStart = DateTime.fromJSDate(periodo.start).setZone(TZ);
          const dbEnd = DateTime.fromJSDate(periodo.end).setZone(TZ);

          const dbStartMin = dbStart.hour * 60;
          const dbEndMin = dbEnd.hour * 60;

          if (dbStartMin < newEndMin && dbEndMin > newStartMin) {
            temConflito = true;
            break;
          }
        }

        if (!temConflito) {
          salaFinal = sala;
          break;
        }
      }

      if (!salaFinal) continue;

      const startSchedule = scheduleStart.toUTC().toJSDate();
      const endSchedule = DateTime.now()
        .setZone(TZ)
        .plus({ days: 3 })
        .startOf("day");

      const recurrenceCount = countWeekdays(
        scheduleStart,
        endSchedule,
        weekday,
      );

      const novoPeriodo = {
        roomId: salaFinal.id,
        createdById: admin.id,
        scheduledForId: user.id,

        start: startUTC,
        end: endUTC,

        weekday,

        isRecurring: true,
        approved: true,

        startSchedule,
        endSchedule,

        countRecurrence: recurrenceCount,
        atualRecurrenceCount: 0,
      };

      novosPeriodos.push(novoPeriodo);

      if (!periodsByRoom.has(salaFinal.id)) {
        periodsByRoom.set(salaFinal.id, []);
      }

      periodsByRoom.get(salaFinal.id)!.push(novoPeriodo);
    }
  }

  await prisma.roomPeriod.createMany({
    data: novosPeriodos,
  });

  await generatePcUsageEvents(novosPeriodos, rooms);

  console.log(`✅ ${novosPeriodos.length} reservas criadas.`);

  // -------------------------------------------------
  // HISTÓRICO FALSO PARA INICIAR CLEAR
  // -------------------------------------------------

  const fakeDay = baseDay.minus({ days: 1 });
  const room = rooms[0];

  await prisma.periodHistory.create({
    data: {
      idPeriod: 0,

      roomIdAmbiente: room.ID_Ambiente,
      roomBloco: room.bloco.nome,

      createdById: admin.id,
      scheduledForId: users[0].id,

      start: fakeDay.set({ hour: 9 }).toUTC().toJSDate(),
      end: fakeDay.set({ hour: 12 }).toUTC().toJSDate(),

      weekday: fakeDay.weekday,

      durationMinutes: 180,
      actualDurationMinutes: null,

      archivedAt: new Date(),
    },
  });

  console.log("📌 Histórico inicial criado.");
}

main()
  .catch((e) => {
    console.error("🔥 ERRO NO SEED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
