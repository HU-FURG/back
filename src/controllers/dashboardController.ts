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
    dataInicio.setUTCHours(0, 0, 0, 0)

    const dataFim = new Date(fim)
    dataFim.setUTCHours(23, 59, 0, 0)

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
    console.log("Início:", dataInicio.toLocaleString())
    console.log("Fim:", dataFim.toLocaleString())
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
      tempoMedio: formatarDuracao(media)
    })
  } catch (error) {
    console.error("Erro ao calcular tempo médio de uso:", error)
    return res.status(400).json({ message: "Erro ao calcular tempo médio de uso." })
  }
}

const PeriodoSalaSchema = z.object({
  inicio: z.string(), // "2024-01-01"
  fim: z.string(),    // "2024-12-31"
  roomIdAmbiente: z.string(), // Sala específica
});
const HORARIO_INICIO = 8; // 08:00
const HORARIO_FIM = 19;   // 19:00

export const tempoMedioUsoDiarioPeriodo = async (req: Request, res: Response) => {
  try {
    const { inicio, fim, roomIdAmbiente } = PeriodoSalaSchema.parse(req.body);

    let dtInicio = DateTime.fromISO(inicio, { zone: fusoHorario }).startOf("day");
    const dtFim = DateTime.fromISO(fim, { zone: fusoHorario }).endOf("day");

    // Buscar todos os agendamentos da sala no período
    const agendamentos = await prisma.periodHistory.findMany({
      where: {
        roomIdAmbiente: roomIdAmbiente, 
        used: true,
        start: { lte: dtFim.toJSDate() },
        end: { gte: dtInicio.toJSDate() },
      },
      select: { startService: true, endService: true },
    });


    const dias: {
      dia: string;
      tempoPossivel: number;
      tempoUsado: number;
    }[] = [];

    while (dtInicio <= dtFim) {
      // Ignora fins de semana
      if (dtInicio.weekday <= 5) {
        const inicioDia = dtInicio.set({ hour: HORARIO_INICIO, minute: 0, second: 0 });
        const fimDia = dtInicio.set({ hour: HORARIO_FIM, minute: 0, second: 0 });

        const tempoPossivel = fimDia.diff(inicioDia, "minutes").minutes;

        let tempoUsado = 0;

        for (const ag of agendamentos) {
          if (!ag.startService || !ag.endService) continue;

          const agStart = DateTime.fromJSDate(ag.startService, { zone: fusoHorario });
          const agEnd = DateTime.fromJSDate(ag.endService, { zone: fusoHorario });

          const start = agStart > inicioDia ? agStart : inicioDia;
          const end = agEnd < fimDia ? agEnd : fimDia;

          if (end > start) {
            tempoUsado += end.diff(start, "minutes").minutes;
          }
        }
        dias.push({
          dia: dtInicio.toISODate() ?? dtInicio.toFormat("yyyy-MM-dd"),
          tempoPossivel,
          tempoUsado,
        });
      }

      dtInicio = dtInicio.plus({ days: 1 });
    }

    return res.status(200).json(dias);

  } catch (error) {
    console.error("Erro ao calcular tempo médio diário do período:", error);
    return res.status(400).json({ message: "Erro ao calcular tempo médio diário do período." });
  }
};

const PeriodoSalaTempoSchema = z.object({
  data: z.string(),          // Ex: "2025-01-01"
  fim: z.string(),             // Ex: "2025-03-31"
  roomIdAmbiente: z.string(),  // ID_Ambiente da sala
});

// uso { "data": "2025-08", "roomIdAmbiente": "H02-D-170" } or { "data": "2025", "roomIdAmbiente": "H02-D-170" }
export const tempoPorSalaPeriodo = async (req: Request, res: Response) => {
  try {
    const { data, roomIdAmbiente } = PeriodoSalaTempoSchema.parse(req.body);

    // Detecta se veio só o ano ou também o mês
    let dtInicio: DateTime;
    let dtFim: DateTime;

    if (/^\d{4}$/.test(data)) {
      // Caso seja apenas "2025"
      const ano = parseInt(data, 10);
      dtInicio = DateTime.fromObject({ year: ano, month: 1, day: 1 }, { zone: fusoHorario }).startOf("day");
      dtFim = dtInicio.endOf("year");
    } else if (/^\d{4}-\d{2}$/.test(data)) {
      // Caso seja "2025-08"
      const [ano, mes] = data.split("-").map(Number);
      dtInicio = DateTime.fromObject({ year: ano, month: mes, day: 1 }, { zone: fusoHorario }).startOf("day");
      dtFim = dtInicio.endOf("month");
    } else {
      return res.status(400).json({ message: "Formato de data inválido. Use 'YYYY' ou 'YYYY-MM'." });
    }

    // Buscar históricos de uso da sala
    const periodos = await prisma.periodHistory.findMany({
      where: {
        roomIdAmbiente,
        start: { lte: dtFim.toJSDate() },
        end: { gte: dtInicio.toJSDate() },
      },
      select: {
        start: true,
        end: true,
        used: true,
        startService: true,
        endService: true,
        durationMinutes: true,
        actualDurationMinutes: true,
      },
    });

    if (periodos.length === 0) {
      return res.status(200).json({ message: "Nenhum dado encontrado para esta sala no período.", data: [] });
    }

    // Agrupar por mês/ano
    const statsPorMes = new Map<string, { reservado: number; usado: number; count: number }>();

    for (const p of periodos) {
      const mesRef = DateTime.fromJSDate(p.start).setZone(fusoHorario).toFormat("yyyy-MM");
      const reservado = p.durationMinutes ?? 0;
      const usado = p.used ? (p.actualDurationMinutes ?? reservado) : 0;

      if (!statsPorMes.has(mesRef)) {
        statsPorMes.set(mesRef, { reservado: 0, usado: 0, count: 0 });
      }

      const m = statsPorMes.get(mesRef)!;
      m.reservado += reservado;
      m.usado += usado;
      m.count++;
    }

    const resultado = Array.from(statsPorMes.entries()).map(([mesRef, data]) => ({
      mesRef,
      tempoReservadoMin: data.reservado,
      tempoUsadoMin: data.usado,
      taxaUso: data.reservado > 0 ? Number(((data.usado / data.reservado) * 100).toFixed(2)) : 0,
      totalAgendamentos: data.count,
    }));

    return res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro ao calcular tempo por sala no período:", error);
    return res.status(400).json({ message: "Erro ao calcular tempo por sala no período." });
  }
};

