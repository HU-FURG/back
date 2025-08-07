// src/controllers/roomController.ts
import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import { console } from 'inspector';

const timeSlotSchema = z.object({
  start: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Data de início inválida",
  }),
  end: z.string().refine(val => !isNaN(Date.parse(val)), {
    message: "Data de fim inválida",
  }),
});

const bodySchema = z.record(z.array(timeSlotSchema));

export async function createRoom(req: Request, res: Response) {
  const schema = z.object({
    number: z.string(),
    description: z.string().optional(),
    tipo: z.string().optional(),
    bloco: z.string(),
  });
  console.log('creted')
  try {
    const data = schema.parse(req.body);

    // Verifica se já existe sala com mesmo número e mesmo bloco
    const exists = await prisma.room.findFirst({
      where: {
        number: data.number,
        bloco: data.bloco,
      },
    });

    if (exists) {
      return res.status(409).json({ error: 'Já existe uma sala com esse número neste bloco.' });
    }

    const room = await prisma.room.create({
      data,
    });

    return res.status(201).json(room);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    console.error("Erro ao criar sala:", error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function listRooms(req: Request, res: Response) {
  const schema = z.object({
    number: z.string().optional(),
    tipo: z.string().optional(),
    bloco: z.string().optional(),
    page: z.string().optional(),
    active: z.string().optional(),
  });
  console.log('salas')
  try {
    const { number, tipo, bloco, page, active } = schema.parse(req.query);

    const pageSize = 9;
    const currentPage = parseInt(page || "1", 10);
    const skip = (currentPage - 1) * pageSize;

    const filters: any = {};

    if (number) { filters.number = { contains: number, mode: "insensitive"};}
    if (tipo) filters.tipo = { contains: tipo, mode: "insensitive" };
    if (bloco) filters.bloco = { contains: bloco, mode: "insensitive" };
    if (active !== undefined) filters.active = active === "true";

    const total = await prisma.room.count({
      where: Object.keys(filters).length ? filters : undefined,
    });

    const rooms = await prisma.room.findMany({
      where: Object.keys(filters).length ? filters : undefined,
      take: pageSize,
      skip,
      orderBy: { number: "asc" },
    });

    return res.status(200).json({
      data: rooms,
      total,
      currentPage,
      totalPages: Math.ceil(total / pageSize),
    });

  } catch (error) {
    console.error("Erro ao listar salas:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

export async function editRoom(req: Request, res: Response): Promise<Response<any, Record<string, any>>> {
  console.log('edit item', req.params.id)

  const schema = z.object({
    id: z.number(), 
    description: z.string().optional(),
    tipo: z.string().optional(),
    active: z.boolean().optional(),
  });

  try {
    const data = schema.parse(req.body);

    // Verifica se a sala existe
    const existingRoom = await prisma.room.findUnique({
      where: {
        id: data.id,
      },
    });

    if (!existingRoom) {
      return res.status(404).json({ error: 'Sala não encontrada.' });
    }

    const updatedRoom = await prisma.room.update({
      where: {
        id: data.id,
      },
      data: {
        description: data.description,
        tipo: data.tipo,
        active: data.active,
      },
    });

    return res.status(200).json(updatedRoom);

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    console.error("Erro ao editar sala:", error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export async function deleteRooms(req: Request, res: Response) {
  const { ids } = req.body;

  // Garante que sempre lidamos com um array de números
  const idArray: number[] = Array.isArray(ids)
    ? ids.map(Number)
    : [Number(ids)];

  if (idArray.some(isNaN)) {
    return res.status(400).json({ error: 'IDs inválidos.' });
  }

  try {
    // Verifica se as salas existem
    const existingRooms = await prisma.room.findMany({
      where: { id: { in: idArray } },
    });

    if (existingRooms.length === 0) {
      return res.status(404).json({ error: 'Nenhuma sala encontrada.' });
    }

    // Deleta todas as salas encontradas
    const deleted = await prisma.room.deleteMany({
      where: { id: { in: idArray } },
    });

    return res.status(200).json({
      message: 'Salas deletadas com sucesso.',
      count: deleted.count,
    });

  } catch (error) {
    console.error("Erro ao deletar salas:", error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

