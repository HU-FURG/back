import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import bcrypt from "bcrypt";
import { DateTime } from "luxon";
import { validateUserPayload } from "../auxiliar/validarUser";

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
  const userAuth = (req as any).user;

  const users = await prisma.user.findMany({
     where: {
      active: true,
      id: { not: userAuth.id }},
    select: {
      id: true,
      login: true,
      nome: true,
      email: true,
      telefone: true,
      hierarquia: true,
      active: true,
      descricao: true,
      especialidade: {
        select: {
          id: true,
          nome: true
        }
      },
    },
  });

  const admins = users.filter(u => u.hierarquia === 'admin')
  const usersComuns = users.filter(u => u.hierarquia === 'user')

  return res.json({ data: {admins, usersComuns} });
}

export async function listUsersDesactive(req: Request, res: Response) {
  const userAuth = (req as any).user;
  const users = await prisma.user.findMany({
    where: {
      active: false,
      id: { not: userAuth.id }
    },
    select: {
      id: true,
      login: true,
      nome: true,
      email: true,
      telefone: true,
      hierarquia: true,
      active: true,
      descricao: true,
      especialidade: {
        select: {
          id: true,
          nome: true
        }
      },
    },
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
    descricao: z.string().optional(),
  });

  const data = schema.parse(req.body);

  const validated = await validateUserPayload(data, res, {
    mode: "create",
  })

  if (!validated) return

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
  const id = Number(req.params.id)

  const schema = z.object({
    nome: z.string().optional(),
    email: z.string().email().optional(),
    telefone: z.string().optional(),
    especialidadeId: z.number().optional(),
    descricao: z.string().optional(),
    active: z.boolean().optional(),
    force: z.boolean().optional(), 
  })

  if (Number.isNaN(id)) {
    return res.status(400).json({ message: "ID inválido" })
  }
  
  const data = schema.parse(req.body)

  const { force, ...userData } = data

  const userExists = await prisma.user.findUnique({
    where: { id },
  })

  // validações
  if (!userExists) {
    return res.status(404).json({ message: "Usuário não encontrado" })
  }
  if (userExists.hierarquia === "admin" && data.active === false) {
    return res.status(404).json({ message: "Não é permitido desativar um usuário admin" })
  }
  
  // ===============================
  // REGRA DE DESATIVAÇÃO
  // ===============================
  if (data.active === false) {
    const TZ = "America/Sao_Paulo";
    const agoraUTC = DateTime.now().setZone(TZ).toUTC().toJSDate();

    const futureSchedules = await prisma.roomPeriod.findMany({
      where: {
        start: { gte: agoraUTC },
        OR: [
          { scheduledForId: id },
          { createdById: id },
        ],
      },
      select: { id: true, start: true },
    })

    if (futureSchedules.length > 0 && !force) {
      return res.status(409).json({
        code: "USER_HAS_FUTURE_SCHEDULES",
        message:
          "Usuário possui agendamentos futuros e não pode ser desativado.",
        schedulesCount: futureSchedules.length,
      })
    }

    // 🔥 FORCE = TRUE → apagar agendas futuras
    if (futureSchedules.length > 0 && force) {
      // 1️⃣ Buscar agendas completas
      const schedules = await prisma.roomPeriod.findMany({
        where: {
          start: { gte: agoraUTC },
          OR: [
            { scheduledForId: id },
            { createdById: id },
          ],
        },
        include: {
          room: true,
        },
      })

      // 2️⃣ Criar templates de cancelamento
      await prisma.roomScheduleTemplate.createMany({
        data: schedules.map((s) => ({
          userId: s.scheduledForId ?? s.createdById ?? null,
          nome: "Agendamento cancelado",
          durationInMinutes:
            Math.ceil(
              (s.end.getTime() - s.start.getTime()) / 60000,
            ),

          roomIdAmbiente: s.room.id.toString(),
          roomBloco: s.room.blocoId.toString() ?? "-",

          originalStart: s.start,
          originalEnd: s.end,

          reason: "Cancelado por desativação do usuário",
        })),
      })

      // 3️⃣ Apagar agendas futuras
      await prisma.roomPeriod.deleteMany({
        where: {
          start: { gte: agoraUTC },
          OR: [
            { scheduledForId: id },
            { createdById: id },
          ],
        },
      })
    }
  }
  // ===============================
  // ATUALIZA USUÁRIO
  // ===============================

  const validate = validateUserPayload(userData, res, { mode: "edit", userId: id })
  if (!validate) return

  await prisma.user.update({
    where: { id },
    data: userData,
  });

  return res.status(200).json({message: "Usuário atualizado com sucesso"});
}

