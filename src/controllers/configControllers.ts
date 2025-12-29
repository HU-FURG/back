import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import bcrypt from "bcrypt";

//------------------------------------------------
// Room Filters blocos e especialidades para typagem
//------------------------------------------------
export async function getRoomFilters(req: Request, res: Response) {
  try {
    const [blocos, especialidades] = await Promise.all([
      prisma.blocoRoom.findMany({
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
        },
      }),
      prisma.especialidadeRoom.findMany({
        orderBy: { nome: "asc" },
        select: {
          id: true,
          nome: true,
        },
      }),
    ]);

    return res.json({
      blocos,
      especialidades,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao carregar filtros" });
  }
}

//------------------------------------------------
// Users
//------------------------------------------------
export async function listUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany({
    include: { especialidade: true },
  });

  return res.json({ data: users });
}

export async function createUser(req: Request, res: Response) {
  const schema = z.object({
    login: z.string().min(3),
    senha: z.string().min(6),
    nome: z.string().optional(),
    email: z.string().email().optional(),
    telefone: z.string().optional(),
    hierarquia: z.enum(["admin", "user"]).optional(),
    especialidadeId: z.number().optional(),
  });

  const data = schema.parse(req.body);

  const hashedPassword = await bcrypt.hash(data.senha, 10);

  const user = await prisma.user.create({
    data: {
      ...data,
      senha: hashedPassword,
    },
  });

  return res.status(201).json(user);
}

export async function editUser(req: Request, res: Response) {
  const id = Number(req.params.id);

  const schema = z.object({
    nome: z.string().optional(),
    email: z.string().email().optional(),
    telefone: z.string().optional(),
    hierarquia: z.enum(["admin", "user"]).optional(),
    especialidadeId: z.number().optional(),
    active: z.boolean().optional(),
  });

  const data = schema.parse(req.body);

  const updated = await prisma.user.update({
    where: { id },
    data,
  });

  return res.json(updated);
}

//------------------------------------------------
// Especialidade Rooms
//------------------------------------------------
export async function listRoomEspecialidades(req: Request, res: Response) {
  const especialidades = await prisma.especialidadeRoom.findMany({
    orderBy: { nome: "asc" },
  });

  return res.json({ data: especialidades });
}

export async function createEspecialidadeRoom(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string(),
    especialidadesAceitas: z.array(z.string()).optional(),
  });

  const data = schema.parse(req.body);

  const roomEsp = await prisma.especialidadeRoom.create({
    data: {
      nome: data.nome,
      especialidadesAceitas: data.especialidadesAceitas
        ? JSON.stringify(data.especialidadesAceitas)
        : null,
    },
  });

  return res.status(201).json(roomEsp);
}

//------------------------------------------------
// Especialidade Users
//------------------------------------------------

export async function listUsersEspecialidades(req: Request, res: Response) {
  const especialidades = await prisma.especialidadeUser.findMany({
    orderBy: { nome: "asc" },
  });

  return res.json({ data: especialidades });
}

export async function createEspecialidadeUser(req: Request, res: Response) {
  const { nome } = z.object({ nome: z.string() }).parse(req.body);

  const esp = await prisma.especialidadeUser.create({
    data: { nome },
  });

  return res.status(201).json(esp);
}


//------------------------------------------------
// Bloco Rooms
//------------------------------------------------

export async function listBlocos(req: Request, res: Response) {
  const blocos = await prisma.blocoRoom.findMany({
    orderBy: { nome: "asc" },
    include: {
      _count: { select: { rooms: true } }
    }
  });

  const data = blocos.map((b) => ({
    id: b.id,
    nome: b.nome,
    totalSalas: b._count.rooms,
  }))

  return res.json({ data: data });
}

export async function createBloco(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string().min(1),
  });

  const { nome } = schema.parse(req.body);

  const bloco = await prisma.blocoRoom.create({
    data: { nome },
  });

  return res.status(201).json(bloco);
}

export async function editBloco(req: Request, res: Response) {
  const id = Number(req.params.id);

  const schema = z.object({
    nome: z.string().min(1),
  });

  const { nome } = schema.parse(req.body);

  const bloco = await prisma.blocoRoom.update({
    where: { id },
    data: { nome },
  });

  return res.json(bloco);
}

//------------------------------------------------