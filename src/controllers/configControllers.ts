import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import bcrypt from "bcrypt";
import { DateTime } from "luxon";
import { validateUserPayload } from "../auxiliar/validarUser";
import { archiveCanceledPeriods } from "../auxiliar/cancelSchecule/auxiCancelSchedule";

//------------------------------------------------
// Room Filters blocos e especialidades para typagem
//------------------------------------------------
export async function getRoomFilters(req: Request, res: Response) {
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
}

//------------------------------------------------
// Users
//------------------------------------------------
export async function listUsers(req: Request, res: Response) {
  try {
    const userAuth = (req as any).user;

    const users = await prisma.user.findMany({
      where: {
        active: true,
        id: { not: userAuth.id },
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
            nome: true,
          },
        },

        // 🔥 IMPORTANTE: trazer áreas vinculadas
        adminScopes: {
          select: {
            bloco: {
              select: {
                id: true,
                nome: true,
              },
            },
          },
        },
      },
    });

    const admins = users
      .filter((u) => u.hierarquia === "admin" || u.hierarquia === "boss")
      .map((u) => {
        const { adminScopes, ...rest } = u;

        if (u.hierarquia === "boss") {
          return {
            ...rest,
            areas: "ACESSO_TOTAL",
          };
        }

        return {
          ...rest,
          areas: adminScopes.map((scope) => scope.bloco),
        };
      });

    const usersComuns = users
      .filter((u) => u.hierarquia === "user")
      .map((u) => {
        const { adminScopes, ...rest } = u;
        return rest;
      });

    return res.json({
      data: {
        admins,
        usersComuns,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      error: "Erro ao listar usuários.",
    });
  }
}

export async function listUsersDesactive(req: Request, res: Response) {
  const userAuth = (req as any).user;
  const users = await prisma.user.findMany({
    where: {
      active: false,
      id: { not: userAuth.id },
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
          nome: true,
        },
      },
    },
  });

  return res.json({ data: users });
}

async function generateUniqueLogin(nome: string): Promise<string> {
  const baseLogin = nome.toLowerCase().trim().replace(/\s+/g, ".");

  let login = baseLogin;
  let counter = 1;

  while (true) {
    const exists = await prisma.user.findUnique({
      where: { login },
    });

    if (!exists) break;

    counter++;
    login = `${baseLogin}${counter}`;
  }

  return login;
}

