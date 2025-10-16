import { Request, Response } from "express"
import { prisma } from "../prisma/client"
import { z } from "zod"
import { DateTime } from "luxon"

const PeriodoSchema = z.object({
  inicio: z.string(), // "2025-08-01"
  fim: z.string()     // "2025-08-07"
})
const diasDaSemana = [
  "Domingo", 
  "Segunda", 
  "Terça", 
  "Quarta", 
  "Quinta", 
  "Sexta", 
  "Sábado"
];
const fusoHorario = "America/Sao_Paulo";
// ----------------------
// TAXA DE OCUPAÇÃO
// ----------------------
export const occupation = async (req: Request, res: Response) => {
  try {
    // 1. Definição de datas usando Luxon para consistência
    const hoje = DateTime.now().setZone(fusoHorario).startOf("day");
    const dataFim = hoje.plus({ days: 6 }).endOf("day");

    // 2. Busca de salas ativas (sem alteração)
    const salasAtivas = await prisma.room.findMany({
      where: { active: true },
      select: { id: true },
    });

    const totalSalas = salasAtivas.length;
    if (totalSalas === 0) {
      return res.status(200).json([]); // Retornar array vazio é mais comum
    }

    // 3. Busca de períodos, passando as datas corretas para o Prisma
    const periodos = await prisma.roomPeriod.findMany({
      where: {
        room: { active: true }, // Otimização: Filtre por salas ativas aqui
        start: { lte: dataFim.toJSDate() },
        end: { gte: hoje.toJSDate() },
      },
      select: { start: true, end: true, roomId: true },
    });

    // 4. Processamento de Períodos (Lógica Corrigida com Luxon)
    // Usar Map é um pouco mais moderno e performático que Record<string, Set>
    const ocupacaoPorDia = new Map<string, Set<number>>();

    for (const p of periodos) {
      // Converte as datas do banco para o fuso horário correto ANTES de processar
      let cursor = DateTime.fromJSDate(p.start).setZone(fusoHorario).startOf("day");
      const fimPeriodo = DateTime.fromJSDate(p.end).setZone(fusoHorario).startOf("day");

      while (cursor <= fimPeriodo) {
        const diaStr = cursor.toISODate(); // 'YYYY-MM-DD'
        if (diaStr) {
          if (!ocupacaoPorDia.has(diaStr)) {
            ocupacaoPorDia.set(diaStr, new Set<number>());
          }
          ocupacaoPorDia.get(diaStr)?.add(p.roomId);
        }
        cursor = cursor.plus({ days: 1 });
      }
    }

    // 5. Preenchimento do resultado (Lógica Corrigida com Luxon)
    const resultado = [];
    for (let i = 0; i < 7; i++) {
      const diaAtual = hoje.plus({ days: i });
      const diaStr = diaAtual.toISODate(); // 'YYYY-MM-DD'

      const salasOcupadas = ocupacaoPorDia.get(diaStr ?? "")?.size ?? 0;
      const ocupacaoPercentual = totalSalas > 0 ? (salasOcupadas / totalSalas) * 100 : 0;
      
      resultado.push({
        dia: diasDaSemana[diaAtual.weekday % 7], // Luxon: 7 para Domingo, 1 para Segunda. O resto da divisão ajusta para o nosso array.
        ocupacaoPercentual: Number(ocupacaoPercentual.toFixed(2)),
        salasOcupadas,
      });
    }

    return res.status(200).json(resultado);

  } catch (error) {
    console.error("Erro ao calcular taxa de ocupação:", error);
    return res.status(400).json({ message: "Erro ao calcular taxa de ocupação." });
  }
};


function formatarDuracao(minutos: number): string {
  const horas = Math.floor(minutos / 60)
  const mins = Math.round(minutos % 60)
  if (horas > 0 && horas > 10 && mins > 0) return `${horas}:${mins}`
  if (horas > 0 && mins > 0) return `0${horas}:${mins}`
  if (horas > 0 && horas > 10) return `${horas}h`
  if (horas > 0) return `0${horas}h`
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
    dataFim.setHours(23,59,0,0)

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

