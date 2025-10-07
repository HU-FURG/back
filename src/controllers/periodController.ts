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
  horarios: z.array(HorarioSchema)
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
  isRecurring: z.boolean()
})

type BuscarSalasBody = z.infer<typeof BodySchema>
type AgendarSalaBody = z.infer<typeof AgendamentoSchema>

export const buscarSalasDisponiveis = async (req: Request, res: Response) => {
  try {
    const { horarios } = BodySchema.parse(req.body);

    // Obter todas as salas ativas com seus agendamentos
    const salasAtivas = await prisma.room.findMany({
      where: { active: true },
      include: { periods: true },
    });

    const salasDisponiveis = salasAtivas.filter(sala => {
      return horarios.every(horario => {
        const inicioReq = new Date(`${horario.data}T${horario.horaInicio}:00`);
        const fimReq = new Date(`${horario.data}T${horario.horaFim}:00`);
        
        // Obtém o dia da semana da requisição
        const diaDaSemanaReq = inicioReq.getDay(); 

        const temConflito = sala.periods.some(period => {
          const start = new Date(period.start);
          const end = new Date(period.end);
          
          // -----------------------------------------------------------
          // LÓGICA DE RECORRÊNCIA PERMANENTE
          // -----------------------------------------------------------
          if (period.isRecurring) {
            
            // 1. Verifica se a reserva solicitada é anterior à data de início da recorrência.
            // (Assumimos que 'start' é a data em que a recorrência começou)
            if (inicioReq < start) {
                return false; // Recorrência ainda não estava ativa.
            }

            // 2. Compara o dia da semana.
            const diaDaSemanaPeriodo = start.getDay(); 
            
            if (diaDaSemanaReq !== diaDaSemanaPeriodo) {
                return false; 
            }

            // 3. Verifica sobreposição de HORÁRIO (Ignorando a Data).
            // Criamos 'Dates temporários' com o tempo do período recorrente, mas na data da requisição.
            
            const startRecorrenteNaDataReq = new Date(inicioReq);
            startRecorrenteNaDataReq.setHours(start.getHours(), start.getMinutes(), 0, 0);

            const endRecorrenteNaDataReq = new Date(inicioReq);
            endRecorrenteNaDataReq.setHours(end.getHours(), end.getMinutes(), 0, 0);

            //  checar a sobreposição de tempo na mesma data:
            const isOverlappingTime = !(
                fimReq <= startRecorrenteNaDataReq || 
                inicioReq >= endRecorrenteNaDataReq
            );
            
            return isOverlappingTime; 
          }
          
          // -----------------------------------------------------------
          // LÓGICA PARA RESERVAS PONTUAIS
          // -----------------------------------------------------------
          
          // Verifica se a DATA COMPLETA coincide
          const isSameDay = start.toDateString() === inicioReq.toDateString();

          // Verifica se o HORÁRIO coincide
          const isOverlappingTime = !(fimReq <= start || inicioReq >= end);
          
          return isSameDay && isOverlappingTime;
        });

        return !temConflito;
      });
    });

    // ... (restante da função)
    return res.status(200).json(
      salasDisponiveis.map(sala => ({
        id: sala.id,
        nome: sala.number,
        tipo: sala.tipo ?? '',
        ala: sala.ala,
        status: sala.active ? 'active' : 'inactive',
      })),
    );
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: 'Erro ao buscar salas disponíveis.' });
  }
};

// ----------------------
// AGENDAR SALA
// ----------------------
export const agendarSala = async (req: Request, res: Response) => {
  try {
    const { salaId, responsavel, horarios, isRecurring } = AgendamentoSchema.parse(req.body)

    const registros = horarios.map(({ data, horaInicio, horaFim }) => ({
      roomId: salaId,
      start: new Date(`${data}T${horaInicio}:00`),
      end: new Date(`${data}T${horaFim}:00`),
      nome: responsavel,
      isRecurring: isRecurring,
      createdAt: new Date()
    }))

    await prisma.roomPeriod.createMany({ data: registros })

    return res.status(201).json({ message: 'Agendamento criado com sucesso.' })
  } catch (error) {
    console.error('Erro ao agendar sala:', error)
    return res.status(400).json({ message: 'Erro ao agendar sala.' })
  }
}
