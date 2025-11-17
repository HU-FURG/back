import { Request, Response } from 'express'
import { prisma } from '../prisma/client'
import { z } from 'zod'

// Validação dos horários enviados
const HorarioSchema = z.object({
  data: z.string(),        // "2025-08-06"
  horaInicio: z.string(),  // "02:00"
  horaFim: z.string(),     // "16:00"
})

const BodySchema = z.object({
  horarios: z.array(HorarioSchema),
  recorrente: z.boolean()
})

export const AgendamentoSchema = z.object({
  salaId: z.number(),
  responsavel: z.string(),
  horarios: z.array(
    z.object({
      data: z.string(),
      horaInicio: z.string(),
      horaFim: z.string(),
    })
  ),
  recorrente: z.boolean(),
  userId: z.number().optional(), 
  maxScheduleDate: z.string().optional(), // "2025-12-31"
});

type BuscarSalasBody = z.infer<typeof BodySchema>
type AgendarSalaBody = z.infer<typeof AgendamentoSchema>

export const buscarSalasDisponiveis = async (req: Request, res: Response) => { 
  try {
    const { horarios, recorrente } = BodySchema.parse(req.body);

    const salasAtivas = await prisma.room.findMany({
      where: { active: true },
      include: { periods: true },
    });

    const salasDisponiveis = salasAtivas.filter((sala) => {
      return horarios.every((horario) => {
        const inicioReq = new Date(`${horario.data}T${horario.horaInicio}:00`);
        const fimReq = new Date(`${horario.data}T${horario.horaFim}:00`);
        const diaDaSemanaReq = inicioReq.getDay();

        const temConflito = sala.periods.some((period) => {
          const start = new Date(period.start);
          const end = new Date(period.end);
          const diaDaSemanaPeriodo = start.getDay();

          if (recorrente) {
            if (period.isRecurring) {
              // Mesmo dia da semana e sobreposição de horário
              const mesmoDiaSemana = diaDaSemanaReq === diaDaSemanaPeriodo;

              if (!mesmoDiaSemana) return false;

              // Verifica sobreposição de horas (comparando somente hora/minuto)
              const conflitoHorario =
                !(
                  fimReq.getHours() < start.getHours() ||
                  (fimReq.getHours() === start.getHours() &&
                    fimReq.getMinutes() <= start.getMinutes()) ||
                  inicioReq.getHours() > end.getHours() ||
                  (inicioReq.getHours() === end.getHours() &&
                    inicioReq.getMinutes() >= end.getMinutes())
                );

              return conflitoHorario;
            } else {
              // Comparar com reservas pontuais (no futuro)
              const isFuture = start >= new Date(); // reserva futura
              if (!isFuture) return false;

              // Mesmo dia da semana?
              const mesmoDiaSemana = diaDaSemanaReq === diaDaSemanaPeriodo;
              if (!mesmoDiaSemana) return false;

              // Verifica sobreposição de horas
              const conflitoHorario =
                !(
                  fimReq <= start ||
                  inicioReq >= end
                );

              return conflitoHorario;
            }
          }

          // --------------------------------------------
          // CASO 2: Reserva da requisição é PONTUAL
          // --------------------------------------------
          else {
            if (period.isRecurring) {
              // Se o recorrente ainda não começou, ignora
              if (inicioReq < start) return false;

              // Mesmo dia da semana?
              if (diaDaSemanaReq !== diaDaSemanaPeriodo) return false;

              // Verifica sobreposição de horários
              const startRecorrenteNaDataReq = new Date(inicioReq);
              startRecorrenteNaDataReq.setHours(start.getHours(), start.getMinutes(), 0, 0);

              const endRecorrenteNaDataReq = new Date(inicioReq);
              endRecorrenteNaDataReq.setHours(end.getHours(), end.getMinutes(), 0, 0);

              const conflitoHorario =
                !(
                  fimReq <= startRecorrenteNaDataReq ||
                  inicioReq >= endRecorrenteNaDataReq
                );

              return conflitoHorario;
            }
          }
        });

        return !temConflito;
      });
    });

    return res.status(200).json(
      salasDisponiveis.map((sala) => ({
        id: sala.id,
        nome: sala.ID_Ambiente,
        tipo: sala.tipo ?? "",
        ala: sala.bloco,
        status: sala.active ? "active" : "inactive",
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: "Erro ao buscar salas disponíveis." });
  }
};

// ----------------------
// AGENDAR SALA
// ----------------------
export const agendarSala = async (req: Request, res: Response) => { //testar por admin e user; sem conflito e com conflito;  com limite de data; recorrente e n recorrete
  try {
    const user = (req as any).user; // vem do token
    const body = AgendamentoSchema.parse(req.body);

    const { salaId, responsavel, horarios, recorrente, maxScheduleDate, userId } = body;

    // Confirma quem é o usuário real
    const usuarioLogado = await prisma.user.findUnique({ where: { login: user.login } });
    if (!usuarioLogado) return res.status(401).json({ message: "Usuário não autenticado." });

    // --- Verificação de conflito de última hora (na sala escolhida) ---
    for (const { data, horaInicio, horaFim } of horarios) {
      const inicio = new Date(`${data}T${horaInicio}:00`);
      const fim = new Date(`${data}T${horaFim}:00`);

      const conflito = await prisma.roomPeriod.findFirst({
        where: {
          roomId: salaId,
          OR: [
            {
              start: { lt: fim },
              end: { gt: inicio },
            },
          ],
        },
      });

      if (conflito) {
        return res.status(400).json({
          message: "Horário indisponível. Buscar novamente",
        });
      }
    }

    const autoApproveConfig = await prisma.systemLog.findUnique({
      where: { key: "AUTO_APPROVE" }
    });

    const autoApprove =
      autoApproveConfig?.value === "true";

    // --- Define o usuário dono da reserva ---
    const donoReserva = usuarioLogado.hierarquia === "admin"
      ? userId // admin agenda pra outro user
      : usuarioLogado.id; // user agenda pra ele mesmo

    const approved =
      usuarioLogado.hierarquia === "admin"
        ? true : autoApprove;           

    // --- Cria registros ---
    const registros = horarios.map(({ data, horaInicio, horaFim }) => ({
      roomId: salaId,
      userId: donoReserva,
      nome: responsavel,
      start: new Date(`${data}T${horaInicio}:00`),
      end: new Date(`${data}T${horaFim}:00`),
      isRecurring: recorrente,
      maxScheduleTime: recorrente && maxScheduleDate
        ? new Date(`${maxScheduleDate}T23:59:59`)
        : null,
      approved: approved,
      createdAt: new Date(),
    }));

    await prisma.roomPeriod.createMany({ data: registros });

    return res.status(201).json({ message: "Agendamento criado com sucesso." });

  } catch (error) {
    console.error("Erro ao agendar sala:", error);
    return res.status(400).json({ message: "Erro ao agendar sala." });
  }
};


// ===============================
//  Listar minhas reservas
// ===============================
export async function listarMinhasReservas(req: Request, res: Response) { // testar
  try {
    const userId = (req as any).user?.userId;

    console.log("User ID para listar reservas:", userId);
    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const reservas = await prisma.roomPeriod.findMany({
      where: { userId },
      include: {
        room: { select: { ID_Ambiente: true, bloco: true } },
      },
      orderBy: { start: "desc" },
    });

    res.json({ success: true, reservas });
  } catch (err) {
    console.error("Erro ao listar reservas:", err);
    res.status(500).json({ error: "Erro interno ao listar reservas" });
  }
}

// ===============================
//  Cancelar reserva
// ===============================
export async function cancelarReserva(req: Request, res: Response) { // testar
  try {
    const user = (req as any).user;
    const userId = (req as any).user?.userId;
    const reservaId = parseInt(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: { hierarquia: true },
    });

    if (!userData) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const reserva = await prisma.roomPeriod.findUnique({
      where: { id: reservaId },
    });

    if (!reserva) {
      return res.status(404).json({ error: "Reserva não encontrada" });
    }

    //  Se não for admin, só pode cancelar a própria reserva
    if (userData.hierarquia !== "admin" && reserva.userId !== userId) {
      return res.status(403).json({ error: "Você não pode cancelar esta reserva" });
    }

    //  Verifica se a reserva já começou
    const agora = new Date();
    if (userData.hierarquia !== "admin" && reserva.start <= agora) {
      return res.status(400).json({ error: "Não é possível cancelar uma reserva já iniciada" });
    }

    await prisma.roomPeriod.delete({ where: { id: reservaId } });

    res.json({ success: true, message: "Reserva cancelada com sucesso" });
  } catch (err) {
    console.error("Erro ao cancelar reserva:", err);
    res.status(500).json({ error: "Erro interno ao cancelar reserva" });
  }
}