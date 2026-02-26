import zod from "zod"
import { Request, Response } from "express"
import { prisma } from "../prisma/client"

const PcMonitorEventSchema = zod.object({
  sala: zod.string().min(1),
  evento: zod.enum([
    "iniciou",
    "usou",
    "encerrou",
  ]),
  alvo: zod.string().optional(),
  timestamp: zod.coerce.date(), // ✅ normaliza aqui
})

const PcMonitorEventListSchema = zod
  .array(PcMonitorEventSchema)
  .min(1)

export async function storeRoomMonitorEvent(
  req: Request,
  res: Response
) {
  try {
    const payloadList = PcMonitorEventListSchema.parse(
      req.body.sessoes
    )

    // agora timestamp já é Date
    payloadList.sort(
      (a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
    )

    await prisma.$transaction(async (tx) => {
      for (const payload of payloadList) {
        await tx.pcUsageEvent.create({
          data: {
            roomIdAmbiente: payload.sala,
            eventType: payload.evento,
            targetApp: payload.alvo ?? null,
            eventTime: payload.timestamp, // ✅ direto
          },
        })
      }
    })

    return res.status(201).json({
      ok: true,
      processed: payloadList.length,
    })
  } catch (error: any) {
    console.error("Erro monitoramento batch:", error)

    if (error?.issues) {
      return res.status(400).json({
        message: "Payload inválido",
        details: error.issues,
      })
    }

    return res.status(500).json({
      message: "Erro ao registrar monitoramento",
    })
  }
}
