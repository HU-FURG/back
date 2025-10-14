import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";

export async function listReschedule(req: Request, res: Response) {
  const schema = z.object({
    page: z.string().optional(),
    bloco: z.string().optional(),
    number: z.string().optional(),
    tipo: z.string().optional(),
    date: z.string().optional(),
  });

  try {
    const { page, bloco, number, tipo, date } = schema.parse(req.query);
    const pageSize = 12;
    const currentPage = parseInt(page || "1", 10);
    const skip = (currentPage - 1) * pageSize;

    const hoje = new Date();
    const ontem = new Date();
    ontem.setDate(hoje.getDate() - 1);

    // Filtros principais de datas
    const filters: any = {};
    if (date) {
      const startOfDay = new Date(date + "T00:00:00");
      const endOfDay = new Date(date + "T23:59:59");
      filters.originalStart = { gte: startOfDay, lte: endOfDay };
    } 
    // Filtros de sala aplicados diretamente nos campos de RoomScheduleTemplate
    if (bloco) filters.roomBloco = { contains: bloco, mode: "insensitive" };
    if (number) filters.roomIdAmbiente = { contains: number, mode: "insensitive" };
    if (tipo) filters.roomBloco = { contains: tipo, mode: "insensitive" }; // Se houver tipo na template, ajuste aqui

    const total = await prisma.roomScheduleTemplate.count({ where: filters });

    const agendas = await prisma.roomScheduleTemplate.findMany({
      where: filters,
      select: {
        id: true,
        durationInMinutes: true,
        originalEnd: true,
        originalStart: true,
        nome: true,
        roomBloco: true,
        roomIdAmbiente: true,
      },
      orderBy: { originalStart: "asc" },
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
    console.error("Erro ao listar agendamentos de reprogramação:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}