export async function createUser(req: Request, res: Response) {
  try {
    const authUser = (req as any).user;

    // 🔐 Só boss cria usuários
    if (!authUser || authUser.hierarquia !== "boss") {
      return res.status(403).json({
        error: "Apenas o administrador principal pode criar usuários.",
      });
    }

    const schema = z.object({
      nome: z.string().optional(),
      email: z.string().email().optional(),
      login: z.string().optional(),
      telefone: z.string().optional(),
      hierarquia: z.enum(["admin", "user", "boss"]),
      especialidadeId: z.number().optional(),
      descricao: z.string().optional(),
      areas: z.array(z.number()).optional(),
    });

    const data = schema.parse(req.body);

    let loginFinal = "";

    let especialidadeFinal: number | null = null;

    // =========================
    // 👑 BOSS
    // =========================
    if (data.hierarquia === "boss") {
      if (!data.login) {
        return res.status(400).json({
          error: "Boss deve informar login e senha.",
        });
      }

      const especialidadeAdmin = await prisma.especialidadeUser.findFirst({
        where: { nome: "Administrador" },
      });

      loginFinal = data.login;
      especialidadeFinal = especialidadeAdmin?.id ?? null;
    }

    // =========================
    // 🛠 ADMIN (com áreas)
    // =========================
    if (data.hierarquia === "admin") {
      if (!data.login) {
        return res.status(400).json({
          error: "Admin deve informar login",
        });
      }

      if (!data.areas || data.areas.length === 0) {
        return res.status(400).json({
          error: "Admin deve ter pelo menos uma área vinculada.",
        });
      }

      // Validar se blocos existem
      const blocosExistentes = await prisma.blocoRoom.findMany({
        where: { id: { in: data.areas } },
      });

      if (blocosExistentes.length !== data.areas.length) {
        return res.status(400).json({
          error: "Uma ou mais áreas informadas são inválidas.",
        });
      }

      const especialidadeAdmin = await prisma.especialidadeUser.findFirst({
        where: { nome: "Administrador" },
      });

      loginFinal = data.login;
      especialidadeFinal = especialidadeAdmin?.id ?? null;
    }

    // =========================
    // 👤 USER (médico)
    // =========================
    if (data.hierarquia === "user") {
      if (!data.nome || !data.especialidadeId) {
        return res.status(400).json({
          error: "Usuário comum deve ter nome e especialidade.",
        });
      }

      loginFinal = await generateUniqueLogin(data.nome);
      especialidadeFinal = data.especialidadeId;
    }

    // 🔎 Verificar login único
    const loginExists = await prisma.user.findUnique({
      where: { login: loginFinal },
    });

    if (loginExists) {
      return res.status(409).json({
        error: "Login já está em uso.",
      });
    }
    let senhaFinal = await bcrypt.hash("hufurg", 10);

    // 🔥 TRANSACTION
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          login: loginFinal,
          senha: senhaFinal,
          nome: data.nome,
          email: data.email,
          telefone: data.telefone,
          descricao: data.descricao,
          hierarquia: data.hierarquia,
          especialidadeId: especialidadeFinal,
          active: true,
        },
      });

      // Criar AdminScope apenas para admin
      if (data.hierarquia === "admin") {
        await tx.adminScope.createMany({
          data: data.areas!.map((blocoId) => ({
            adminId: user.id,
            blocoId,
          })),
        });
      }

      return res.status(201).json(user);
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    console.error("Erro ao criar usuário:", error);
    return res.status(500).json({ error: "Erro interno do servidor." });
  }
}

export async function editUser(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);

    const schema = z.object({
      nome: z.string().optional(),
      email: z.string().email().optional(),
      telefone: z.string().optional(),
      especialidadeId: z.number().optional(),
      descricao: z.string().optional(),
      active: z.boolean().optional(),
      force: z.boolean().optional(),
    });

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const data = schema.parse(req.body);

    const { force, ...userData } = data;

    const userExists = await prisma.user.findUnique({
      where: { id },
    });

    // validações
    if (!userExists) {
      return res.status(404).json({ message: "Usuário não encontrado" });
    }

    // ===============================
    // REGRA DE DESATIVAÇÃO
    // ===============================
    if (data.active === false) {
      const TZ = "America/Sao_Paulo";
      const agoraUTC = DateTime.now().setZone(TZ).toUTC().toJSDate();

      // 🔒 Regra do último boss
      if (userExists.hierarquia === "boss") {
        const activeBossCount = await prisma.user.count({
          where: {
            hierarquia: "boss",
            active: true,
          },
        });

        if (activeBossCount <= 1) {
          return res.status(400).json({
            message: "Deve existir pelo menos um boss ativo no sistema.",
          });
        }
      }

      // 🔥 SOMENTE USER tem cancelamento automático
      if (userExists.hierarquia === "user") {
        const futureSchedules = await prisma.roomPeriod.findMany({
          where: {
            start: { gte: agoraUTC },
            OR: [{ scheduledForId: id }, { createdById: id }],
          },
          select: { id: true },
        });

        if (futureSchedules.length > 0 && !force) {
          return res.status(409).json({
            code: "USER_HAS_FUTURE_SCHEDULES",
            message:
              "Usuário possui agendamentos futuros e não pode ser desativado.",
            schedulesCount: futureSchedules.length,
          });
        }

        if (futureSchedules.length > 0 && force) {
          const schedules = await prisma.roomPeriod.findMany({
            where: {
              start: { gte: agoraUTC },
              OR: [{ scheduledForId: id }, { createdById: id }],
            },
            include: {
              room: { include: { bloco: true } },
              createdBy: true,
              scheduledFor: true,
            },
          });

          await archiveCanceledPeriods({
            periods: schedules,
            canceledBy: { id },
            reason: "Cancelado por desativação do usuário",
          });
        }
      }
    }
    // ===============================
    // ATUALIZA USUÁRIO
    // ===============================

    const validate = validateUserPayload(userData, res, {
      mode: "edit",
      userId: id,
    });
    if (!validate) return;

    await prisma.user.update({
      where: { id },
      data: userData,
    });

    return res.status(200).json({ message: "Usuário atualizado com sucesso" });
  } catch (error) {
    console.error("Erro ao editar usuário:", error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: "Dados inválidos",
        errors: error.errors,
      });
    }

    return res.status(500).json({
      message: "Erro interno no servidor",
    });
  }
}

