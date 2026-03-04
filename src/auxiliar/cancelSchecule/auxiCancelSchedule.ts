import { BlocoRoom, Room, RoomPeriod, User } from "@prisma/client";
import { prisma } from "../../prisma/client";

export type PeriodWithRelations = RoomPeriod & {
  room: Room & {
    bloco: BlocoRoom;
  };
  createdBy: User;
  scheduledFor?: User | null;
};

interface CancelBatchInput {
  periods: PeriodWithRelations[];
  canceledBy: {
    id: number;
  };
  reason: string;
  deleteOriginal?: boolean;
}

export async function archiveCanceledPeriods({
  periods,
  canceledBy,
  reason,
  deleteOriginal = true,
}: CancelBatchInput) {
  if (!periods?.length) return;

  await prisma.$transaction(async (tx) => {
    for (const period of periods) {
      await tx.roomPeriodCanceled.create({
        data: {
          roomIdAmbiente: period.room.ID_Ambiente,
          roomBloco: period.room.bloco.nome,

          createdById: period.createdById,
          scheduledForId: period.scheduledForId,

          canceledById: canceledBy.id,

          start: period.start,
          end: period.end,
          weekday: period.weekday,

          cancelReason: reason,
        },
      });

      if (deleteOriginal) {
        await tx.roomPeriod.delete({
          where: { id: period.id },
        });
      }
    }
  });
}
