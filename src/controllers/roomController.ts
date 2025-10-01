// src/controllers/roomController.ts
import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';

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

    // Verifica se corpo está vazio
    if (!data.number || !data.bloco ) return res.status(400).json({ message: 'O número da sala e o bloco são campos obrigatórios.' });
   
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
  try {
    const rooms = await prisma.room.findMany()

    return res.status(200).json({
      data: rooms,
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

// Função auxiliar para calcular o início e o fim da semana atual
function getWeekRange(): { startOfWeek: Date, endOfWeek: Date } {
    const now = new Date();
    // Ajusta para o fuso horário local para evitar problemas de meia-noite
    now.setHours(0, 0, 0, 0); 

    // Calcula o dia da semana (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
    const dayOfWeek = now.getDay(); 

    // O início da semana (Segunda-feira)
    // Se hoje é Domingo (0), precisa voltar 6 dias para a Segunda anterior.
    // Senão, volta (dayOfWeek - 1) dias.
    const startOfWeek = new Date(now);
    const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; 
    startOfWeek.setDate(now.getDate() - daysToSubtract);
    
    // O fim da semana (Sábado à meia-noite)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    // Configura o horário para o final do dia de Sábado (23:59:59.999)
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
                start: {
                    gte: startOfWeek, // Greater than or equal (>= Início da Semana)
                },
                end: {
                    lte: endOfWeek,   // Less than or equal (<= Fim da Semana)
                },
            },
            // Você pode incluir informações adicionais da reserva, se necessário (ex: responsável)
            select: {
                id: true,
                start: true,
                end: true,
                // Outros campos relevantes
            },
            orderBy: {
                start: 'asc',
            }
        });

        // 2. Formata a resposta para o front-end
        const formattedSchedule = reservations.map(res => {
            
            // CONVERSÃO NECESSÁRIA: Crie um novo objeto Date a partir da string
            const startTimeDate = new Date(res.start);
            const endTimeDate = new Date(res.end);

            // Calcula o dia da semana: 0=Dom, 1=Seg...
            // Ajustamos para 1=Seg, 7=Dom para facilitar a visualização no front
            const jsDay = startTimeDate.getDay();
            const dayOfWeek = jsDay === 0 ? 7 : jsDay; 

            return ({
                id: res.id,
                dayOfWeek: dayOfWeek,
                
                // Agora, chame os métodos toLocaleTimeString na nova variável Date
                startTime: startTimeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                endTime: endTimeDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            });
        });

        return res.status(200).json(formattedSchedule);

    } catch (error) {
        console.error(`Erro ao buscar agenda da sala ${roomId}:`, error);
        return res.status(500).json({ error: 'Erro interno do servidor ao buscar a agenda.' });
    }
}