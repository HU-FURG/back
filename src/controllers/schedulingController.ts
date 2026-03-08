import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import { DateTime } from "luxon";
import { archiveCanceledPeriods } from "../auxiliar/cancelSchecule/auxiCancelSchedule";

const agendaSchema = z.object({
  roomId: z.number(),
  userId: z.number().optional(),
  start: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Data de início inválida",
  }),
  end: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Data de fim inválida",
  }),
  nome: z.string(),
  isRecurring: z.boolean().optional(),
});

//  confirma busca em page Schedule/reservas
export async function searchUsersAndRooms(req: Request, res: Response) {
  try {
    const { userId, hierarquia } = (req as any).user;

    const schema = z.object({
      search: z.string().min(1),
    });

    const { search } = schema.parse(req.query);

    // ======================================================
    // 🔐 BLOCO PERMITIDO PARA ADMIN
    // ======================================================
    let allowedBlocks: number[] | undefined = undefined;

    if (hierarquia === "admin") {
      const scopes = await prisma.adminScope.findMany({
        where: { adminId: userId },
        select: { blocoId: true },
      });

      allowedBlocks = scopes.map((s) => s.blocoId);
    }

    // ======================================================
    // 🔎 BUSCA DE SALAS
    // ======================================================
    const rooms = await prisma.room.findMany({
      where: {
        active: true,
        ID_Ambiente: { contains: search, mode: "insensitive" },

        ...(allowedBlocks && {
          blocoId: { in: allowedBlocks },
        }),
      },
      select: {
        id: true,
        ID_Ambiente: true,
        bloco: { select: { nome: true } },
      },
      take: 5,
    });

    // ======================================================
    // 👤 BUSCA DE USUÁRIOS
    // ======================================================
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
    });

    // ======================================================
    // 📦 FORMATAÇÃO FINAL
    // ======================================================
    const results = [
      ...users.map((u) => ({
        id: u.id,
        title: u.nome,
        subtitle: u.especialidade?.nome ?? "—",
        type: "user",
      })),

      ...rooms.map((r) => ({
        id: r.id,
        title: r.ID_Ambiente,
        subtitle: r.bloco?.nome ?? "Sem Bloco",
        type: "room",
      })),
    ];

    return res.json(results);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Query de busca inválida" });
    }

    console.error("Erro ao buscar dados:", err);
    return res.status(500).json({ error: "Erro interno ao processar busca" });
  }
}

// Listar agendamentos futuros com filtros
export async function listScheduling(req: Request, res: Response) {
  const { userId, hierarquia } = (req as any).user;

  const schema = z.object({
    page: z.string().optional(),
    bloco: z.coerce.number().optional(),
    search: z.string().optional(),
    searchtipo: z.string().optional(),
    tipo: z.string().optional(),
    date: z.string().optional(),
  });

  const { page, bloco, search, searchtipo, tipo, date } = schema.parse(
    req.query,
  );

  const pageSize = 12;
  const currentPage = parseInt(page || "1", 10);
  const skip = (currentPage - 1) * pageSize;

  const filters: any[] = [];

  // ==========================================================
  // 🔎 FILTRO DE BUSCA (SALA OU USUÁRIO)
  // ==========================================================
  if (search) {
    if (searchtipo === "user") {
      filters.push({ scheduledForId: Number(search) });
    } else if (searchtipo === "room") {
      filters.push({ roomId: Number(search) });
    } else {
      filters.push({
        OR: [
          {
            scheduledFor: {
              nome: { contains: search, mode: "insensitive" },
            },
          },
          {
            room: {
              ID_Ambiente: { contains: search, mode: "insensitive" },
            },
          },
        ],
      });
    }
  }

  // ==========================================================
  // 📅 FILTRO DE DATA
  // ==========================================================
  if (date) {
    const TZ = "America/Sao_Paulo";
    const base = DateTime.fromISO(date, { zone: TZ });

    const startOfDay = base.startOf("day").toJSDate();
    const endOfDay = base.endOf("day").toJSDate();

    filters.push({
      OR: [
        {
          isRecurring: false,
          start: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        {
          isRecurring: true,
          weekday: base.weekday,
          startSchedule: { lte: endOfDay },
          endSchedule: { gte: startOfDay },
        },
      ],
    });
  }

  // ==========================================================
  // 🏢 FILTROS DE SALA
  // ==========================================================
  if (tipo && tipo !== "all") {
    filters.push({
      room: { tipo },
    });
  }

  if (bloco) {
    filters.push({
      room: { blocoId: bloco },
    });
  }

  // ==========================================================
  // 🔐 PERMISSÃO ADMIN
  // ==========================================================
  if (hierarquia === "admin") {
    filters.push({
      createdById: userId,
    });
  }

  const where = filters.length ? { AND: filters } : {};

  // ==========================================================
  // QUERY
  // ==========================================================
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
          select: { id: true, login: true, nome: true },
        },

        scheduledFor: {
          select: { id: true, login: true, nome: true },
        },
      },
    }),
  ]);

  return res.json({
    data: agendas,
    total,
    currentPage,
    totalPages: Math.ceil(total / pageSize),
  });
}

// Cancelar agendamento
export async function deleteScheduling(req: Request, res: Response) {
  const { userId, hierarquia } = (req as any).user;

  const id = Number(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "ID inválido." },
    });
  }

  const agenda = await prisma.roomPeriod.findUnique({
    where: { id },
    include: {
      room: {
        include: { bloco: true },
      },
      createdBy: true,
      scheduledFor: true,
    },
  });

  if (!agenda) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Agendamento não encontrado." },
    });
  }

  // 🔐 REGRA DE AUTORIZAÇÃO
  if (hierarquia !== "boss" && agenda.createdById !== userId) {
    return res.status(403).json({
      error: {
        code: "FORBIDDEN",
        message: "Você não tem permissão para deletar este agendamento.",
      },
    });
  }

  const dateNow = DateTime.now().setZone("America/Sao_Paulo");
  const start = DateTime.fromJSDate(agenda.start).setZone("America/Sao_Paulo");
  const end = DateTime.fromJSDate(agenda.end).setZone("America/Sao_Paulo");

  if (dateNow > start && dateNow < end) {
    return res.status(400).json({
      error: {
        code: "SCHEDULE_IN_PROGRESS",
        message: "Não é possível cancelar um agendamento em andamento.",
      },
    });
  }
  await archiveCanceledPeriods({
    periods: [agenda],
    canceledBy: { id: userId },
    reason: "Cancelado manualmente",
  });
  await prisma.roomPeriod.delete({ where: { id } });

  return res.json({
    message: "Agendamento cancelado com sucesso.",
  });
}

export async function listCurrentRoomStatus(req: Request, res: Response) {
  const agora = DateTime.now().setZone("America/Sao_Paulo").toJSDate();

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
      responsavel: ag.scheduledFor?.nome ?? ag.scheduledFor?.login ?? null,
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
}
