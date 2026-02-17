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

//  confirma busca em page Schedule/reservas
export async function searchUsersAndRooms(req: Request, res: Response) {
  try {
    const schema = z.object({
      search: z.string().min(1),
    })

    const { search } = schema.parse(req.query)

    // 1. Busca de Salas
    const rooms = await prisma.room.findMany({
      where: {
        active: true,
        ID_Ambiente: { contains: search, mode: "insensitive" }
      },
      select: {
        id: true,
        ID_Ambiente: true,
        bloco: { select: { nome: true } }
      },
      take: 5 // Limite para não sobrecarregar
    })

    // 2. Busca de Usuários
    const users = await prisma.user.findMany({
      where: {
        active: true,
        hierarquia: { not: "admin" },
        OR: [
          { nome: { contains: search, mode: "insensitive" } },
          { login: { contains: search, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        nome: true,
        especialidade: { select: { nome: true } },
      },
      orderBy: { nome: "asc" },
      take: 5,
    })

    const results = [
      ...users.map((u) => ({
        id: u.id,
        title: u.nome,
        subtitle: u.especialidade?.nome ?? "—",
        type: 'user' // Identificador para o frontend
      })),
      ...rooms.map((r) => ({
        id: r.id, // Salas geralmente usam o ID_Ambiente como chave
        title: r.ID_Ambiente,
        subtitle: r.bloco?.nome ?? "Sem Bloco",
        type: 'room' // Identificador para o frontend
      }))
    ]

    return res.json(results)

  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Query de busca inválida" })
    }
    console.error("Erro ao buscar dados:", err)
    return res.status(500).json({ error: "Erro interno ao processar busca" })
  }
}

// Listar agendamentos futuros com filtros
export async function listScheduling(req: Request, res: Response) {
  const schema = z.object({
    page: z.string().optional(),
    bloco: z.coerce.number().optional(),
    search: z.string().optional(),
    searchtipo: z.string().optional(),
    tipo: z.string().optional(),
    date: z.string().optional(),
  });

  try {
    const { page, bloco, search, searchtipo, tipo, date } = schema.parse(req.query);

    const pageSize = 12;
    const currentPage = parseInt(page || "1", 10);
    const skip = (currentPage - 1) * pageSize;

    let where: any = {};
    // ==========================================================
    // CASO A: BUSCA ESPECÍFICA (Ignora data/bloco/tipo)
    // ==========================================================
    if (search) {
      if (searchtipo === "user") {
        where = {
          OR: [
            { scheduledForId: parseInt(search) }, 
          ],
        };
      } else if (searchtipo === "room") {
        where = {
          
            OR: [
              { roomId: parseInt(search)  }
            ]
          
        };
      } else {
        // Fallback genérico
        where = {
          OR: [
            { scheduledFor: { nome: { contains: search, mode: "insensitive" } } },
            { room: { ID_Ambiente: { contains: search, mode: "insensitive" } } },
          ],
        };
      }
    } 
    // ==========================================================
    // CASO B: FILTROS NORMAIS (Data, Bloco, Tipo)
    // ==========================================================
    else {
      const TZ = "America/Sao_Paulo";
      const base = date
        ? DateTime.fromISO(date, { zone: TZ })
        : DateTime.now().setZone(TZ);

      const startOfDay = base.startOf("day").toJSDate();
      const endOfDay = base.endOf("day").toJSDate();

      where = {
        AND: [
          {
            OR: [
              // 🔹 Não recorrente
              {
                isRecurring: false,
                start: { gte: startOfDay, lte: endOfDay },
              },

              // 🔹 Recorrente
              {
                isRecurring: true,
                weekday: base.weekday,
                startSchedule: { lte: endOfDay },
                endSchedule: { gte: startOfDay },
              },
            ],
          },

          {
            room: {
              ...(tipo && tipo !== "all" && { tipo }),
              ...(bloco && { blocoId: bloco }),
            },
          },
        ],
      }
    }

    // QUERY ÚNICA COM TRANSACTION
    const [total, agendas] = await prisma.$transaction([
      prisma.roomPeriod.count({ where }),
      prisma.roomPeriod.findMany({
        where,
        orderBy: { start: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          start: true,
          end: true,
          startSchedule: true,
          endSchedule: true,
          countRecurrence: true,
          atualRecurrenceCount: true,
          isRecurring: true,
          approved: true,
          typeSchedule: true,

          room: {
            select: {
              id: true,
              ID_Ambiente: true,
              tipo: true,
              bloco: { select: { id: true, nome: true } },
            },
          },

          createdBy: {
            select: { id: true, login: true, nome: true }
          },

          scheduledFor: {
            select: { id: true, login: true, nome: true }
          },
        },
      })
    ]);

    return res.json({
      data: agendas,
      total,
      currentPage,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Erro ao listar agendamentos:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
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
