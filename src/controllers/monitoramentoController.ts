import zod from 'zod';
import { Request, Response } from 'express';
import { prisma } from '../prisma/client';

const PcMonitorEventSchema = zod.object({
  sala: zod.string().min(1),
  evento: zod.enum(["iniciou-sessao", "usou-app", "encerrou-sessao"]),
  alvo: zod.string().optional(),
  timestamp: zod.string().datetime(),
});

const PcMonitorEventListSchema = zod.array(PcMonitorEventSchema).min(1);

export async function storeRoomMonitorEvent(req: Request, res: Response) {
  try {
    const payloadList = PcMonitorEventListSchema.parse(req.body);

    // Garante ordem temporal
    payloadList.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() -
        new Date(b.timestamp).getTime()
    );

    await prisma.$transaction(async (tx) => {
      for (const payload of payloadList) {
        const eventTime = new Date(payload.timestamp);

        await tx.pcUsageEvent.create({
          data: {
            roomIdAmbiente: payload.sala,
            eventType:
              payload.evento === "iniciou-sessao"
                ? "iniciou"
                : payload.evento === "encerrou-sessao"
                ? "encerrou"
                : "usou",
            targetApp: payload.alvo,
            eventTime,
            // rawPayload: payload, // opcional, mas recomendado
          },
        });
      }
    });

    return res.status(201).json({
      ok: true,
      processed: payloadList.length,
    });
  } catch (error: any) {
    console.error("Erro monitoramento batch:", error);

    if (error.issues) {
      return res.status(400).json({
        message: "Payload inválido",
        details: error.issues,
      });
    }

    return res.status(500).json({
      message: "Erro ao registrar monitoramento",
    });
  }
}
