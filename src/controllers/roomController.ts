// src/controllers/roomController.ts
import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';
import { debugLog } from '../auxiliar/debugLog';
import { Prisma, RoomPeriod } from '@prisma/client';
import { cancelAndArchivePeriods, checkActiveRoomConflicts, TransactionClient } from '../auxiliar/roomAuxi';

export async function createRoom(req: Request, res: Response) {
  const schema = z.object({
    number: z.string(),
    tipo: z.string(),
    ala: z.string(),
  });
  debugLog("Created funtion")
  try {
    const data = schema.parse(req.body);

    // Verifica se corpo está vazio
    if (!data.number || !data.ala ) return res.status(400).json({ message: 'O número da sala e a ala são campos obrigatórios.' });
   
    // Verifica se já existe sala com mesmo número e mesma ala
    const exists = await prisma.room.findFirst({
      where: {
        number: data.number,
        ala: data.ala,
      },
    });

    if (exists) {
      return res.status(409).json({ error: 'Já existe uma sala com esse número nessa ala.' });
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
  // Ajuste o schema para pegar o ID do params e não do body
  const schema = z.object({
    tipo: z.string().optional(),
    active: z.boolean().optional(),
    force: z.boolean().optional(),
    // Removido 'id' do body, pegamos do params
  });
  
  const idFromParams = parseInt(req.params.id as string);

  debugLog('Tentativa de edição da sala ID:', idFromParams, 'com dados:', req.body);
  
  try {
    // Validamos apenas o corpo, e usamos idFromParams para o resto
    const data = schema.parse(req.body);

    // 1. Verifica se a sala existe
    const existingRoom = await prisma.room.findUnique({
      where: { id: idFromParams },
    });

    if (!existingRoom) {
      return res.status(404).json({ error: 'Sala não encontrada.' });
    }
    
    // 2. Filtra apenas os dados que serão realmente atualizados
    const updatePayload = {
      tipo: data.tipo ?? existingRoom.tipo,
      // Incluído 'ala' para permitir atualização do campo
      ala: (req.body as any).ala ?? existingRoom.ala, 
      active: data.active ?? existingRoom.active,
    };

    // 3. Lógica de Conflito (SÓ se estiver desativando a sala)
    if(updatePayload.active === false && existingRoom.active === true) {
      // ⚠️ CHAMADA GENÉRICA DE VERIFICAÇÃO ⚠️
      const conflict = await checkActiveRoomConflicts(idFromParams);

      if (conflict) {
        // 🚨 FLUXO 1: CONFLITO
        if (!data.force) {
          debugLog('Conflito detectado. Enviando 409 Conflict.');
          // Retorna a mensagem de aviso gerada pela função de utilidade
          return res.status(409).json({ 
            error: conflict.message, 
            conflict: true, 
            isRecurring: conflict.isRecurring 
          });
        }

        // 🚨 FLUXO 2: FORÇADO - Transação para Cancelar e Atualizar
        await prisma.$transaction(async (tx) => {
          debugLog(`Forcing update. Canceling ${conflict.periods.length} periods and archiving...`);
          // Usamos 'tx' (TransactionClient), os períodos em conflito e a sala existente
          await cancelAndArchivePeriods("Sala desativada",tx, conflict.periods as any, existingRoom); 

          // Atualizar a sala
          return tx.room.update({
            where: { id: idFromParams },
            data: updatePayload,
          });
        });
        
        return res.status(200).json({ 
          message: 'Sala desativada com sucesso. Todas as reservas futuras foram canceladas e arquivadas.'
        });
      }
    }

    // 4. Fluxo Padrão (Sem Conflito ou Sem Desativação)
    const updatedRoom = await prisma.room.update({
      where: { id: idFromParams },
      data: updatePayload,
    });
    
    debugLog('Atualização de sala padrão bem-sucedida.');
    return res.status(200).json(updatedRoom);

  } catch (error) {
    // ... Tratamento de erros
    if (error instanceof z.ZodError) {
      debugLog('Zod Validation Error:', error.errors);
      return res.status(400).json({ errors: error.errors });
    }

    console.error("Erro interno ao editar sala:", error);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

const deleteSchema = z.object({
  force: z.boolean().optional(),
});

// Define o esquema de entrada para o delete de múltiplas salas
const multiDeleteSchema = z.object({
  ids: z.array(z.number()).min(1, 'A lista de IDs não pode ser vazia.'),
  force: z.boolean().optional(),
});

// Define o tipo para agrupar os conflitos
interface MultiConflictDetail {
  roomId: number;
  roomNumber: string;
  roomAla: string;
  message: string;
  isRecurring: boolean;
  periods: ({ userId: number | null } & RoomPeriod)[]; // Lista de períodos
}


export async function deleteRooms(req: Request, res: Response) {
  debugLog('Tentativa de exclusão de múltiplas salas com dados:', req.body);
  
  try {
    const { ids: idArray, force } = multiDeleteSchema.parse(req.body);

    // 1. Buscar todas as salas para as quais o ID foi enviado
    const existingRooms = await prisma.room.findMany({
      where: { id: { in: idArray } },
    });

    if (existingRooms.length === 0) {
      return res.status(404).json({ error: 'Nenhuma sala válida encontrada para exclusão.' });
    }

    // 2. 🚨 VERIFICAÇÃO DE CONFLITO EM LOTE 🚨
    const allConflicts: MultiConflictDetail[] = [];

    // Faz a checagem de conflito individualmente para cada sala
    for (const room of existingRooms) {
      const conflictResult = await checkActiveRoomConflicts(room.id);
      
      if (conflictResult) {
        // Se houver conflito, adiciona ao array de conflitos
        allConflicts.push({
          roomId: room.id,
          roomNumber: room.number,
          roomAla: room.ala,
          message: conflictResult.message,
          isRecurring: conflictResult.isRecurring,
          periods: conflictResult.periods as any, // Adicionamos os períodos para a transação
        });
      }
    }

    // 3. 🚨 FLUXO DE CONFLITO (Se alguma sala tiver agendamento)
    if (allConflicts.length > 0) {
      if (!force) {
        // Retorna 409 com a lista de salas que têm conflito
        const conflictRoomNumbers = allConflicts.map(c => `${c.roomNumber} (${c.roomAla})`).join(', ');
        
        return res.status(409).json({
          error: `Conflito de agendamento detectado em ${allConflicts.length} sala(s).`,
          detail: `As salas [${conflictRoomNumbers}] possuem reservas ativas. Use 'force: true' para cancelar e excluir.`,
          conflict: true,
          conflictingRooms: allConflicts.map(c => ({ id: c.roomId, number: c.roomNumber }))
        });
      }

      // 4. 🚨 FLUXO FORÇADO: Executa a exclusão na transação
      await prisma.$transaction(async (tx: TransactionClient) => {
        
        const idsToProcess = idArray;
        
        for (const roomId of idsToProcess) {
            // A. Tenta deletar a sala
            const roomToDelete = existingRooms.find(r => r.id === roomId);
            if (!roomToDelete) continue;

            const conflictDetail = allConflicts.find(c => c.roomId === roomId);

            // B. Se houver conflito, cancela os períodos antes de deletar a sala
            if (conflictDetail) {
                debugLog(`Forcing delete on Room ${roomId}: Canceling ${conflictDetail.periods.length} periods.`);
                await cancelAndArchivePeriods("Sala excluída", tx, conflictDetail.periods, roomToDelete);
            }
            
            // C. Deleta a sala
            await tx.room.delete({ where: { id: roomId } });
        }
      });
      
      return res.status(200).json({
        message: `Salas deletadas com sucesso. ${allConflicts.length} reserva(s) futura(s) foram canceladas e arquivadas.`,
        count: idArray.length,
      });
    }

    // 5. 🟢 FLUXO SEM CONFLITO: Deleta tudo de uma vez
    const deleted = await prisma.room.deleteMany({
      where: { id: { in: idArray } },
    });

    return res.status(200).json({
      message: 'Salas deletadas com sucesso.',
      count: deleted.count,
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      debugLog('Zod Validation Error:', error.errors);
      return res.status(400).json({ errors: error.errors });
    }
    console.error("Erro ao deletar salas:", error);
    // Trata erros de FK (P2003) se alguma sala sem conflito tiver outros registros dependentes
    return res.status(500).json({ error: 'Erro interno do servidor ao deletar salas.' });
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