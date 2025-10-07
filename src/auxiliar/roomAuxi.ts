import { prisma } from '../prisma/client';
import { PrismaClient, Room, RoomPeriod } from '@prisma/client';
import { Prisma } from '@prisma/client';

// Define o formato da resposta de conflito
interface ConflictResponse {
  conflict: true;
  message: string;
  isRecurring: boolean;
  periods: { id: number, nome: string, start: Date, end: Date }[];
}

/**
 * Verifica se a sala possui reservas ativas (não vencidas) e retorna um objeto de conflito.
 * Se não houver conflito, retorna 'null'.
 * * @param roomId O ID da sala a ser verificada.
 * @returns Promise<ConflictResponse | null>
 */
export async function checkActiveRoomConflicts(roomId: number): Promise<ConflictResponse | null> {
  // 1. Busca por reservas ativas cuja data de TÉRMINO (end) é hoje ou no futuro.
  const activePeriods = await prisma.roomPeriod.findMany({
    where: {
      roomId: roomId,
      end: {
        gte: new Date(), 
      },
    },
    orderBy: { start: 'asc' },
    select: {
      id: true,
      nome: true,
      start: true,
      end: true,
      isRecurring: true,
    },
  });

  if (activePeriods.length === 0) {
    return null; // Nenhuma reserva ativa ou futura. Sem conflito.
  }

  // 2. Conflito detectado. Monta os dados de retorno.
  const isRecurringConflict = activePeriods.some(p => p.isRecurring);

  let warningMessage = `A sala possui ${activePeriods.length} reserva(s) ativa(s) a partir de hoje.`;
  if (isRecurringConflict) {
    warningMessage += ' Pelo menos uma delas é RECORRENTE.';
  }
  warningMessage += ' Confirme a operação para cancelar todas as reservas futuras e prosseguir.';

  // Retorna os dados do conflito
  return {
    conflict: true,
    message: warningMessage,
    isRecurring: isRecurringConflict,
    // Retorna apenas os campos necessários, excluindo isRecurring do tipo
    periods: activePeriods.map((p: { id: any; nome: any; start: any; end: any; }) => ({
        id: p.id,
        nome: p.nome,
        start: p.start,
        end: p.end,
    }))
  };
}


export type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Cancela e arquiva uma lista de períodos de reserva.
 * Deve ser chamado DENTRO de um prisma.$transaction.
 * * @param tx O objeto de transação do Prisma.
 * @param activePeriods A lista de RoomPeriods ativos a serem cancelados.
 * @param existingRoom A sala para pegar o number e a ala para o histórico.
 */
export async function cancelAndArchivePeriods(
  reason: string,
  tx: TransactionClient,
  activePeriods: ({ userId: number | null } & RoomPeriod)[], // Incluído userId para o histórico
  existingRoom: Pick<Room, 'number' | 'ala'> // Pega apenas os campos necessários de Room
): Promise<void> {
  
  for (const period of activePeriods) {
    const startMs = period.start.getTime();
    const endMs = period.end.getTime();
    const durationMs = endMs - startMs;
    const durationInMinutes = Math.round(durationMs / (1000 * 60));
    await tx.roomScheduleTemplate.create({
      data: {
        userId: period.userId,        
        // Detalhes do Agendamento
        nome: period.nome,
        durationInMinutes: durationInMinutes,
        // Detalhes da Sala
        roomNumber: existingRoom.number,
        roomAla: existingRoom.ala,
        // Detalhes da Ação
        originalStart: period.start,
        originalEnd: period.end,
        reason: reason ?? 'CANCELADO_ADMIN', // Motivo fixo para desativação da sala
        archivedAt: new Date(),
      }
    });

    // 2. Excluir o período ativo
    await tx.roomPeriod.delete({
      where: { id: period.id },
    });
  }
}