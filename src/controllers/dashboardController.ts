import { Request, Response } from "express"
import { prisma } from "../prisma/client"
import { z } from "zod"

const PeriodoSchema = z.object({
  inicio: z.string(), // "2025-08-01"
  fim: z.string()     // "2025-08-07"
})

// ----------------------
// TAXA DE OCUPAÇÃO
// ----------------------
export const occupation = async (req: Request, res: Response) => {
  try {
    const { inicio, fim } = PeriodoSchema.parse(req.body)

    // Normalizar datas para filtro no banco
    const dataInicioPrisma = new Date(inicio)
    dataInicioPrisma.setHours(0, 0, 0, 0)

    const dataFimPrisma = new Date(fim)
    dataFimPrisma.setHours(23, 59, 59, 999)

    if (dataInicioPrisma > dataFimPrisma) {
      return res.status(400).json({ message: "Data inicial não pode ser maior que a final." })
    }

    // Buscar salas ativas
    const salasAtivas = await prisma.room.findMany({
      where: { active: true },
      select: { id: true }
    })
    const totalSalas = salasAtivas.length
    if (totalSalas === 0) {
      return res.status(200).json({  dados: [] })
    }

    // Buscar todos os períodos que se sobrepõem ao intervalo
    const periodos = await prisma.roomPeriod.findMany({
      where: {
        start: { lte: dataFimPrisma },
        end: { gte: dataInicioPrisma }
      },
      select: { start: true, end: true, roomId: true }
    })

    // Criar mapa dia -> salas ocupadas
    const ocupacaoPorDia: Record<string, Set<number>> = {}

    for (const p of periodos) {
      const diaInicio = new Date(p.start)
      diaInicio.setHours(0, 0, 0, 0)

      const diaFim = new Date(p.end)
      diaFim.setHours(0, 0, 0, 0)

      let cursor = new Date(diaInicio)
      while (cursor <= diaFim) {
        const diaStr = cursor.toISOString().split("T")[0]
        if (!ocupacaoPorDia[diaStr]) ocupacaoPorDia[diaStr] = new Set()
        ocupacaoPorDia[diaStr].add(p.roomId)

        cursor.setDate(cursor.getDate() + 1)
      }
    }

    // Preencher resultado
    const resultado: { dia: string; ocupacaoPercentual: number; salasOcupadas: number }[] = []
    let cursor = new Date(dataInicioPrisma)
    while (cursor <= dataFimPrisma) {
      const diaStr = cursor.toISOString().split("T")[0]
      const salasOcupadas = ocupacaoPorDia[diaStr]?.size ?? 0
      const ocupacaoPercentual = (salasOcupadas / totalSalas) * 100

      resultado.push({
        dia: diaStr,
        ocupacaoPercentual: Number(ocupacaoPercentual.toFixed(2)),
        salasOcupadas
      })

      cursor.setDate(cursor.getDate() + 1)
    }

    return res.status(200).json(resultado)
  } catch (error) {
    console.error("Erro ao calcular taxa de ocupação:", error)
    return res.status(400).json({ message: "Erro ao calcular taxa de ocupação." })
  }
}


function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const mins = Math.round(minutos % 60)
  if (horas > 0 && mins > 0) return `${horas}h ${mins}min`
  if (horas > 0) return `${horas}h`
  return `${mins}min`
}

// ----------------------
// TEMPO MÉDIO DE USO
// ----------------------
function calcularMinutos(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60)
}

export const calcularTempoMedioUso = async (req: Request, res: Response) => {
  try {
    const { inicio, fim } = PeriodoSchema.parse(req.body)

    const dataInicio = new Date(inicio)
    dataInicio.setHours(0, 0, 0, 0)

    const dataFim = new Date(fim)
    dataFim.setDate(dataFim.getDate() + 1)

    if (dataInicio > dataFim) {
      return res.status(400).json({ message: "Data inicial não pode ser maior que a final." })
    }

    // Buscar salas ativas
    const salasAtivas = await prisma.room.findMany({
      where: { active: true },
      select: { id: true }
    })
    const totalSalas = salasAtivas.length

    // Buscar todos os agendamentos que se sobrepõem ao período
    const periodos = await prisma.roomPeriod.findMany({
      where: {
        start: { lte: dataFim },
        end: { gte: dataInicio }
      },
      select: { start: true, end: true, roomId: true }
    })

    if (periodos.length === 0) {
      return res.status(200).json({ 
        message: "Nenhum agendamento encontrado no período.", 
        tempoMedio: "0min", 
        salasUsadas: 0,
        totalSalas
      })
    }

    // Somar tempos
    const tempos = periodos.map(p => calcularMinutos(p.start, p.end))
    const soma = tempos.reduce((acc, t) => acc + t, 0)
    const media = soma / tempos.length

    // Contar salas distintas
    const salasUsadas = new Set(periodos.map(p => p.roomId)).size

    return res.status(200).json({
      salasUsadas,
      totalSalas,
      tempoMedio: formatarDuracao(media) // <<< já formatado
    })
  } catch (error) {
    console.error("Erro ao calcular tempo médio de uso:", error)
    return res.status(400).json({ message: "Erro ao calcular tempo médio de uso." })
  }
}

