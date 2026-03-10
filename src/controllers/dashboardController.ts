import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";

// -----------------------------
// SCHEMA
// -----------------------------
const PeriodoSchema = z.object({
  inicio: z.string(),
  fim: z.string(),
});

// -----------------------------
// OCUPAÇÃO (7 dias)
// -----------------------------
export async function getOccupation(req: Request, res: Response) {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const dataFim = new Date(hoje);
    dataFim.setDate(hoje.getDate() + 6);
    dataFim.setHours(23, 59, 59, 999);

    const salasAtivas = await prisma.room.count({
      where: { active: true },
    });

    if (salasAtivas === 0) return res.json([]);

    const periodos = await prisma.roomPeriod.findMany({
      where: {
        room: { active: true },
        start: { lte: dataFim },
        end: { gte: hoje },
      },
      select: {
        start: true,
        end: true,
        roomId: true,
      },
    });

    const resultado = [];
    const diasDaSemana = ["Dom", "Seg", "Ter", "Quar", "Quin", "Sext", "Sáb"];

    for (let i = 0; i < 7; i++) {
      const diaAtual = new Date(hoje);
      diaAtual.setDate(hoje.getDate() + i);

      const inicioDia = new Date(diaAtual);
      inicioDia.setHours(0, 0, 0, 0);

      const fimDia = new Date(diaAtual);
      fimDia.setHours(23, 59, 59, 999);

      const salasOcupadasSet = new Set<number>();

      periodos.forEach((p) => {
        if (p.start <= fimDia && p.end >= inicioDia) {
          salasOcupadasSet.add(p.roomId);
        }
      });

      const salasOcupadas = salasOcupadasSet.size;
      const ocupacaoPercentual = (salasOcupadas / salasAtivas) * 100;

      resultado.push({
        dia: diasDaSemana[diaAtual.getDay()],
        ocupacaoPercentual: parseFloat(ocupacaoPercentual.toFixed(2)),
        salasOcupadas,
      });
    }

    return res.json(resultado);
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: "Erro ao calcular ocupação." });
  }
}

// -----------------------------
// TEMPO MÉDIO
// -----------------------------
export async function calculateAverageTime(req: Request, res: Response) {
  try {
    const { inicio, fim } = PeriodoSchema.parse(req.body);

    const dataInicio = new Date(inicio + "T12:00:00");
    const dataFim = new Date(fim + "T12:00:00");

    dataInicio.setHours(0, 0, 0, 0);
    dataFim.setHours(23, 59, 59, 999);

    if (dataInicio > dataFim) {
      return res.status(400).json({ message: "Data inicial maior que final." });
    }

    const salasAtivas = await prisma.room.count({
      where: { active: true },
    });

    const periodos = await prisma.roomPeriod.findMany({
      where: {
        room: { active: true },
        start: { lte: dataFim },
        end: { gte: dataInicio },
      },
      select: {
        start: true,
        end: true,
        roomId: true,
      },
    });

    if (periodos.length === 0) {
      return res.json({
        message: "Nenhum agendamento no período.",
        tempoMedio: "0min",
        salasUsadas: 0,
        totalSalas: salasAtivas,
      });
    }

    const minutosTotais = periodos.reduce((acc, p) => {
      const diff = new Date(p.end).getTime() - new Date(p.start).getTime();
      return acc + diff / (1000 * 60);
    }, 0);

    const mediaMinutos = minutosTotais / periodos.length;

    const salasUsadas = new Set(periodos.map((p) => p.roomId)).size;

    const horas = Math.floor(mediaMinutos / 60);
    const mins = Math.round(mediaMinutos % 60);

    let tempoFormatado = `${mins}min`;
    if (horas > 0) {
      tempoFormatado = `${horas}h${mins > 0 ? `:${mins}` : ""}`;
    }

    return res.json({
      salasUsadas,
      totalSalas: salasAtivas,
      tempoMedio: tempoFormatado,
      periodoAnalisado: {
        inicio: dataInicio,
        fim: dataFim,
      },
    });
  } catch (error: any) {
    console.error("Erro no calculateAverageTime:", error);

    if (error.issues) {
      return res.status(400).json({
        message: "Dados inválidos.",
        detalhes: error.issues,
      });
    }

    return res.status(500).json({
      message: "Erro interno ao calcular média.",
    });
  }
}