export async function deleteUser(req: Request, res: Response) {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: "ID inválido" });
  }

  const userExists = await prisma.user.findUnique({
    where: { id },
  });

  if (!userExists) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }

  if (userExists.hierarquia === "admin") {
    return res.status(400).json({ message: "Não é permitido deletar um usuário admin" });
  }

  const agora = new Date()
  const diffEmMs = agora.getTime() - userExists.createdAt.getTime()
  const diffEmDias = diffEmMs / (1000 * 60 * 60 * 24)

  if (userExists.active === true) {
    return res.status(400).json({
      message: "Não é permitido deletar usuários ativos",
    })
  }

  if (diffEmDias > 30) {
    return res.status(400).json({
      message: "Só é permitido deletar usuários criados há menos de 30 dias",
    })
  }

  const historicoReservas = await prisma.roomPeriod.findFirst({
    where: { scheduledForId: id },
  });

  if (historicoReservas) {
    return res.status(400).json({ message: "Não é permitido deletar usuários com histórico de reservas." });
  } 

  await prisma.user.delete({
    where: { id },
  });

  return res.status(200).json({ message: "Usuário deletado com sucesso" });
}

//------------------------------------------------
// Especialidade Rooms
//------------------------------------------------
export async function listRoomEspecialidades(req: Request, res: Response) {
  const especialidades = await prisma.especialidadeRoom.findMany({
    orderBy: { nome: "asc" },
    include: {
      especialidadesAceitas: {
        select: {
          id: true,
          nome: true,
        },
      },
    },
  })

  return res.json({ data: especialidades })
}


export async function createEspecialidadeRoom(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string(),
    especialidadesAceitas: z.array(z.number()).optional(),
  })

  const data = schema.parse(req.body)

  const roomEsp = await prisma.especialidadeRoom.create({
    data: {
      nome: data.nome,
      ...(data.especialidadesAceitas && {
        especialidadesAceitas: {
          connect: data.especialidadesAceitas.map((id) => ({ id })),
        },
      }),
    },
    include: {
      especialidadesAceitas: {
        select: { id: true, nome: true },
      },
    },
  })

  return res.status(201).json(roomEsp)
}

export async function updateEspecialidadeRoom(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string(),
    especialidadesAceitas: z.array(z.number()).optional(),
  })

  const { id } = req.params
  const data = schema.parse(req.body)

  const updated = await prisma.especialidadeRoom.update({
    where: { id: Number(id) },
    data: {
      nome: data.nome,
      ...(data.especialidadesAceitas && {
        especialidadesAceitas: {
          set: data.especialidadesAceitas.map((id) => ({ id })),
        },
      }),
    },
    include: {
      especialidadesAceitas: {
        select: { id: true, nome: true },
      },
    },
  })

  return res.json(updated)
}

//------------------------------------------------
// Especialidade Users
//------------------------------------------------

export async function listUsersEspecialidades(req: Request, res: Response) {
  const especialidades = await prisma.especialidadeUser.findMany({
    orderBy: { nome: "asc" },
    include: {
      _count: { select: { users: true } },
    },
  });

  const data = especialidades.map((e) => ({
    id: e.id,
    nome: e.nome,
    totalUsers: e._count.users,
  }))

  return res.json({ data: data });
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

export async function deleteBloco(req: Request, res: Response) {
  const blocoId = Number(req.params.id);
  
  if (Number.isNaN(blocoId)) {
    return res.status(400).json({ message: "não possui id" });
  }

  const temSalasRegistradas = await prisma.blocoRoom.findUnique({
    where: { id: blocoId },
    include: {
      _count: { select: { rooms: true } }
    }
  });

  if (!temSalasRegistradas) {
    return res.status(404).json({ message: "Bloco não encontrado" });
  }

  if (temSalasRegistradas._count.rooms > 0) {
    return res.status(400).json({ message: "Não é permitido deletar um bloco com salas registradas" });
  }

  await prisma.blocoRoom.delete({
    where: { id: blocoId }
  });

  return res.json({ message: "Bloco deletado com sucesso" });
}


//------------------------------------------------