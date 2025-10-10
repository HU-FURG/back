import { prisma } from '../prisma/client';
import { PrismaClient, Room, RoomPeriod } from '@prisma/client';
import { Prisma } from '@prisma/client';

// Define o formato da resposta de conflito
interface ConflictResponse {
  conflict: true;
  message: string;
  isRecurring: boolean;
  periods: { id: number; nome: string; start: Date; end: Date }[];
}

/**
 * Verifica se a sala possui reservas ativas (não vencidas) e retorna um objeto de conflito.
 * Se não houver conflito, retorna 'null'.
 */
export async function checkActiveRoomConflicts(
  roomId: number
): Promise<ConflictResponse | null> {
  const activePeriods = await prisma.roomPeriod.findMany({
    where: {
      roomId,
      end: { gte: new Date() },
    },
    orderBy: { start: 'asc' },
    select: {
      id: true,
      nome: true,
      start: true,
      end: true,
      isRecurring: true,
      userId: true,
    },
  });

  if (activePeriods.length === 0) return null;

  const isRecurringConflict = activePeriods.some(p => p.isRecurring);

  let warningMessage = `A sala possui ${activePeriods.length} reserva(s) ativa(s) a partir de hoje.`;
  if (isRecurringConflict) warningMessage += ' Pelo menos uma delas é RECORRENTE.';
  warningMessage += ' Confirme a operação para cancelar todas as reservas futuras e prosseguir.';

  return {
    conflict: true,
    message: warningMessage,
    isRecurring: isRecurringConflict,
    periods: activePeriods.map(p => ({
      id: p.id,
      nome: p.nome,
      start: p.start,
      end: p.end,
    })),
  };
}

export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Cancela e arquiva uma lista de períodos de reserva dentro de uma transação.
 */
export async function cancelAndArchivePeriods(
  reason: string,
  tx: TransactionClient,
  activePeriods: ({ userId: number | null } & RoomPeriod)[],
  existingRoom: Pick<Room, 'ID_Ambiente' | 'bloco'>
): Promise<void> {
  for (const period of activePeriods) {
    const durationInMinutes = Math.round(
      (period.end.getTime() - period.start.getTime()) / (1000 * 60)
    );

    await tx.roomScheduleTemplate.create({
      data: {
        userId: period.userId ?? undefined,
        nome: period.nome,
        durationInMinutes,
        roomIdAmbiente: existingRoom.ID_Ambiente,
        roomBloco: existingRoom.bloco,
        originalStart: period.start,
        originalEnd: period.end,
        reason: reason ?? 'CANCELADO_ADMIN',
        archivedAt: new Date(),
      },
    });

    await tx.roomPeriod.delete({ where: { id: period.id } });
  }
}
