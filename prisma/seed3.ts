import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();
const TZ = "America/Sao_Paulo";

async function main() {
  console.log("🔎 Buscando usuários e salas...");

  const admin = await prisma.user.findFirst({
    where: { hierarquia: "boss" },
  });

  if (!admin) {
    console.log("❌ Nenhum admin encontrado.");
    return;
  }

  const users = await prisma.user.findMany({
    where: { hierarquia: "user" },
  });

  const rooms = await prisma.room.findMany();

  if (!users.length || !rooms.length) {
    console.log("❌ Seed abortado: usuários ou salas inexistentes.");
    return;
  }

  await prisma.roomPeriod.deleteMany();
  console.log("🧹 Reservas antigas apagadas.");

  // 🔥 BUSCA TODOS OS PERIODOS UMA VEZ
  const existingPeriods = await prisma.roomPeriod.findMany();

  // Agrupa por sala
  const periodsByRoom = new Map<number, any[]>();
  for (const period of existingPeriods) {
    if (!periodsByRoom.has(period.roomId)) {
      periodsByRoom.set(period.roomId, []);
    }
    periodsByRoom.get(period.roomId)!.push(period);
  }

  const startOfWeek = DateTime.now().setZone(TZ).startOf("week");

  const novosPeriodos: any[] = [];
  let criados = 0;

  for (let dia = 0; dia < 5; dia++) {
    const dayBase = startOfWeek.plus({ days: dia });

    for (const user of users) {
      const startHour =
        Math.random() < 0.5
          ? 8 + Math.floor(Math.random() * 3)
          : 13 + Math.floor(Math.random() * 3);

      const endHour = startHour + 4;

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

      const isRecurring = Math.random() < 0.7;

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

      const recurrenceCount = isRecurring
        ? 3 + Math.floor(Math.random() * 4)
        : null;

      const endSchedule = isRecurring
        ? DateTime.fromJSDate(startUTC)
            .plus({ weeks: recurrenceCount! - 1 })
            .toUTC()
            .toJSDate()
        : endUTC;

      const novoPeriodo = {
        roomId: salaFinal.id,
        createdById: admin.id,
        scheduledForId: user.id,
        start: startUTC,
        end: endUTC,
        weekday,
        isRecurring,
        approved: true,
        startSchedule: startUTC,
        endSchedule,
        countRecurrence: recurrenceCount,
        atualRecurrenceCount: 0,
      };

      // adiciona no array
      novosPeriodos.push(novoPeriodo);

      // adiciona também na memória pra evitar conflito futuro
      if (!periodsByRoom.has(salaFinal.id)) {
        periodsByRoom.set(salaFinal.id, []);
      }

      periodsByRoom.get(salaFinal.id)!.push(novoPeriodo);

      criados++;
    }
  }

  // 🔥 INSERE TUDO DE UMA VEZ
  await prisma.roomPeriod.createMany({
    data: novosPeriodos,
  });

  console.log(`✅ ${criados} agendamentos criados com sucesso!`);
}

main()
  .catch((e) => {
    console.error("🔥 ERRO NO SEED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