// -----------------------------
// BLOCK GRAPH
// -----------------------------
export async function getBlockGraphAnalytics(req: Request, res: Response) {
  try {
    const { bloco, dataMin, dataMax, diaUtil } = req.body;

    const start = new Date(dataMin);
    const end = new Date(dataMax);

    const reports = await prisma.periodReportDaily.findMany({
      where: {
        roomBloco: bloco,
        ScheduleDay: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        ScheduleDay: "asc",
      },
    });

    const dayMap = new Map<
      string,
      {
        scheduleMinutes: number;
        usedMinutes: number;
        count: number;
      }
    >();

    for (const r of reports) {
      const date = r.ScheduleDay.toISOString().split("T")[0];
      const weekday = new Date(r.ScheduleDay).getDay();

      if (diaUtil && (weekday === 0 || weekday === 6)) continue;

      const current = dayMap.get(date) ?? {
        scheduleMinutes: 0,
        usedMinutes: 0,
        count: 0,
      };

      current.scheduleMinutes += r.totalScheduleMinutes ?? 0;
      current.usedMinutes += r.totalUsedMinutes ?? 0;
      current.count += 1;

      dayMap.set(date, current);
    }

    const graph = [];

    for (const [date, value] of dayMap.entries()) {
      graph.push({
        date,
        scheduleMinutes: value.scheduleMinutes / value.count,
        usedMinutes: value.usedMinutes / value.count,
      });
    }

    return res.json(graph);
  } catch (error) {
    console.error("❌ getBlockGraphAnalytics error:", error);
    return res.status(500).json([]);
  }
}
// -----------------------------
// BLOCK TABLE
// -----------------------------
export async function getBlockTableAnalytics(req: Request, res: Response) {
  try {
    const { bloco, dataMin, dataMax, diaUtil, tempoUtilHoras } = req.body;

    const start = new Date(dataMin);
    const end = new Date(dataMax);

    const reports = await prisma.periodReportDaily.findMany({
      where: {
        roomBloco: bloco,
        ScheduleDay: {
          gte: start,
          lte: end,
        },
      },
    });

    const roomMap = new Map<
      string,
      { schedule: number; used: number; days: number }
    >();

    for (const r of reports) {
      const weekday = new Date(r.ScheduleDay).getDay();

      if (diaUtil && (weekday === 0 || weekday === 6)) continue;

      const current = roomMap.get(r.roomIdAmbiente) ?? {
        schedule: 0,
        used: 0,
        days: 0,
      };

      current.schedule += r.totalScheduleMinutes ?? 0;
      current.used += r.totalUsedMinutes ?? 0;
      current.days += 1;

      roomMap.set(r.roomIdAmbiente, current);
    }

    const tempoUtilMin = tempoUtilHoras * 60;

    const rooms: any[] = [];

    let salasBaixoUso = 0;
    let somaUso = 0;

    let totalAgendadoMin = 0;
    let totalUsadoMin = 0;

    for (const [room, value] of roomMap.entries()) {
      const capacidadeTotal = value.days * tempoUtilMin;

      const taxaUso = capacidadeTotal > 0 ? value.used / capacidadeTotal : 0;

      if (taxaUso < 0.2) salasBaixoUso++;

      somaUso += taxaUso;

      totalAgendadoMin += value.schedule;
      totalUsadoMin += value.used;

      rooms.push({
        roomId: room,
        dias: value.days,
        tempoAgendado: Math.round(value.schedule / 60),
        tempoUsado: Math.round(value.used / 60),
        taxaUso,
      });
    }

    const totalAgendadoHoras = Math.round(totalAgendadoMin / 60);
    const totalUsadoHoras = Math.round(totalUsadoMin / 60);

    const mediaAgendadoHoras = rooms.length
      ? Math.round(totalAgendadoHoras / rooms.length)
      : 0;

    const tempoMedioUsoHoras = rooms.length
      ? Math.round(totalUsadoHoras / rooms.length)
      : 0;

    const summary = {
      totalSalas: rooms.length,

      salasBaixoUso,

      mediaUso: rooms.length ? Number((somaUso / rooms.length).toFixed(2)) : 0,

      totalAgendadoHoras,

      mediaAgendadoHoras,

      tempoMedioUsoHoras,
    };

    return res.json({
      summary,
      rooms,
    });
  } catch (error) {
    console.error("❌ getBlockTableAnalytics error:", error);

    return res.status(500).json({
      summary: {
        totalSalas: 0,
        salasBaixoUso: 0,
        mediaUso: 0,
        totalAgendadoHoras: 0,
        mediaAgendadoHoras: 0,
        tempoMedioUsoHoras: 0,
      },
      rooms: [],
    });
  }
}

