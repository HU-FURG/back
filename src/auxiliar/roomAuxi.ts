import { prisma } from '../prisma/client';
import { PrismaClient, Room, RoomPeriod } from '@prisma/client';
import { Prisma } from '@prisma/client';

// Define o formato da resposta de conflito
interface ConflictResponse {
  conflict: true;
  message: string;
  isRecurring: boolean;
  periods: {
    id: number;
    start: Date;
    end: Date;
    scheduledForId: number | null;
  }[];
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
      start: true,
      end: true,
      isRecurring: true,
      scheduledForId: true,
    },
  });

  if (activePeriods.length === 0) return null;

  const isRecurringConflict = activePeriods.some(p => p.isRecurring);

  let warningMessage = `A sala possui ${activePeriods.length} reserva(s) ativa(s) a partir de hoje.`;
  if (isRecurringConflict) {
    warningMessage += ' Pelo menos uma delas é RECORRENTE.';
  }
  warningMessage += ' Confirme a operação para cancelar todas as reservas futuras e prosseguir.';

  return {
    conflict: true,
    message: warningMessage,
    isRecurring: isRecurringConflict,
    periods: activePeriods.map(p => ({
      id: p.id,
      start: p.start,
      end: p.end,
      scheduledForId: p.scheduledForId,
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

type RoomForArchive = {
  ID_Ambiente: string;
  bloco: {
    nome: string;
  };
};

export async function cancelAndArchivePeriods(
  reason: string,
  tx: TransactionClient,
  activePeriods: RoomPeriod[],
  existingRoom: RoomForArchive
): Promise<void> {
  for (const period of activePeriods) {
    const durationInMinutes = Math.round(
      (period.end.getTime() - period.start.getTime()) / (1000 * 60)
    );

    await tx.roomScheduleTemplate.create({
      data: {
        userId: period.scheduledForId ?? undefined,
        nome: `Reserva cancelada (${existingRoom.ID_Ambiente})`,
        durationInMinutes,
        roomIdAmbiente: existingRoom.ID_Ambiente,
        roomBloco: existingRoom.bloco.nome,
        originalStart: period.start,
        originalEnd: period.end,
        reason: reason ?? 'CANCELADO_ADMIN',
      },
    });

    await tx.roomPeriod.delete({
      where: { id: period.id },
    });
  }
}
