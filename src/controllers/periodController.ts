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
  )
})

type BuscarSalasBody = z.infer<typeof BodySchema>
type AgendarSalaBody = z.infer<typeof AgendamentoSchema>

// ----------------------
// BUSCAR SALAS DISPONÍVEIS
// ----------------------
export const buscarSalasDisponiveis = async (req: Request, res: Response) => {
  try {
    const { horarios } = BodySchema.parse(req.body)

    // Obter todas as salas ativas com seus agendamentos
    const salasAtivas = await prisma.room.findMany({
      where: { active: true },
      include: { periods: true }
    })

    const salasDisponiveis = salasAtivas.filter(sala => {
      return horarios.every(horario => {
        const inicioReq = new Date(`${horario.data}T${horario.horaInicio}:00`)
        const fimReq = new Date(`${horario.data}T${horario.horaFim}:00`)

        const temConflito = sala.periods.some(period => {
          const start = new Date(period.start)
          const end = new Date(period.end)

          // verifica sobreposição
          return !(fimReq <= start || inicioReq >= end)
        })

        return !temConflito
      })
    })

    return res.status(200).json(
      salasDisponiveis.map(sala => ({
        id: sala.id,
        nome: sala.number,
        tipo: sala.tipo ?? '',
        bloco: sala.bloco,
        status: sala.active ? 'active' : 'inactive'
      }))
    )
  } catch (error) {
    console.error(error)
    return res.status(400).json({ message: 'Erro ao buscar salas disponíveis.' })
  }
}

// ----------------------
// AGENDAR SALA
// ----------------------
export const agendarSala = async (req: Request, res: Response) => {
  try {
    const { salaId, responsavel, horarios } = AgendamentoSchema.parse(req.body)

    const registros = horarios.map(({ data, horaInicio, horaFim }) => ({
      roomId: salaId,
      start: new Date(`${data}T${horaInicio}:00`),
      end: new Date(`${data}T${horaFim}:00`),
      nome: responsavel,
      isRecurring: false,
      createdAt: new Date()
    }))

    await prisma.roomPeriod.createMany({ data: registros })

    return res.status(201).json({ message: 'Agendamento criado com sucesso.' })
  } catch (error) {
    console.error('Erro ao agendar sala:', error)
    return res.status(400).json({ message: 'Erro ao agendar sala.' })
  }
}
