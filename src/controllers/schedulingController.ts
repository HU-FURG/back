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
    bloco: z.string().optional(),
    number: z.string().optional(),
    tipo: z.string().optional(),
    dateStart: z.string().optional(),
    dateEnd: z.string().optional(),
  });

  try {
    const { page, bloco, number, tipo, dateStart, dateEnd } = schema.parse(req.query);
    const pageSize = 12;
    const currentPage = parseInt(page || "1", 10);
    const skip = (currentPage - 1) * pageSize;

    const agora = new Date();

    // Filtrar por datas
    const filters: any = {};
    if (dateStart) {
      const startOfDay = new Date(dateStart + "T00:00:00");
      const endOfDay = dateEnd ? new Date(dateEnd + "T23:59:59") : new Date(dateStart + "T23:59:59");
      filters.start = { gte: startOfDay, lte: endOfDay };
    } else {
      const startOfToday = new Date(agora.toISOString().split("T")[0] + "T00:00:00");
      const endOfToday = new Date(agora.toISOString().split("T")[0] + "T23:59:59");
      filters.start = { gte: startOfToday, lte: endOfToday };
    }

    // Filtros de sala
    const roomFilters: any = {};
    if (bloco) roomFilters.bloco = { contains: bloco, mode: "insensitive" };
    if (number) roomFilters.ID_Ambiente = { contains: number, mode: "insensitive" };
    if (tipo) roomFilters.tipo = { contains: tipo, mode: "insensitive" };

    const total = await prisma.roomPeriod.count({
      where: {
        ...filters,
        room: Object.keys(roomFilters).length ? roomFilters : undefined,
      },
    });

    const agendas = await prisma.roomPeriod.findMany({
      where: {
        ...filters,
        room: Object.keys(roomFilters).length ? roomFilters : undefined,
      },
      select: {
        id: true,
        start: true,
        end: true,
        nome: true,
        isRecurring: true,
        room: {
          select: {
            id: true,
            ID_Ambiente: true,
            bloco: true,
            tipo: true,
          },
        },
        user: {
          select: {
            id: true,
            login: true,
            hierarquia: true,
          },
        },
      },
      orderBy: { start: "asc" },
      skip,
      take: pageSize,
    });

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
    const agora = DateTime.now().setZone("America/Sao_Paulo").toJSDate();
    const ala = req.params.ala
    console.log(ala)
    const salas = await prisma.room.findMany({
      where: { 
        active: true,
        bloco: {contains: ala, mode: "insensitive"}
       },
      select: {
        id: true,
        ID_Ambiente: true,
        bloco: true,
        area: true,
      },
    });

    const agendamentosAtuais = await prisma.roomPeriod.findMany({
      where: {
        start: { lte: agora }, 
        end: { gte: agora },
        room: {
          bloco: {contains: ala, mode: "insensitive"}
        }
      },
      select: {
        roomId: true,
        nome: true,
        user: {
          select: { login: true },
        },
      },
    });

    const mapaOcupacao = agendamentosAtuais.reduce<Record<number, { nome: string; responsavel?: string }>>(
      (acc, ag) => {
        acc[ag.roomId] = {
          nome: ag.nome,
          responsavel: ag.user?.login,
        };
        return acc;
      },
      {}
    );

    const statusSalas = salas.map((s) => ({
      id: s.id,
      number: s.ID_Ambiente,
      ala: s.bloco,
      area: s.area,
      ocupado: !!mapaOcupacao[s.id],
      responsavel: mapaOcupacao[s.id]?.responsavel ?? null,
      nome: mapaOcupacao[s.id]?.nome ?? null,
    }));

    return res.json(statusSalas);
  } catch (error) {
    console.error("Erro ao listar status das salas:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}