export async function deleteUser(req: Request, res: Response) {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({
      error: { code: "INVALID_ID", message: "ID inválido" },
    });
  }

  const user = await prisma.user.findUnique({
    where: { id },
  });

  if (!user) {
    return res.status(404).json({
      error: { code: "USER_NOT_FOUND", message: "Usuário não encontrado" },
    });
  }

  if (user.hierarquia === "admin") {
    return res.status(403).json({
      error: {
        code: "CANNOT_DELETE_ADMIN",
        message: "Não é permitido deletar um usuário admin",
      },
    });
  }

  if (user.active) {
    return res.status(400).json({
      error: {
        code: "USER_ACTIVE",
        message: "Não é permitido deletar usuários ativos",
      },
    });
  }

  // 🔎 Só pode deletar usuários criados há menos de 30 dias
  const diffEmDias =
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (diffEmDias > 30) {
    return res.status(400).json({
      error: {
        code: "USER_TOO_OLD",
        message: "Só é permitido deletar usuários criados há menos de 30 dias",
      },
    });
  }

  // 🔎 Verificar qualquer vínculo com reservas
  const hasRelations = await prisma.$transaction(async (tx) => {
    const activePeriods = await tx.roomPeriod.findFirst({
      where: {
        OR: [{ createdById: id }, { scheduledForId: id }],
      },
      select: { id: true },
    });

    if (activePeriods) return true;

    const canceled = await tx.roomPeriodCanceled.findFirst({
      where: {
        OR: [{ createdById: id }, { scheduledForId: id }],
      },
      select: { id: true },
    });

    if (canceled) return true;

    const history = await tx.periodHistory.findFirst({
      where: {
        OR: [{ createdById: id }, { scheduledForId: id }],
      },
      select: { id: true },
    });

    if (history) return true;

    return false;
  });

  if (hasRelations) {
    return res.status(400).json({
      error: {
        code: "USER_HAS_HISTORY",
        message: "Não é permitido deletar usuários com histórico de reservas.",
      },
    });
  }

  await prisma.user.delete({
    where: { id },
  });

  return res.status(200).json({
    message: "Usuário deletado com sucesso",
  });
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
  });

  return res.json({ data: especialidades });
}

export async function createEspecialidadeRoom(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string(),
    especialidadesAceitas: z.array(z.number()).optional(),
  });

  const data = schema.parse(req.body);

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
  });

  return res.status(201).json(roomEsp);
}

export async function updateEspecialidadeRoom(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string(),
    especialidadesAceitas: z.array(z.number()).optional(),
  });

  const { id } = req.params;
  const roomId = Number(id);

  const data = schema.parse(req.body);

  const existing = await prisma.especialidadeRoom.findUnique({
    where: { id: roomId },
  });

  if (!existing) {
    return res.status(404).json({ error: "Especialidade não encontrada" });
  }

  const updated = await prisma.$transaction(async (tx) => {
    return tx.especialidadeRoom.update({
      where: { id: roomId },
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
    });
  });

  return res.json(updated);
}

