import { prisma } from "../prisma/client";
import { PrismaClient } from "@prisma/client";

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
  roomId: number,
): Promise<ConflictResponse | null> {
  const activePeriods = await prisma.roomPeriod.findMany({
    where: {
      roomId,
      end: { gte: new Date() },
    },
    orderBy: { start: "asc" },
    select: {
      id: true,
      start: true,
      end: true,
      isRecurring: true,
      scheduledForId: true,
    },
  });

  if (activePeriods.length === 0) return null;

  const isRecurringConflict = activePeriods.some((p) => p.isRecurring);

  let warningMessage = `A sala possui ${activePeriods.length} reserva(s) ativa(s) a partir de hoje.`;
  if (isRecurringConflict) {
    warningMessage += " Pelo menos uma delas é RECORRENTE.";
  }
  warningMessage +=
    " Confirme a operação para cancelar todas as reservas futuras e prosseguir.";

  return {
    conflict: true,
    message: warningMessage,
    isRecurring: isRecurringConflict,
    periods: activePeriods.map((p) => ({
      id: p.id,
      start: p.start,
      end: p.end,
      scheduledForId: p.scheduledForId,
    })),
  };
}

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
