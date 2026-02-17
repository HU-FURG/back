import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();
const TZ = "America/Sao_Paulo";

async function main() {
  console.log("🔎 Buscando usuários e salas...");

  const admin = await prisma.user.findFirst({
    where: { hierarquia: "admin" },
  });

  if (!admin) {
    console.log("❌ Nenhum admin encontrado.");
    return;
  }

  const users = await prisma.user.findMany({
    where: { hierarquia: "user" },
  });

  const rooms = await prisma.room.findMany();

  console.log(`👥 ${users.length} usuários | 🏢 ${rooms.length} salas`);

  if (!users.length || !rooms.length) {
    console.log("❌ Seed abortado: usuários ou salas inexistentes.");
    return;
  }

  await prisma.roomPeriod.deleteMany();
  console.log("🧹 Reservas antigas apagadas.");

  const startOfWeek = DateTime.now()
    .setZone(TZ)
    .startOf("week");

  let criados = 0;

  for (let dia = 0; dia < 5; dia++) {
    const dayBase = startOfWeek.plus({ days: dia });

    for (const user of users) {
      // =========================
      // HORÁRIO REALISTA
      // =========================
      const startHour =
        Math.random() < 0.5
          ? 8 + Math.floor(Math.random() * 3)   // 08–10
          : 13 + Math.floor(Math.random() * 3); // 13–15

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

      // =========================
      // TENTAR ACHAR SALA LIVRE
      // =========================
      let salaFinal = null;

      for (const sala of rooms) {
        
        const conflito = await prisma.roomPeriod.findFirst({
          where: {
            roomId: sala.id,

            OR: [
              // 🔹 não recorrente
              {
                isRecurring: false,
                start: { lt: endUTC },
                end: { gt: startUTC },
              },

              // 🔹 recorrente
              {
                isRecurring: true,
                weekday,
                start: { lt: endUTC },
                end: { gt: startUTC },
                startSchedule: { lte: startUTC },
                endSchedule: { gte: startUTC },
                OR: [
                  { countRecurrence: null },
                  {
                    atualRecurrenceCount: {
                      lt: prisma.roomPeriod.fields.countRecurrence,
                    },
                  },
                ],
              },
            ],
          },
        });


        if (!conflito) {
          salaFinal = sala;
          break;
        }
      }

      // Se nenhuma sala estiver livre, pula
      if (!salaFinal) continue;
        const recurrenceCount = isRecurring
            ? 3 + Math.floor(Math.random() * 4) // 3–6
            : null;

        const endSchedule = isRecurring
          ? DateTime.fromJSDate(startUTC)
              .plus({ weeks: recurrenceCount! - 1 })
              .toUTC()
              .toJSDate()
          : endUTC;


        await prisma.roomPeriod.create({
          data: {
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
          },
        });

        criados++;
      }
    }

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
