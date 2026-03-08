// src/controllers/roomController.ts
import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";
import { debugLog } from "../auxiliar/debugLog";
import { Prisma, RoomPeriod } from "@prisma/client";
import { checkActiveRoomConflicts } from "../auxiliar/roomAuxi";
import { DateTime } from "luxon";
import { archiveCanceledPeriods } from "../auxiliar/cancelSchecule/auxiCancelSchedule";

// ✅ Criação de sala
export async function createRoom(req: Request, res: Response) {
  const schema = z.object({
    number: z.string().min(0),
    tipo: z.string().min(0),
    banheiro: z.boolean(),
    blocoId: z.number().int().positive(),
    ambiente: z.string().min(1),
    especialidadeRoomId: z.number().int().positive(),
    area: z.number().positive(),
  });

  debugLog("createRoom - dados recebidos", req.body);

  try {
    const data = schema.parse(req.body);

    // 🔹 Verifica se já existe sala com mesmo ID_Ambiente
    const exists = await prisma.room.findFirst({
      where: { ID_Ambiente: data.number },
    });

    if (exists) {
      return res
        .status(409)
        .json({ error: "Já existe uma sala com esse ID_Ambiente." });
    }

    // 🔹 Valida bloco
    const blocoExists = await prisma.blocoRoom.findUnique({
      where: { id: data.blocoId },
    });

    if (!blocoExists) {
      return res.status(400).json({ error: "Bloco inválido" });
    }

    // 🔹 Valida especialidade
    const especialidadeExists = await prisma.especialidadeRoom.findUnique({
      where: { id: data.especialidadeRoomId },
    });

    if (!especialidadeExists) {
      return res.status(400).json({ error: "Especialidade da sala inválida" });
    }

    // 🔹 Criação da sala
    const room = await prisma.room.create({
      data: {
        ID_Ambiente: data.number,
        tipo: data.tipo,
        banheiro: data.banheiro,
        blocoId: data.blocoId, // ✅ agora sempre ID
        ambiente: data.ambiente,
        especialidadeId: data.especialidadeRoomId,
        area: data.area,
        active: true, // 🔹 se existir no schema
      },
    });

    return res.status(201).json(room);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    console.error("Erro ao criar sala:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

// ✅ Listar salas
export async function listRooms(req: Request, res: Response) {
  try {
    const userAuth = (req as any).user;

    if (!userAuth?.userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // =========================
    // USUÁRIO LOGADO
    // =========================
    const usuario = await prisma.user.findUnique({
      where: { id: userAuth.userId },
      include: {
        especialidade: true,
      },
    });

    if (!usuario) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    // =========================
    // BOSS → VÊ TUDO
    // =========================
    if (usuario.hierarquia === "boss") {
      const rooms = await prisma.room.findMany({
        include: {
          bloco: true,
          especialidade: true,
        },
      });

      return res.status(200).json({ data: rooms });
    }

    // =========================
    // ADMIN → FILTRA POR BLOCOS
    // =========================
    if (usuario.hierarquia === "admin") {
      const blocosPermitidos = await prisma.adminScope.findMany({
        where: {
          adminId: usuario.id,
        },
        select: {
          blocoId: true,
        },
      });

      const blocosIds = blocosPermitidos.map((b) => b.blocoId);

      const rooms = await prisma.room.findMany({
        where: {
          active: true,
          blocoId: {
            in: blocosIds,
          },
        },
        include: {
          bloco: true,
          especialidade: true,
        },
      });

      return res.status(200).json({ data: rooms });
    }

    // =========================
    // USER COMUM
    // =========================
    const rooms = await prisma.room.findMany({
      where: { active: true },
      include: {
        bloco: true,
        especialidade: {
          include: {
            especialidadesAceitas: true,
          },
        },
      },
    });

    const especialidadeUserId = usuario.especialidadeId;

    const salasFiltradas = rooms.filter((room) => {
      if (room.tipo.toLowerCase() === "diferenciado") {
        return true;
      }

      if (!room.especialidade) {
        return false;
      }

      if (!especialidadeUserId) {
        return false;
      }

      return room.especialidade.especialidadesAceitas.some(
        (esp) => esp.id === especialidadeUserId,
      );
    });

    return res.status(200).json({ data: salasFiltradas });
  } catch (error) {
    console.error("Erro ao listar salas:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}
// ✅ Editar sala
export async function editRoom(req: Request, res: Response) {
  const schema = z.object({
    especialidadeId: z.number().optional(),
    blocoId: z.number().optional(),
    ambiente: z.string().optional(),
    banheiro: z.boolean().optional(),
    tipo: z.string().optional(),
    active: z.boolean().optional(),
    force: z.boolean().optional(),
  });

  const idFromParams = Number(req.params.id);

  if (Number.isNaN(idFromParams)) {
    return res.status(400).json({ error: "ID inválido" });
  }

  const data = schema.parse(req.body);

  const existingRoom = await prisma.room.findUnique({
    where: { id: idFromParams },
    include: {
      bloco: { select: { id: true, nome: true } },
    },
  });

  if (!existingRoom) {
    return res.status(404).json({ error: "Sala não encontrada." });
  }

  // ✅ valida especialidade SOMENTE se veio no payload
  if (data.especialidadeId !== undefined) {
    const especialidadeExists = await prisma.especialidadeRoom.findUnique({
      where: { id: data.especialidadeId },
    });

    if (!especialidadeExists) {
      return res.status(400).json({ error: "Especialidade da sala inválida" });
    }
  }

  // ✅ valida bloco SOMENTE se veio no payload
  if (data.blocoId !== undefined) {
    const blocoExists = await prisma.blocoRoom.findUnique({
      where: { id: data.blocoId },
    });

    if (!blocoExists) {
      return res.status(400).json({ error: "Bloco inválido" });
    }
  }

  const updatePayload = {
    tipo: data.tipo ?? existingRoom.tipo,
    blocoId: data.blocoId ?? existingRoom.blocoId,
    ambiente: data.ambiente ?? existingRoom.ambiente,
    especialidadeId: data.especialidadeId ?? existingRoom.especialidadeId,
    banheiro: data.banheiro ?? existingRoom.banheiro,
    active: data.active ?? existingRoom.active,
  };

  // 🔴 Caso esteja desativando a sala
  if (existingRoom.active === true && updatePayload.active === false) {
    const conflict = await checkActiveRoomConflicts(idFromParams);

    if (conflict) {
      if (!data.force) {
        return res.status(409).json({
          error: conflict.message,
          conflict: true,
          isRecurring: conflict.isRecurring,
        });
      }

      // ⚙️ Fluxo forçado

      const periods = await prisma.roomPeriod.findMany({
        where: { roomId: idFromParams },
        include: {
          room: { include: { bloco: true } },
          createdBy: true,
          scheduledFor: true,
        },
      });

      if (periods.length > 0) {
        await archiveCanceledPeriods({
          periods,
          canceledBy: { id: (req as any).user.userId },
          reason: "Sala desativada",
        });
      }

      await prisma.room.update({
        where: { id: idFromParams },
        data: updatePayload,
      });

      return res.status(200).json({
        message:
          "Sala desativada com sucesso. Reservas futuras canceladas e arquivadas.",
      });
    }
  }

  const updatedRoom = await prisma.room.update({
    where: { id: idFromParams },
    data: updatePayload,
  });

  return res.status(200).json(updatedRoom);
}

// ✅ Schema e tipos auxiliares
const multiDeleteSchema = z.object({
  ids: z.array(z.number()).min(1, "A lista de IDs não pode ser vazia."),
  force: z.boolean().optional(),
});

interface MultiConflictDetail {
  roomId: number;
  roomNumber: string;
  roomBloco: string;
  message: string;
  isRecurring: boolean;
  periods: ({ userId: number | null } & RoomPeriod)[];
}

// ✅ Exclusão múltipla
export async function deleteRooms(req: Request, res: Response) {
  try {
    const { ids: idArray, force } = multiDeleteSchema.parse(req.body);

    const existingRooms = await prisma.room.findMany({
      where: { id: { in: idArray } },
      include: {
        bloco: true,
      },
    });

    if (existingRooms.length === 0) {
      return res.status(404).json({
        error: "Nenhuma sala válida encontrada para exclusão.",
      });
    }

    const allConflicts: MultiConflictDetail[] = [];

    for (const room of existingRooms) {
      const conflictResult = await checkActiveRoomConflicts(room.id);

      if (conflictResult) {
        allConflicts.push({
          roomId: room.id,
          roomNumber: room.ID_Ambiente,
          roomBloco: room.bloco.nome,
          message: conflictResult.message,
          isRecurring: conflictResult.isRecurring,
          periods: conflictResult.periods as any,
        });
      }
    }

    // ⚠️ EXISTEM CONFLITOS
    // 🚫 Se há conflito e não é force → bloqueia
    if (allConflicts.length > 0 && !force) {
      const conflictRoomNumbers = allConflicts
        .map((c) => `${c.roomNumber} (${c.roomBloco})`)
        .join(", ");

      return res.status(409).json({
        error: `Conflito de agendamento detectado em ${allConflicts.length} sala(s).`,
        detail: `As salas [${conflictRoomNumbers}] possuem reservas ativas. Use 'force: true' para cancelar e excluir.`,
        conflict: true,
        conflictingRooms: allConflicts.map((c) => ({
          id: c.roomId,
          number: c.roomNumber,
          bloco: c.roomBloco,
        })),
      });
    }

    // 🧨 FORCE DELETE

    // 🧨 TRANSACTION ÚNICA
    // 🧨 TRANSACTION ÚNICA
    await prisma.$transaction(async (tx) => {
      for (const room of existingRooms) {
        const periods = await tx.roomPeriod.findMany({
          where: { roomId: room.id },
          include: {
            room: { include: { bloco: true } },
            createdBy: true,
            scheduledFor: true,
          },
        });

        // 🔥 Se for force e existir reservas → arquiva
        if (periods.length > 0) {
          if (!force) {
            throw new Error(`Sala ${room.ID_Ambiente} possui reservas ativas.`);
          }

          await archiveCanceledPeriods({
            periods,
            canceledBy: { id: (req as any).user.userId },
            reason: "Sala excluída",
          });

          await tx.roomPeriod.deleteMany({
            where: { roomId: room.id },
          });
        }
      }

      // 🔥 Sempre limpar MapRoom
      await tx.mapRoom.deleteMany({
        where: { roomId: { in: idArray } },
      });

      // 🔥 Agora pode deletar sala
      await tx.room.deleteMany({
        where: { id: { in: idArray } },
      });
    });

    return res.status(200).json({
      message: "Salas deletadas com sucesso.",
      count: idArray.length,
      forced: !!force,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return res.status(409).json({
        error:
          "Não foi possível excluir uma ou mais salas devido a dependências existentes (FK).",
      });
    }

    console.error("Erro ao deletar salas:", error);

    return res.status(500).json({
      error: "Erro interno do servidor ao deletar salas.",
    });
  }
}

// ✅ Obter agenda de uma sala
export async function getRoomSchedule(req: Request, res: Response) {
  const { userId, hierarquia } = (req as any).user || {};
  const { roomId } = req.params;

  if (!userId) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Usuário não autenticado" },
    });
  }

  const roomIdNumber = Number(roomId);
  if (Number.isNaN(roomIdNumber)) {
    return res.status(400).json({
      error: { code: "INVALID_ROOM_ID", message: "ID da sala inválido." },
    });
  }

  try {
    // 🔎 busca a sala
    const room = await prisma.room.findUnique({
      where: { id: roomIdNumber },
      select: {
        id: true,
        blocoId: true,
      },
    });

    if (!room) {
      return res.status(404).json({
        error: { code: "ROOM_NOT_FOUND", message: "Sala não encontrada." },
      });
    }

    // 🔐 ADMIN → só pode acessar blocos permitidos
    if (hierarquia === "admin") {
      const allowed = await prisma.adminScope.findFirst({
        where: {
          adminId: userId,
          blocoId: room.blocoId,
        },
      });

      if (!allowed) {
        return res.status(403).json({
          error: {
            code: "FORBIDDEN",
            message: "Você não tem acesso a este bloco.",
          },
        });
      }
    }

    // 🔎 busca reservas
    const reservations = await prisma.roomPeriod.findMany({
      where: {
        roomId: roomIdNumber,
      },
      include: {
        room: {
          select: {
            id: true,
            ID_Ambiente: true,
            tipo: true,
            bloco: {
              select: { id: true, nome: true },
            },
          },
        },
        scheduledFor: {
          select: { id: true, login: true, nome: true },
        },
        createdBy: {
          select: { id: true, login: true, nome: true },
        },
      },
      orderBy: { start: "asc" },
    });

    const formatted = reservations.map((r) => {
      const startDT = DateTime.fromJSDate(r.start).setZone("America/Sao_Paulo");
      const endDT = DateTime.fromJSDate(r.end).setZone("America/Sao_Paulo");

      return {
        id: r.id,
        dayOfWeek: r.isRecurring ? r.weekday : undefined,
        startTime: startDT.toFormat("HH:mm"),
        endTime: endDT.toFormat("HH:mm"),
        start: startDT.toISO(),
        end: endDT.toISO(),
        startSchedule: r.startSchedule,
        endSchedule: r.endSchedule,
        countRecurrence: r.countRecurrence,
        atualRecurrenceCount: r.atualRecurrenceCount,
        isRecurring: r.isRecurring,
        approved: r.approved,
        typeSchedule: r.typeSchedule,
        room: r.room,
        createdBy: r.createdBy,
        scheduledFor: r.scheduledFor ?? null,
      };
    });

    return res.status(200).json(formatted);
  } catch (error) {
    console.error(`Erro ao buscar agenda da sala ${roomId}:`, error);
    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Erro interno do servidor." },
    });
  }
}

// ✅ Obter agenda de um bloco em um dia específico
export async function getBlockDayGrade(req: Request, res: Response) {
  const { userId, hierarquia } = (req as any).user || {};
  const { block, date } = req.params;

  if (!userId) {
    return res.status(401).json({ error: "Usuário não autenticado" });
  }

  const blocoId = Number(block);
  if (Number.isNaN(blocoId)) {
    return res.status(400).json({ message: "Bloco inválido." });
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ message: "Data inválida. Use YYYY-MM-DD." });
  }

  try {
    // 🔐 ADMIN → verifica permissão no bloco
    if (hierarquia === "admin") {
      const allowed = await prisma.adminScope.findFirst({
        where: {
          adminId: userId,
          blocoId: blocoId,
        },
      });

      if (!allowed) {
        return res.status(403).json({
          error: "Você não tem acesso a este bloco.",
        });
      }
    }

    const dia = DateTime.fromISO(date, { zone: "America/Sao_Paulo" });

    const startOfDay = dia.startOf("day").toJSDate();
    const endOfDay = dia.endOf("day").toJSDate();

    // =========================
    // SALAS DO BLOCO
    // =========================
    const rooms = await prisma.room.findMany({
      where: { blocoId },
      select: {
        id: true,
        ID_Ambiente: true,
      },
    });

    if (!rooms.length) {
      return res
        .status(404)
        .json({ message: "Nenhuma sala encontrada nesse bloco." });
    }

    const roomIds = rooms.map((r) => r.id);

    // =========================
    // BUSCA CANDIDATA DE RESERVAS
    // =========================
    const reservas = await prisma.roomPeriod.findMany({
      where: {
        roomId: { in: roomIds },

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
            weekday: dia.weekday,
            startSchedule: { lte: endOfDay },
            endSchedule: { gte: startOfDay },
          },
        ],
      },

      include: {
        scheduledFor: {
          select: { id: true, login: true, nome: true },
        },
        createdBy: {
          select: { login: true },
        },
      },

      orderBy: { start: "asc" },
    });

    // =========================
    // FILTRO LÓGICO + PROJEÇÃO
    // =========================
    type Reserva = (typeof reservas)[number];
    const reservasPorSala: Record<number, Reserva[]> = {};

    for (const resv of reservas) {
      const inicio = DateTime.fromJSDate(resv.start).setZone(
        "America/Sao_Paulo",
      );
      const fimOriginal = DateTime.fromJSDate(resv.end).setZone(
        "America/Sao_Paulo",
      );

      const startProjetado = dia
        .set({
          hour: inicio.hour,
          minute: inicio.minute,
          second: 0,
          millisecond: 0,
        })
        .toJSDate();

      const endProjetado = dia
        .set({
          hour: fimOriginal.hour,
          minute: fimOriginal.minute,
          second: 0,
          millisecond: 0,
        })
        .toJSDate();

      const reservaFinal = {
        ...resv,
        start: startProjetado,
        end: endProjetado,
      };

      if (!reservasPorSala[resv.roomId]) {
        reservasPorSala[resv.roomId] = [];
      }

      reservasPorSala[resv.roomId].push(reservaFinal);
    }

    // =========================
    // RESPOSTA FINAL
    // =========================
    const salas = rooms.map((room) => ({
      roomId: room.id,
      sala: room.ID_Ambiente,
      horarios: (reservasPorSala[room.id] ?? []).map((resv) => ({
        id: resv.id,

        startTime: DateTime.fromJSDate(resv.start)
          .setZone("America/Sao_Paulo")
          .toFormat("HH:mm"),

        endTime: DateTime.fromJSDate(resv.end)
          .setZone("America/Sao_Paulo")
          .toFormat("HH:mm"),

        start: resv.start,
        end: resv.end,

        isRecurring: resv.isRecurring,
        approved: resv.approved,

        scheduledFor:
          resv.scheduledFor?.nome ?? resv.scheduledFor?.login ?? null,

        createdBy: resv.createdBy?.login ?? null,
      })),
    }));

    return res.status(200).json({
      blocoId,
      date,
      salas,
    });
  } catch (error) {
    console.error(`Erro ao buscar agenda do bloco ${block}:`, error);

    return res.status(500).json({
      error: "Erro interno ao buscar a agenda.",
    });
  }
}
