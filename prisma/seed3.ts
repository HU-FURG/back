import { PrismaClient } from "@prisma/client"
import { DateTime } from "luxon"

const prisma = new PrismaClient()

async function main() {
  console.log("🔎 Buscando usuários e salas...")

  const admin = await prisma.user.findFirst({
    where: { hierarquia: "admin" },
  })

  if (!admin) {
    console.log("❌ Nenhum admin encontrado.")
    return
  }

  const users = await prisma.user.findMany({
    where: { hierarquia: "user" },
  })

  const rooms = await prisma.room.findMany()

  console.log(`👥 ${users.length} usuários | 🏢 ${rooms.length} salas`)

  if (users.length === 0 || rooms.length === 0) {
    console.log("❌ Seed abortado: usuários ou salas inexistentes.")
    return
  }

  await prisma.roomPeriod.deleteMany()
  console.log("🧹 Reservas antigas apagadas.")

  const hoje = new Date()
  const startOfWeek = new Date(hoje)
  startOfWeek.setDate(startOfWeek.getDate() - hoje.getDay() + 1) // segunda

  let criados = 0

  for (let dia = 0; dia < 5; dia++) {
    const dataBase = new Date(startOfWeek)
    dataBase.setDate(startOfWeek.getDate() + dia)

    for (const user of users) {
      const isMorning = Math.random() < 0.5
      const startHour = isMorning ? 8 : 13
      const endHour = isMorning ? 12 : 17

      const startLocal = new Date(dataBase)
      const endLocal = new Date(dataBase)

      startLocal.setHours(startHour, 0, 0, 0)
      endLocal.setHours(endHour, 0, 0, 0)

      const start = DateTime.fromJSDate(startLocal, { zone: "America/Sao_Paulo" })
        .toUTC()
        .toJSDate()

      const end = DateTime.fromJSDate(endLocal, { zone: "America/Sao_Paulo" })
        .toUTC()
        .toJSDate()

      const sala = rooms[Math.floor(Math.random() * rooms.length)]
      const isRecurring = Math.random() < 0.8

      const conflito = await prisma.roomPeriod.findFirst({
        where: {
          roomId: sala.id,
          start: { lt: end },
          end: { gt: start },
        },
      })

      const salaFinal = conflito
        ? rooms[Math.floor(Math.random() * rooms.length)]
        : sala

      await prisma.roomPeriod.create({
        data: {
          roomId: salaFinal.id,

          // 🔑 NOVO MODELO
          createdById: admin.id,
          scheduledForId: user.id,

          start,
          end,
          isRecurring,
          approved: true,
        },
      })

      criados++
    }
  }

  console.log(`✅ ${criados} agendamentos criados com sucesso!`)
}

main()
  .catch((e) => {
    console.error("🔥 ERRO NO SEED:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
