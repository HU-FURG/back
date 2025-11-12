import { PrismaClient } from "@prisma/client";
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

  

  const hoje = new Date();
  const startOfWeek = new Date(hoje);
  startOfWeek.setDate(startOfWeek.getDate() - hoje.getDay() + 1); // Segunda-feira desta semana

  let criados = 0;

  // Criar reservas para esta semana e a próxima
  for (let semana = 0; semana < 1; semana++) {
    for (let dia = 0; dia < 5; dia++) {
      const dataBase = new Date(startOfWeek);
      dataBase.setDate(startOfWeek.getDate() + dia + semana * 7);

      for (const user of users) {
        const isMorning = Math.random() < 0.5; // manhã ou tarde
        const startHour = isMorning ? 8 : 13;
        const endHour = isMorning ? 12 : 17;
        const sala = rooms[Math.floor(Math.random() * rooms.length)];

        const start = new Date(dataBase);
        const end = new Date(dataBase);
        start.setHours(startHour, 0, 0, 0);
        end.setHours(endHour, 0, 0, 0);

        // 80% chance de ser recorrente
        const isRecurring = Math.random() < 0.8;

        // Verificar se a sala já tem agendamento nesse horário
        const conflito = await prisma.roomPeriod.findFirst({
          where: {
            roomId: sala.id,
            OR: [
              { start: { lt: end }, end: { gt: start } }, // intervalo se sobrepõe
            ],
          },
        });

        if (conflito) {
          // sala ocupada -> tenta outra sala
          const outraSala = rooms[Math.floor(Math.random() * rooms.length)];
          const conflito2 = await prisma.roomPeriod.findFirst({
            where: {
              roomId: outraSala.id,
              OR: [{ start: { lt: end }, end: { gt: start } }],
            },
          });

          if (conflito2) continue; // se também estiver ocupada, pula
          await prisma.roomPeriod.create({
            data: {
              roomId: outraSala.id,
              userId: user.id,
              nome: user.nome || user.login,
              start,
              end,
              isRecurring,
              approved: true,
            },
          });
          criados++;
        } else {
          // sala livre -> cria
          await prisma.roomPeriod.create({
            data: {
              roomId: sala.id,
              userId: user.id,
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
  }

  console.log(`✅ ${criados} agendamentos criados com sucesso!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
