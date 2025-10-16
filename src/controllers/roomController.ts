// src/controllers/roomController.ts
import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import { debugLog } from '../auxiliar/debugLog';
import { Prisma, RoomPeriod } from '@prisma/client';
import { cancelAndArchivePeriods, checkActiveRoomConflicts, TransactionClient } from '../auxiliar/roomAuxi';

// ✅ Criação de sala
export async function createRoom(req: Request, res: Response) {
  const schema = z.object({
    number: z.string(),
    tipo: z.string(),
    banheiro: z.boolean(),
    ala: z.string(),
    ambiente: z.string(),
    especialidade: z.string(),
    area: z.number(),
  });

  debugLog("createRoom - dados recebidos", req.body);

  try {
    const data = schema.parse(req.body);

    // Verifica se já existe sala com mesmo ID_Ambiente
    const exists = await prisma.room.findFirst({
      where: { ID_Ambiente: data.number },
    });

    if (exists) {
      return res.status(409).json({ error: 'Já existe uma sala com esse ID_Ambiente.' });
    }

    const room = await prisma.room.create({
      data: {
        ID_Ambiente: data.number,
        tipo: data.tipo,
        banheiro: data.banheiro,
        bloco: data.ala,
        ambiente: data.ambiente,
        especialidade: data.especialidade,
        area: data.area,
      },
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

// ✅ Listar salas
export async function listRooms(req: Request, res: Response) {
  try {
    const rooms = await prisma.room.findMany();
    return res.status(200).json({ data: rooms });
  } catch (error) {
    console.error("Erro ao listar salas:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

// ✅ Editar sala
export async function editRoom(req: Request, res: Response) {
  const schema = z.object({
    especialidade: z.string().optional(),
    ala: z.string().optional(),
    ambiente: z.string().optional(),
    banheiro: z.boolean().optional(),
    tipo: z.string().optional(),
    active: z.boolean().optional(),
    force: z.boolean().optional(),
  });

  const idFromParams = parseInt(req.params.id as string);
  debugLog('Tentativa de edição da sala ID:', idFromParams, 'com dados:', req.body);

  try {
    const data = schema.parse(req.body);
    const existingRoom = await prisma.room.findUnique({ where: { id: idFromParams } });

    if (!existingRoom) {
      return res.status(404).json({ error: 'Sala não encontrada.' });
    }

    const updatePayload = {
      tipo: data.tipo ?? existingRoom.tipo,
      bloco: data.ala ?? existingRoom.bloco, // "ala" do schema -> "bloco" no banco
      ambiente: data.ambiente ?? existingRoom.ambiente,
      especialidade: data.especialidade ?? existingRoom.especialidade,
      banheiro: data.banheiro ?? existingRoom.banheiro,
      active: data.active ?? existingRoom.active,
    };

    // 🔴 Caso esteja desativando, verificar conflitos
    if (updatePayload.active === false && existingRoom.active === true) {
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
        await prisma.$transaction(async (tx) => {
          await cancelAndArchivePeriods("Sala desativada", tx, conflict.periods as any, existingRoom);
          return tx.room.update({
            where: { id: idFromParams },
            data: updatePayload,
          });
        });

        return res.status(200).json({
          message: 'Sala desativada com sucesso. Reservas futuras canceladas e arquivadas.',
        });
      }
    }

    const updatedRoom = await prisma.room.update({
      where: { id: idFromParams },
      data: updatePayload,
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

// ✅ Schema e tipos auxiliares
const multiDeleteSchema = z.object({
  ids: z.array(z.number()).min(1, 'A lista de IDs não pode ser vazia.'),
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
  debugLog('Tentativa de exclusão de múltiplas salas com dados:', req.body);

  try {
    const { ids: idArray, force } = multiDeleteSchema.parse(req.body);
    const existingRooms = await prisma.room.findMany({
      where: { id: { in: idArray } },
    });

    if (existingRooms.length === 0) {
      return res.status(404).json({ error: 'Nenhuma sala válida encontrada para exclusão.' });
    }

    const allConflicts: MultiConflictDetail[] = [];

    for (const room of existingRooms) {
      const conflictResult = await checkActiveRoomConflicts(room.id);

      if (conflictResult) {
        allConflicts.push({
          roomId: room.id,
          roomNumber: room.ID_Ambiente,
          roomBloco: room.bloco,
          message: conflictResult.message,
          isRecurring: conflictResult.isRecurring,
          periods: conflictResult.periods as any,
        });
      }
    }

    if (allConflicts.length > 0) {
      if (!force) {
        const conflictRoomNumbers = allConflicts.map(c => `${c.roomNumber} (${c.roomBloco})`).join(', ');

        return res.status(409).json({
          error: `Conflito de agendamento detectado em ${allConflicts.length} sala(s).`,
          detail: `As salas [${conflictRoomNumbers}] possuem reservas ativas. Use 'force: true' para cancelar e excluir.`,
          conflict: true,
          conflictingRooms: allConflicts.map(c => ({
            id: c.roomId,
            number: c.roomNumber,
            bloco: c.roomBloco,
          })),
        });
      }

      await prisma.$transaction(async (tx: TransactionClient) => {
        for (const room of existingRooms) {
          const conflictDetail = allConflicts.find(c => c.roomId === room.id);
          if (conflictDetail) {
            await cancelAndArchivePeriods('Sala excluída', tx, conflictDetail.periods, room);
          }
          await tx.room.delete({ where: { id: room.id } });
        }
      });

      return res.status(200).json({
        message: `Salas deletadas com sucesso. ${allConflicts.length} reserva(s) futura(s) foram canceladas e arquivadas.`,
        count: idArray.length,
      });
    }

    const deleted = await prisma.room.deleteMany({
      where: { id: { in: idArray } },
    });

    return res.status(200).json({
      message: 'Salas deletadas com sucesso.',
      count: deleted.count,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return res.status(409).json({
        error: 'Não foi possível excluir uma ou mais salas devido a dependências existentes (FK).',
      });
    }
    console.error('Erro ao deletar salas:', error);
    return res.status(500).json({ error: 'Erro interno do servidor ao deletar salas.' });
  }
}

function getWeekRange(): { startOfWeek: Date; endOfWeek: Date } {
    const now = new Date();
    // Ajusta para o fuso horário local para evitar problemas de meia-noite
    now.setHours(0, 0, 0, 0);

    // Calcula o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const dayOfWeek = now.getDay();

    // Calcula início da semana (Segunda-feira)
    const startOfWeek = new Date(now);
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Se domingo, volta 6 dias
    startOfWeek.setDate(now.getDate() - daysToSubtract);

    // Calcula fim da semana (Sábado à meia-noite)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return { startOfWeek, endOfWeek };
}

export async function getRoomSchedule(req: Request, res: Response) {
    const { roomId } = req.params;

    if (!roomId || isNaN(Number(roomId))) {
        return res.status(400).json({ message: 'ID da sala inválido.' });
    }

    try {
        const roomIdNumber = Number(roomId);
        const { startOfWeek, endOfWeek } = getWeekRange();

        const reservations = await prisma.roomPeriod.findMany({
            where: {
                roomId: roomIdNumber,
                start: { gte: startOfWeek },
                end: { lte: endOfWeek },
            },
            select: {
                id: true,
                start: true,
                end: true,
            },
            orderBy: { start: 'asc' },
        });

        const formattedSchedule = reservations.map(r => {
            const startTimeDate = new Date(r.start);
            const endTimeDate = new Date(r.end);

            const jsDay = startTimeDate.getDay();
            const dayOfWeek = jsDay === 0 ? 7 : jsDay; // 1=Seg, 7=Dom

            return {
                id: r.id,
                dayOfWeek,
                startTime: startTimeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                endTime: endTimeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            };
        });

        return res.status(200).json(formattedSchedule);

    } catch (error) {
        console.error(`Erro ao buscar agenda da sala ${roomId}:`, error);
        return res.status(500).json({ error: 'Erro interno do servidor ao buscar a agenda.' });
    }
}

