import { prisma } from "./client"
import { updateSystemLog } from "./systemLog"
import { Prisma } from "@prisma/client"
import { DateTime } from "luxon"

function durationInMinutes(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60))
}

export const clearPeriodsandUpdate = async () => {
  const agora = DateTime.now().toUTC()
  const hojeUTC = agora.startOf("day")
  const amanhaUTC = hojeUTC.plus({ days: 1 })
  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000

  try {

    // =====================================================
    // 1️⃣ CRIAR roomTimeUsedDaily PARA TODAS AS SALAS
    // =====================================================

    const rooms = await prisma.room.findMany({
      select: {
        id: true,
        ID_Ambiente: true,
        bloco: { select: { nome: true } }
      }
    })

    const roomDailyMap = new Map<string, number>()

    for (const room of rooms) {

      const reservasDoDia = await prisma.roomPeriod.findMany({
        where: {
          roomId: room.id,
          start: {
            gte: hojeUTC.toJSDate(),
            lt: amanhaUTC.toJSDate()
          }
        }
      })

      const totalUsedMinutes = reservasDoDia.reduce((acc, r) => {
        return acc + durationInMinutes(r.start, r.end)
      }, 0)

      const daily = await prisma.roomTimeUsedDaily.create({
        data: {
          date: hojeUTC.toJSDate(),
          weekday: hojeUTC.weekday,
          roomIdAmbiente: room.ID_Ambiente,
          roomBloco: room.bloco.nome,
          totalUsedMinutes
        }
      })

      roomDailyMap.set(room.ID_Ambiente, daily.id)
    }

    // =====================================================
    // 2️⃣ PROCESSAR PERÍODOS VENCIDOS
    // =====================================================

    const recurringToUpdate = await prisma.$transaction(async (tx) => {

      const periods = await tx.roomPeriod.findMany({
        where: {
          end: { lt: agora.toJSDate() }
        },
        include: {
          room: {
            select: {
              ID_Ambiente: true,
              bloco: { select: { nome: true } }
            }
          }
        }
      })

      if (!periods.length) {
        console.log("[✅] Nenhum período expirado encontrado.")
        return []
      }

      const userIds = [
        ...new Set(
          periods
            .map(p => p.scheduledForId)
            .filter((id): id is number => Boolean(id))
        )
      ]

      const users = await tx.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, nome: true }
      })

      const userMap = new Map(users.map(u => [u.id, u.nome]))

      const historyData: Prisma.PeriodHistoryCreateManyInput[] = []
      const templateData: Prisma.RoomScheduleTemplateCreateManyInput[] = []
      const reportDailyData: Prisma.PeriodReportDailyCreateManyInput[] = []
      const toDeleteIds: number[] = []
      const recurringValid: typeof periods = []

      for (const period of periods) {

        const duration = durationInMinutes(period.start, period.end)

        const scheduledForNome =
          period.scheduledForId
            ? userMap.get(period.scheduledForId) ?? "Desconhecido"
            : "Desconhecido"

        const roomDailyId = roomDailyMap.get(period.room.ID_Ambiente)

        // --------------------------
        // HISTÓRICO
        // --------------------------

        historyData.push({
          roomIdAmbiente: period.room.ID_Ambiente,
          roomBloco: period.room.bloco.nome,
          roomTipo: null,

          createdById: period.createdById,
          scheduledForId: period.scheduledForId,

          createdByLogin: null,
          createdByNome: null,
          scheduledForLogin: null,
          scheduledForNome,

          start: period.start,
          end: period.end,
          weekday: ((period.start.getUTCDay() + 6) % 7) + 1,

          used: false,
          startService: null,
          endService: null,

          durationMinutes: duration,
          actualDurationMinutes: null,
          archivedAt: agora.toJSDate()
        })

        // --------------------------
        // RELATÓRIO DIÁRIO
        // --------------------------

        if (roomDailyId) {
          reportDailyData.push({
            idPeriod: period.id,
            createdById: period.createdById,
            scheduledForId: period.scheduledForId!,
            start: period.start,
            end: period.end,
            totalUsedMinutes: duration,
            availabilityStatus: period.availabilityStatus,
            typeSchedule: period.typeSchedule,
            used: false,
            roomDailyId
          })
        }

        // --------------------------
        // CONTROLE DE RECORRÊNCIA
        // --------------------------

        const exceededLimit =
          period.isRecurring &&
          period.countRecurrence !== null &&
          period.atualRecurrenceCount !== null &&
          period.atualRecurrenceCount + 1 >= period.countRecurrence

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
              : "Reserva vencida"
          })

          toDeleteIds.push(period.id)

        } else {
          recurringValid.push(period)
        }
      }

      if (historyData.length)
        await tx.periodHistory.createMany({ data: historyData })

      if (reportDailyData.length)
        await tx.periodReportDaily.createMany({ data: reportDailyData })

      if (templateData.length)
        await tx.roomScheduleTemplate.createMany({ data: templateData })

      if (toDeleteIds.length)
        await tx.roomPeriod.deleteMany({ where: { id: { in: toDeleteIds } } })

      return recurringValid
    })

    // =====================================================
    // 3️⃣ ATUALIZAR RECORRÊNCIAS VÁLIDAS
    // =====================================================

    if (recurringToUpdate.length) {

      await Promise.all(
        recurringToUpdate.map(period =>
          prisma.roomPeriod.update({
            where: { id: period.id },
            data: {
              start: new Date(period.start.getTime() + sevenDaysInMs),
              end: new Date(period.end.getTime() + sevenDaysInMs),
              atualRecurrenceCount: { increment: 1 }
            }
          })
        )
      )
    }

    await updateSystemLog("last_clear_update", agora.toISO())

    console.log(
      `[✅] Clear concluído. ${recurringToUpdate.length} recorrências atualizadas.`
    )

  } catch (error) {
    console.error("[❌] Erro crítico no clear:", error)
  }
}
