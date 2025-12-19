import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

const prisma = new PrismaClient();

async function main() {
  console.log("🔎 Buscando usuários e salas...");
  const users = await prisma.user.findMany({ where: { hierarquia: "user" } });
  const rooms = await prisma.room.findMany();
  console.log(`👥 ${users.length} usuários | 🏢 ${rooms.length} salas`);

  if (users.length == 0 || rooms.length == 0) {
    console.log("❌ Nenhum usuário ou sala encontrado.");
    return;
  }

  await prisma.roomPeriod.deleteMany();
  console.log("🧹 Reservas antigas apagadas.");

  const hoje = new Date();
  const startOfWeek = new Date(hoje);
  startOfWeek.setDate(startOfWeek.getDate() - hoje.getDay() + 1); // segunda-feira

  let criados = 0;

  // Criar reservas para esta semana
  for (let dia = 0; dia < 5; dia++) {
    const dataBase = new Date(startOfWeek);
    dataBase.setDate(startOfWeek.getDate() + dia);

    for (const user of users) {
      const isMorning = Math.random() < 0.5;
      const startHour = isMorning ? 8 : 13;
      const endHour = isMorning ? 12 : 17;

      const startLocal = new Date(dataBase);
      const endLocal = new Date(dataBase);

      startLocal.setHours(startHour, 0, 0, 0);
      endLocal.setHours(endHour, 0, 0, 0);

      // Conversão correta
      const start = DateTime.fromJSDate(startLocal, { zone: "America/Sao_Paulo" })
      .toUTC()
      .toJSDate();

    const end = DateTime.fromJSDate(endLocal, { zone: "America/Sao_Paulo" })
      .toUTC()
      .toJSDate();

      const sala = rooms[Math.floor(Math.random() * rooms.length)];

      const isRecurring = Math.random() < 0.8;

      const conflito = await prisma.roomPeriod.findFirst({
        where: {
          roomId: sala.id,
          start: { lt: end },
          end: { gt: start },
        },
      });

      if (conflito) {
        console.log(`⚠ Sala ${sala.ID_Ambiente} ocupada em ${startLocal.toISOString()}`);

        const outraSala = rooms[Math.floor(Math.random() * rooms.length)];

        const conflito2 = await prisma.roomPeriod.findFirst({
          where: {
            roomId: outraSala.id,
            start: { lt: end },
            end: { gt: start },
          },
        });

        if (conflito2) {
          console.log(`❌ Segunda sala também ocupada. Pulando.`);
          continue;
        }

        await prisma.roomPeriod.create({
          data: {
            roomId: outraSala.id,
            userId: 1,
            nome: user.nome || user.login,
            start,
            end,
            isRecurring,
            approved: true,
          },
        });

        criados++;
      } else {
        await prisma.roomPeriod.create({
          data: {
            roomId: sala.id,
            userId: 1,
            nome: user.nome || user.login,
            start,
            end,
            isRecurring,
            approved: true,
          },
        });

        criados++;
      }
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