export async function deleteEspecialidadeRoom(req: Request, res: Response) {
  const { id } = req.params;
  const roomId = Number(id);

  const existing = await prisma.especialidadeRoom.findUnique({
    where: { id: roomId },
    include: {
      rooms: true,
    },
  });

  if (!existing) {
    return res.status(404).json({ error: "Especialidade não encontrada" });
  }

  if (existing.rooms.length > 0) {
    return res.status(400).json({
      error:
        "Não é possível deletar. Existem salas vinculadas a essa especialidade.",
    });
  }

  await prisma.especialidadeRoom.delete({
    where: { id: roomId },
  });

  return res.status(204).send();
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
  }));

  return res.json({ data: data });
}

export async function createEspecialidadeUser(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string().min(1, "Nome é obrigatório"),
  });

  const { nome } = schema.parse(req.body);
  const nomeFormatado = nome.trim();

  const existing = await prisma.especialidadeUser.findFirst({
    where: {
      nome: {
        equals: nomeFormatado,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return res.status(400).json({
      error: "Já existe uma especialidade com esse nome.",
    });
  }

  const esp = await prisma.especialidadeUser.create({
    data: { nome: nomeFormatado },
  });

  return res.status(201).json(esp);
}

export async function updateEspecialidadeUser(req: Request, res: Response) {
  const schema = z.object({
    nome: z.string().min(1, "Nome é obrigatório"),
  });

  const { id } = req.params;
  const userId = Number(id);

  const { nome } = schema.parse(req.body);
  const nomeFormatado = nome.trim();

  const existing = await prisma.especialidadeUser.findUnique({
    where: { id: userId },
  });

  if (!existing) {
    return res.status(404).json({
      error: "Especialidade não encontrada.",
    });
  }

  const duplicate = await prisma.especialidadeUser.findFirst({
    where: {
      nome: {
        equals: nomeFormatado,
        mode: "insensitive",
      },
      NOT: { id: userId },
    },
  });

  if (duplicate) {
    return res.status(400).json({
      error: "Já existe uma especialidade com esse nome.",
    });
  }

  const updated = await prisma.especialidadeUser.update({
    where: { id: userId },
    data: { nome: nomeFormatado },
  });

  return res.json(updated);
}

export async function deleteEspecialidadeUser(req: Request, res: Response) {
  const { id } = req.params;
  const userId = Number(id);

  const existing = await prisma.especialidadeUser.findUnique({
    where: { id: userId },
  });

  if (!existing) {
    return res.status(404).json({
      error: "Especialidade não encontrada.",
    });
  }

  const usersCount = await prisma.user.count({
    where: {
      especialidadeId: userId,
    },
  });

  if (usersCount > 0) {
    return res.status(400).json({
      error:
        "Não é possível excluir. Existem usuários vinculados a essa especialidade.",
    });
  }

  const count = await prisma.especialidadeRoom.count({
    where: {
      especialidadesAceitas: {
        some: {
          id: userId,
        },
      },
    },
  });

  if (count > 0) {
    return res.status(400).json({
      error:
        "Não é possível excluir. Essa especialidade está vinculada a uma especialidade de sala.",
    });
  }

  await prisma.especialidadeUser.delete({
    where: { id: userId },
  });

  return res.status(204).send();
}
//------------------------------------------------
// Bloco Rooms
//------------------------------------------------

export async function listBlocos(req: Request, res: Response) {
  const blocos = await prisma.blocoRoom.findMany({
    orderBy: { nome: "asc" },
    include: {
      _count: { select: { rooms: true } },
    },
  });

  const data = blocos.map((b) => ({
    id: b.id,
    nome: b.nome,
    totalSalas: b._count.rooms,
  }));

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
      _count: { select: { rooms: true } },
    },
  });

  if (!temSalasRegistradas) {
    return res.status(404).json({ message: "Bloco não encontrado" });
  }

  if (temSalasRegistradas._count.rooms > 0) {
    return res.status(400).json({
      message: "Não é permitido deletar um bloco com salas registradas",
    });
  }

  await prisma.blocoRoom.delete({
    where: { id: blocoId },
  });

  return res.json({ message: "Bloco deletado com sucesso" });
}

//------------------------------------------------
