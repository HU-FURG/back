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

const AgendamentoSchema = z.object({
  salaId: z.number(),
  responsavel: z.string().min(1),
  horarios: z.array(
    z.object({
      data: z.string(),       // "YYYY-MM-DD"
      horaInicio: z.string(), // "HH:mm"
      horaFim: z.string()     // "HH:mm"
    })
  ),
  recorrente: z.boolean()
})

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

          // --------------------------------------------
          // CASO 1: Reserva da requisição é RECORRENTE
          // --------------------------------------------
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
export const agendarSala = async (req: Request, res: Response) => {
  try {
    const { salaId, responsavel, horarios, recorrente } = AgendamentoSchema.parse(req.body)

    const registros = horarios.map(({ data, horaInicio, horaFim }) => ({
      roomId: salaId,
      start: new Date(`${data}T${horaInicio}:00`),
      end: new Date(`${data}T${horaFim}:00`),
      nome: responsavel,
      isRecurring: recorrente,
      createdAt: new Date()
    }))

    await prisma.roomPeriod.createMany({ data: registros })

    return res.status(201).json({ message: 'Agendamento criado com sucesso.' })
  } catch (error) {
    console.error('Erro ao agendar sala:', error)
    return res.status(400).json({ message: 'Erro ao agendar sala.' })
  }
}