// ----------------------------------
// 2️⃣ TEMPO GERAL POR BLOCO (RoomStats)
// ----------------------------------
const BlocoPeriodoSchema = z.object({
  bloco: z.string(),          // Ex: "Ala Azul"
  mes: z.number().optional(), // 1-12 opcional
  ano: z.number(),            // Ex: 2025
});


const BlocoGeralPeriodoSchema = z.object({
  bloco: z.string(),
  mes: z.number().optional(),
  ano: z.number(),
});

export const tempoGeralPorBloco = async (req: Request, res: Response) => {
  try {
    const { bloco, mes, ano } = BlocoGeralPeriodoSchema.parse(req.body);

    const filtro: any = {
      roomBloco: bloco,
    };

    // Se veio mês, busca só aquele mês
    if (mes) {
      filtro.monthRef = DateTime.fromObject(
        { year: ano, month: mes, day: 1 },
        { zone: fusoHorario }
      ).toJSDate();
    } else {
      // Se não veio mês, pega o ano inteiro
      filtro.monthRef = {
        gte: DateTime.fromObject(
          { year: ano, month: 1, day: 1 },
          { zone: fusoHorario }
        ).toJSDate(),
        lt: DateTime.fromObject(
          { year: ano + 1, month: 1, day: 1 },
          { zone: fusoHorario }
        ).toJSDate(),
      };
    }

    const stats = await prisma.roomStats.findMany({
      where: filtro,
      select: {
        roomIdAmbiente: true,
        roomBloco: true,
        monthRef: true,
        totalReservedMin: true,
        usageByWeekday: true,
        totalUsedMin: true,
        avgIdleMin: true,
        avgUsageRate: true, 
        totalBookings: true,
        totalUsed: true,
        totalCanceled: true,
      },
      orderBy: { monthRef: "asc" },
    });

    if (stats.length === 0) {
      return res
        .status(200)
        .json({ message: "Nenhum dado encontrado para este bloco e período." });
    }

    // Retorna exatamente o que está no banco
    const resultado = stats.map((s) => ({
      bloco: s.roomBloco,
      sala: s.roomIdAmbiente,
      mesRef: DateTime.fromJSDate(s.monthRef).toFormat("yyyy-MM"),
      reservado: s.totalReservedMin,
      usado: s.totalUsedMin,
      taxaUso: s.avgUsageRate, 
      ociosidadeMedia: s.avgIdleMin,
      usoPorSemana: s.usageByWeekday,
      totalAgendamentos: s.totalBookings,
      totalUsados: s.totalUsed,
      totalCancelados: s.totalCanceled,
    }));

    return res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro ao buscar dados de bloco:", error);
    return res
      .status(400)
      .json({ message: "Erro ao buscar dados de bloco.", error });
  }
};


export const searchForIndividual = async (req: Request, res: Response) => {
  try {
    const termo = String(req.query.termo || "").trim();
    console.log(termo)
    if (!termo) return res.status(200).json([]);
    
    // Buscar salas
    const salas = await prisma.roomStats.findMany({
      where: {
          roomIdAmbiente: { contains: termo, mode: "insensitive" } 
      },
      select: {
        roomIdAmbiente: true,
      },
      take: 5,
    });


    // Juntar resultados e limitar 5 no total
    const resultado = [
      ...salas.map((s) => ({ label: `${s.roomIdAmbiente}`, value: s.roomIdAmbiente })),
    ].slice(0, 5);

    return res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro no autocomplete universal:", error);
    return res.status(400).json([]);
  }
};