export async function getRoomGraphAnalytics(req: Request, res: Response) {
  try {
    const { roomId, dataMin, dataMax, diaUtil } = req.body;

    const start = new Date(dataMin);
    const end = new Date(dataMax);

    if (!roomId || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Parâmetros inválidos" });
    }

    const periods = await prisma.periodHistory.findMany({
      where: {
        roomIdAmbiente: roomId,
        start: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { start: "asc" },
    });

    const dayMap = new Map<
      string,
      { scheduleMinutes: number; usedMinutes: number }
    >();

    for (const p of periods) {
      const date = p.start.toISOString().split("T")[0];
      const weekday = new Date(p.start).getDay();

      if (diaUtil && (weekday === 0 || weekday === 6)) continue;

      const current = dayMap.get(date) ?? {
        scheduleMinutes: 0,
        usedMinutes: 0,
      };

      const duration = p.durationMinutes ?? 0;
      const used = p.actualDurationMinutes ?? 0;

      current.scheduleMinutes += duration;
      current.usedMinutes += used;

      dayMap.set(date, current);
    }

    const graph = [];

    for (const [date, value] of dayMap.entries()) {
      graph.push({
        date,
        scheduleMinutes: value.scheduleMinutes,
        usedMinutes: value.usedMinutes,
      });
    }

    return res.json(graph);
  } catch (error) {
    console.error("❌ getRoomGraphAnalytics error:", error);
    return res.status(500).json([]);
  }
}

export async function getRoomTableAnalytics(req: Request, res: Response) {
  try {
    const { roomId, dataMin, dataMax, diaUtil, tempoUtilHoras } = req.body;

    const start = new Date(dataMin);
    const end = new Date(dataMax);

    if (!roomId || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ error: "Parâmetros inválidos" });
    }

    const periods = await prisma.periodHistory.findMany({
      where: {
        roomIdAmbiente: roomId,
        start: {
          gte: start,
          lte: end,
        },
      },
      orderBy: {
        start: "asc",
      },
      select: {
        id: true,
        start: true,
        end: true,
        weekday: true,
        used: true,

        durationMinutes: true,
        actualDurationMinutes: true,

        createdByLogin: true,
        createdByNome: true,

        scheduledForLogin: true,
        scheduledForNome: true,

        availabilityStatus: true,
        typeSchedule: true,
      },
    });

    let totalScheduleMin = 0;
    let totalUsedMin = 0;

    const daySet = new Set<string>();

    for (const p of periods) {
      const weekday = new Date(p.start).getDay();
      if (diaUtil && (weekday === 0 || weekday === 6)) continue;

      const date = p.start.toISOString().split("T")[0];
      daySet.add(date);

      totalScheduleMin += p.durationMinutes ?? 0;
      totalUsedMin += p.actualDurationMinutes ?? 0;
    }

    const dias = daySet.size;

    const tempoUtilMin = tempoUtilHoras * 60;
    const capacidadeTotal = dias * tempoUtilMin;

    const taxaUso = capacidadeTotal > 0 ? totalUsedMin / capacidadeTotal : 0;

    const summary = {
      roomId,
      dias,
      tempoAgendado: Math.round(totalScheduleMin / 60),
      tempoUsado: Math.round(totalUsedMin / 60),
      taxaUso,
    };

    return res.json({
      summary,
      periods,
    });
  } catch (error) {
    console.error("❌ getRoomTableAnalytics error:", error);

    return res.status(500).json({
      summary: {
        roomId: null,
        dias: 0,
        tempoAgendado: 0,
        tempoUsado: 0,
        taxaUso: 0,
      },
      periods: [],
    });
  }
}

export async function getRoomTopUsers(req: Request, res: Response) {
  try {
    const { roomId, dataMin, dataMax, diaUtil } = req.body;

    const start = new Date(dataMin);
    const end = new Date(dataMax);

    const periods = await prisma.periodHistory.findMany({
      where: {
        roomIdAmbiente: roomId,
        start: {
          gte: start,
          lte: end,
        },
      },
      select: {
        scheduledForLogin: true,
        scheduledForNome: true,
        actualDurationMinutes: true,
        start: true,
      },
    });

    const userMap = new Map<
      string,
      { nome: string; count: number; usedMinutes: number }
    >();

    for (const p of periods) {
      const weekday = new Date(p.start).getDay();
      if (diaUtil && (weekday === 0 || weekday === 6)) continue;

      const login = p.scheduledForLogin ?? "desconhecido";
      const nome = p.scheduledForNome ?? "Desconhecido";

      const current = userMap.get(login) ?? {
        nome,
        count: 0,
        usedMinutes: 0,
      };

      current.count += 1;
      current.usedMinutes += p.actualDurationMinutes ?? 0;

      userMap.set(login, current);
    }

    const users = [];

    for (const [login, value] of userMap.entries()) {
      users.push({
        login,
        nome: value.nome,
        usos: value.count,
        horasUsadas: Math.round(value.usedMinutes / 60),
      });
    }

    users.sort((a, b) => b.usos - a.usos);

    return res.json(users.slice(0, 10)); // top 10
  } catch (error) {
    console.error("❌ getRoomTopUsers error:", error);
    return res.status(500).json([]);
  }
}
