import { prisma } from "./client"
import { updateSystemLog } from "./systemLog"
import { Prisma } from "@prisma/client"

function durationInMinutes(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
}

export const clearPeriodsandUpdate = async () => {
  const agora = new Date()
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000

  try {
    const recurringToUpdate = await prisma.$transaction(async (tx) => {
      // =========================
      // 🔎 Buscar períodos expirados
      // =========================
      const periods = await tx.roomPeriod.findMany({
        where: { end: { lt: agora } },
        include: {
          room: {
            select: {
              ID_Ambiente: true,
              bloco: { select: { nome: true } },
            },
          },
        },
      })

      if (!periods.length) {
        console.log("[✅] Nenhum período expirado encontrado.")
        return []
      }

      // =========================
      // 👥 Buscar usuários (anti N+1)
      // =========================
      const userIds = [
        ...new Set(
          periods
            .map(p => p.scheduledForId)
            .filter((id): id is number => Boolean(id))
        ),
      ]

      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nome: true },
      })

      const userMap = new Map(users.map(u => [u.id, u.nome]))

      // =========================
      // 📦 Preparar operações
      // =========================
      const historyData: Prisma.PeriodHistoryCreateManyInput[] = []
      const templateData: Prisma.RoomScheduleTemplateCreateManyInput[] = []
      const toDeleteIds: number[] = []
      const recurringValid: typeof periods = []

      for (const period of periods) {
        const duration = durationInMinutes(period.start, period.end)

        const nextStart = new Date(period.start.getTime() + sevenDaysInMs)
        const exceededLimit =
          period.isRecurring &&
          period.maxScheduleTime &&
          nextStart > period.maxScheduleTime

        const scheduledForNome =
          period.scheduledForId
            ? userMap.get(period.scheduledForId) ?? "Desconhecido"
            : "Desconhecido"

        // =========================
        // 📜 HISTÓRICO
        // =========================
        historyData.push({
          roomIdAmbiente: period.room.ID_Ambiente,
          roomBloco: period.room.bloco.nome,
          roomTipo: null,

          createdById: period.createdById,
          scheduledForId: period.scheduledForId,

          createdByLogin: null,
          createdByNome: null,
          scheduledForLogin: null,
          scheduledForNome: null,

          start: period.start,
          end: period.end,
          weekday: ((period.start.getDay() + 6) % 7) + 1, // ISO 1–7

          used: false,
          startService: null,
          endService: null,

          durationMinutes: duration,
          actualDurationMinutes: null,
          archivedAt: new Date(),
        })

        // =========================
        // 📦 TEMPLATE (somente se encerrou)
        // =========================
        if (!period.isRecurring || exceededLimit) {
          templateData.push({
            userId: period.scheduledForId,
            nome: scheduledForNome,
            durationInMinutes: duration,
            roomIdAmbiente: period.room.ID_Ambiente,
            roomBloco: period.room.bloco.nome,
            originalStart: period.start,
            originalEnd: period.end,
            reason: period.isRecurring
              ? "Limite de recorrência atingido"
              : "Vencido",
          })

          toDeleteIds.push(period.id)
        } else {
          recurringValid.push(period)
        }
      }

      // =========================
      // 🧾 Persistência
      // =========================
      if (historyData.length)
        await tx.periodHistory.createMany({ data: historyData })

      if (templateData.length)
        await tx.roomScheduleTemplate.createMany({ data: templateData })

      if (toDeleteIds.length)
        await tx.roomPeriod.deleteMany({
          where: { id: { in: toDeleteIds } },
        })

      return recurringValid
    })

    // =========================
    // 🔁 Atualizar recorrentes válidos
    // =========================
    if (recurringToUpdate.length) {
      const chunkSize = 50

      for (let i = 0; i < recurringToUpdate.length; i += chunkSize) {
        const chunk = recurringToUpdate.slice(i, i + chunkSize)

        await Promise.all(
          chunk.map(period =>
            prisma.roomPeriod.update({
              where: { id: period.id },
              data: {
                start: new Date(period.start.getTime() + sevenDaysInMs),
                end: new Date(period.end.getTime() + sevenDaysInMs),
                updatedAt: new Date(),
              },
            })
          )
        )
      }
    }

    await updateSystemLog("last_clear_update", agora.toISOString())

    console.log(
      `[✅] Clear concluído. ${recurringToUpdate.length} recorrências atualizadas.`
    )
  } catch (error) {
    console.error("[❌] Erro crítico no clear:", error)
  }
}
