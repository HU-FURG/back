import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import { DateTime } from "luxon"

const agendaSchema = z.object({
  roomId: z.number(),
  userId: z.number().optional(),
  start: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Data de início inválida",
  }),
  end: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Data de fim inválida",
  }),
  nome: z.string(),
  isRecurring: z.boolean().optional(),
});

// Listar agendamentos futuros com filtros
export async function listScheduling(req: Request, res: Response) {
  const schema = z.object({
    page: z.string().optional(),
    bloco: z.coerce.number().optional(),
    number: z.string().optional(),
    tipo: z.string().optional(),
    date: z.string().optional(),
  });

  try {
    const { page, bloco, number, tipo, date } = schema.parse(req.query);

    const pageSize = 12;
    const currentPage = parseInt(page || "1", 10);
    const skip = (currentPage - 1) * pageSize;
    
    const TZ = "America/Sao_Paulo"

    const agora = new Date();

    // =====================
    // FILTRO DE DATA
    // =====================
    const base = date
      ? DateTime.fromISO(date, { zone: TZ })
      : DateTime.now().setZone(TZ)

    const startOfDay = base.startOf("day").toJSDate()
    const endOfDay = base.endOf("day").toJSDate()

    const filters: any = {
    OR: [
      // 🔹 NÃO recorrente → data exata
      {
        isRecurring: false,
        start: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },

      // 🔹 Recorrente → ocorre nesse dia + válido no período
      {
        isRecurring: true,

        // ocorre neste dia específico
        weekday: base.weekday,

        // intervalo de validade
        start: {
          lte: endOfDay,
        },

        OR: [
          { maxScheduleTime: null },
          { maxScheduleTime: { gte: startOfDay } },
        ],
      },
    ],
  }


    // =====================
    // FILTROS DA SALA
    // =====================
    const roomFilters: any = {};

    if (tipo && tipo !== "all") {
      roomFilters.tipo = tipo;
    }

    if (bloco) {
      roomFilters.blocoId = bloco;
    }

  const where: any = {
      ...filters,

      ...(Object.keys(roomFilters).length && {
        room: roomFilters,
      }),

      ...(number && {
        OR: [
          {
            scheduledFor: {
              is: {
                nome: {
                  contains: number,
                  mode: "insensitive",
                },
              },
            },
          },
          {
            room: {
              ID_Ambiente: {
                contains: number,
                mode: "insensitive",
              },
            },
          },
          {
            createdBy: {
              nome: {
                contains: number,
                mode: "insensitive",
              },
            },
          },

        ],
      }),
    };

    // =====================
    // TOTAL
    // =====================
    const total = await prisma.roomPeriod.count({ where });

    // =====================
    // QUERY PRINCIPAL
    // =====================
    const agendas = await prisma.roomPeriod.findMany({
      where,
      orderBy: { start: "asc" },
      skip,
      take: pageSize,
      include: {
        room: {
          select: {
            id: true,
            ID_Ambiente: true,
            tipo: true,
            bloco: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            login: true,
            nome: true,
          },
        },
        scheduledFor: {
          select: {
            id: true,
            login: true,
            nome: true,
          },
        },
      },
    });

    return res.json({
      data: agendas,
      total,
      currentPage,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Erro ao listar agendamentos:", error);
    return res.status(500).json({
      error: "Erro interno do servidor",
    });
  }
}

// Cancelar agendamento
export async function deleteScheduling(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

  try {
    const agenda = await prisma.roomPeriod.findUnique({ where: { id } });
    if (!agenda) return res.status(404).json({ error: "Agendamento não encontrado." });

    await prisma.roomPeriod.delete({ where: { id } });
    return res.json({ message: "Agendamento cancelado com sucesso." });
  } catch (error) {
    console.error("Erro ao cancelar agendamento:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

// Modificar agendamento
export async function updateScheduling(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

  try {
    const data = agendaSchema.partial().parse(req.body); // pode atualizar parcialmente
    const agenda = await prisma.roomPeriod.findUnique({ where: { id } });
    if (!agenda) return res.status(404).json({ error: "Agendamento não encontrado." });

    // Se mudar horário, verifica conflito
    if (data.start && data.end) {
      const start = new Date(data.start);
      const end = new Date(data.end);

      const conflito = await prisma.roomPeriod.findFirst({
        where: {
          roomId: data.roomId ?? agenda.roomId,
          id: { not: id },
          OR: [{ start: { lt: end }, end: { gt: start } }],
        },
      });

      if (conflito) {
        return res.status(409).json({ error: "Já existe outro agendamento nesse horário para essa sala." });
      }
    }

    const updated = await prisma.roomPeriod.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Erro ao atualizar agendamento:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export async function listCurrentRoomStatus(req: Request, res: Response) {
  try {
    const agora = DateTime.now()
      .setZone("America/Sao_Paulo")
      .toJSDate();

    const alaId = Number(req.params.ala);

    if (Number.isNaN(alaId)) {
      return res.status(400).json({ error: "ID da ala inválido" });
    }

    // =========================
    // SALAS ATIVAS DA ALA
    // =========================
    const salas = await prisma.room.findMany({
      where: {
        active: true,
        blocoId: alaId,
      },
      select: {
        id: true,
        ID_Ambiente: true,
        area: true,
        bloco: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    // =========================
    // AGENDAMENTOS EM ANDAMENTO
    // =========================
    const agendamentosAtuais = await prisma.roomPeriod.findMany({
      where: {
        start: { lte: agora },
        end: { gte: agora },
        room: {
          blocoId: alaId,
        },
      },
      select: {
        roomId: true,
        scheduledFor: {
          select: {
            id: true,
            login: true,
            nome: true,
          },
        },
        createdBy: {
          select: {
            login: true,
          },
        },
      },
    });

    // =========================
    // MAPA DE OCUPAÇÃO
    // =========================
    const mapaOcupacao = agendamentosAtuais.reduce<
      Record<
        number,
        {
          responsavel: string | null;
          criadoPor: string | null;
        }
      >
    >((acc, ag) => {
      acc[ag.roomId] = {
        responsavel:
          ag.scheduledFor?.nome ??
          ag.scheduledFor?.login ??
          null,
        criadoPor: ag.createdBy?.login ?? null,
      };
      return acc;
    }, {});

    // =========================
    // STATUS FINAL
    // =========================
    const statusSalas = salas.map((s) => ({
      id: s.id,
      number: s.ID_Ambiente,
      ala: s.bloco.nome,
      area: s.area,
      ocupado: Boolean(mapaOcupacao[s.id]),
      responsavel: mapaOcupacao[s.id]?.responsavel ?? null,
      criadoPor: mapaOcupacao[s.id]?.criadoPor ?? null,
    }));

    return res.json(statusSalas);
  } catch (error) {
    console.error("Erro ao listar status das salas:", error);
    return res.status(500).json({
      error: "Erro interno do servidor",
    });
  }
}
