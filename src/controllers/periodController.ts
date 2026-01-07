import { Request, Response } from 'express'
import { prisma } from '../prisma/client'
import { z } from 'zod'
import { DateTime, Interval } from "luxon";
import { validateHorarios, verificarConflitoUniversal } from '../auxiliar/validateHorarios';

const TZ = "America/Sao_Paulo";

// Validação dos horários enviados
const HorarioSchema = z.object({
  data: z.string(),        // "2025-08-06"
  horaInicio: z.string(),  // "02:00"
  horaFim: z.string(),     // "16:00"
})

const BodySchema = z.object({
  userId: z.number(),
  horarios: z.array(HorarioSchema),
  recorrente: z.boolean(),
  maxTimeRecorrente: z.string(), // em meses
  lastRoomId: z.number().optional().default(-1), 
  numeroSala: z.string().optional(),
  bloco: z.coerce.number().optional(),
  especialidadeRoom: z.coerce.number().optional(),
  tipo: z.string().optional(),
})

export const AgendamentoSchema = z.object({
  salaId: z.number(),
  scheduledForId: z.number().optional(), // 🔥 vem do front
  horarios: z.array(HorarioSchema),
  recorrente: z.boolean(),
  maxTimeRecorrente: z.string(),
});


export const buscarSalasDisponiveis = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      horarios,
      recorrente,
      maxTimeRecorrente,
      lastRoomId,
      numeroSala,
      bloco,
      tipo,
      especialidadeRoom
    } = BodySchema.parse(req.body);

    const TZ = "America/Sao_Paulo";
    const agoraUTC = DateTime.now().setZone(TZ).toUTC();

    // ==================================================
    // 1) Validação inicial
    // ==================================================
    const result = validateHorarios(horarios, recorrente);
    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }

    const usuarioAlvo = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        active: true,
        especialidadeId: true,
      },
    });

    if (!usuarioAlvo || !usuarioAlvo.active) {
      return res.status(404).json({
        message: "Usuário informado não existe ou está inativo.",
      });
    }

    // ==================================================
    // 2) Converter horários para UTC
    // ==================================================
    const horariosReq = horarios.map(
      (h: { data: string; horaInicio: string; horaFim: string }) => {
        const inicio = DateTime.fromISO(
          `${h.data}T${h.horaInicio}`,
          { zone: TZ }
        ).toUTC();

        const fim = DateTime.fromISO(
          `${h.data}T${h.horaFim}`,
          { zone: TZ }
        ).toUTC();

        return {
          ...h,
          inicio,
          fim,
          diaSemana: inicio.weekday,
        };
      }
    );

    // ==================================================
    // 3) Montar filtros de busca
    // ==================================================
    const whereCondition: any = { active: true };

    // 🔒 FUTURO: limitar salas pela especialidade do usuário
    // if (usuarioAlvo.especialidadeId) {
    //   whereCondition.especialidadeId = usuarioAlvo.especialidadeId;
    // }

    const isFilteredSearch = !!numeroSala || !!bloco || (tipo && tipo !== "all") || !!especialidadeRoom;


    if (numeroSala) {
      whereCondition.ID_Ambiente = {
        contains: numeroSala,
        mode: "insensitive",
      };
    }

    if (tipo && tipo !== "all") {
      whereCondition.tipo = tipo;
    }

    if (bloco) {
      whereCondition.blocoId = bloco;
    }

    if (especialidadeRoom != null) {
      whereCondition.especialidadeId = especialidadeRoom;
    }

    if (!isFilteredSearch && lastRoomId > -1) {
      whereCondition.id = { gt: lastRoomId };
    }

    // ==================================================
    // 4) Buscar salas
    // ==================================================
    const salas = await prisma.room.findMany({
      where: whereCondition,
      orderBy: { id: "asc" },
      include: {
        bloco: true,
        especialidade: true,
        periods: {
          where: {
            end: { gte: agoraUTC.toJSDate() },
          },
        },
      },
    });

    // ==================================================
    // 5) Filtrar por conflito
    // ==================================================
    let ultimoIdDaBusca = -1;
    const salasDisponiveis: typeof salas = [];

    for (const sala of salas) {
      if (salasDisponiveis.length >= 12) break;

      const isAvailable = horariosReq.every((reqHorario: any) => {
        return !sala.periods.some((dbPeriod: any) =>
          verificarConflitoUniversal(
            reqHorario.data,
            reqHorario.horaInicio,
            reqHorario.horaFim,
            recorrente,
            maxTimeRecorrente ?? null,
            dbPeriod.start,
            dbPeriod.end,
            dbPeriod.isRecurring,
            dbPeriod.maxScheduleTime
          )
        );
      });

      if (isAvailable) {
        salasDisponiveis.push(sala);
        ultimoIdDaBusca = sala.id;
      }
    }

    // ==================================================
    // 6) Retorno
    // ==================================================
    const indiceUltimaSala = salas.findIndex(
      (s) => s.id === ultimoIdDaBusca
    );

    const temMaisSalas =
      ultimoIdDaBusca > -1 &&
      salasDisponiveis.length === 12 &&
      indiceUltimaSala < salas.length - 1;

    return res.status(200).json({
      salas: salasDisponiveis.map((s) => ({
        id: s.id,
        nome: s.ID_Ambiente,
        tipo: s.tipo ?? "",
        ala: s.bloco.nome,
        especialidadeRoom: s.especialidade.nome,
        status: s.active ? "active" : "inactive",
      })),
      meta: {
        ultimoIdAchado: ultimoIdDaBusca,
        temMaisSalas,
      },
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Erro ao buscar salas disponíveis." });
  }
};


// ----------------------
// AGENDAR SALA
// ----------------------
export const agendarSala = async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user;

    const body = AgendamentoSchema.parse(req.body);
    const {
      salaId,
      scheduledForId,
      horarios,
      recorrente,
      maxTimeRecorrente,
    } = body;

    // =========================
    // 1️⃣ Usuário autenticado
    // =========================
    const usuarioLogado = await prisma.user.findUnique({
      where: { id: authUser.userId },
    });

    if (!usuarioLogado) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const TZ = "America/Sao_Paulo";

    // =========================
    // 2️⃣ Definir PARA QUEM é o agendamento
    // =========================
    let finalScheduledForId = usuarioLogado.id;

    if (usuarioLogado.hierarquia === "admin") {
      if (!scheduledForId) {
        return res.status(400).json({
          message: "Admin deve informar o usuário para quem será o agendamento.",
        });
      }

      const usuarioAlvo = await prisma.user.findUnique({
        where: { id: scheduledForId },
        select: {
          id: true,
          especialidadeId: true, // 🔮 já preparando futuro
          active: true,
        },
      });

      if (!usuarioAlvo || !usuarioAlvo.active) {
        return res.status(404).json({
          message: "Usuário informado não existe ou está inativo.",
        });
      }

      finalScheduledForId = usuarioAlvo.id;

      // 🔮 FUTURO:
      // aqui entra a validação de especialidade x sala
    }

    // =========================
    // 3️⃣ Buscar reservas existentes
    // =========================
    const reservasExistentes = await prisma.roomPeriod.findMany({
      where: {
        roomId: salaId,
        OR: [
          { isRecurring: true },
          { end: { gte: new Date() } },
        ],
      },
    });

    // =========================
    // 4️⃣ Validação de conflito
    // =========================
    for (const { data, horaInicio, horaFim } of horarios) {
      const temConflito = reservasExistentes.some((dbPeriod) =>
        verificarConflitoUniversal(
          data,
          horaInicio,
          horaFim,
          recorrente,
          maxTimeRecorrente ?? null,
          dbPeriod.start,
          dbPeriod.end,
          dbPeriod.isRecurring,
          dbPeriod.maxScheduleTime
        )
      );

      if (temConflito) {
        return res.status(400).json({
          message: `Conflito de horário detectado no dia ${data} (${horaInicio}-${horaFim}).`,
        });
      }
    }

    // =========================
    // 5️⃣ Auto approve
    // =========================
    const autoApproveConfig = await prisma.systemLog.findUnique({
      where: { key: "last_clear_update" },
    });

    const approved =
      usuarioLogado.hierarquia === "admin"
        ? true
        : autoApproveConfig?.autoApprove ?? false;

    // =========================
    // 6️⃣ Criar registros
    // =========================
    const registros = horarios.map(({ data, horaInicio, horaFim }) => {
      const inicioUTC = DateTime.fromISO(`${data}T${horaInicio}`, {
        zone: TZ,
      }).toUTC();

      const fimUTC = DateTime.fromISO(`${data}T${horaFim}`, {
        zone: TZ,
      }).toUTC();

      let maxUTC: Date | null = null;

      if (recorrente && maxTimeRecorrente) {
        maxUTC = DateTime
          .fromISO(maxTimeRecorrente, { zone: TZ })
          .endOf("day")
          .toUTC()
          .toJSDate();
      }


      return {
        roomId: salaId,
        createdById: usuarioLogado.id,
        scheduledForId: finalScheduledForId,
        start: inicioUTC.toJSDate(),
        end: fimUTC.toJSDate(),
        isRecurring: recorrente,
        maxScheduleTime: maxUTC,
        approved,
      };
    });

    await prisma.roomPeriod.createMany({ data: registros });

    return res.status(201).json({
      message: "Agendamento criado com sucesso.",
    });

  } catch (error: any) {
    console.error("Erro ao agendar sala:", error);

    if (error.errors) {
      return res.status(400).json({
        message: "Dados inválidos",
        details: error.errors,
      });
    }

    return res.status(500).json({
      message: "Erro interno ao agendar sala.",
    });
  }
};



// ===============================
//  Listar minhas reservas
// ===============================
export async function listarMinhasReservas(req: Request, res: Response) {
  try {
    const user = (req as any).user;

    if (!user?.userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    // Busca hierarquia do usuário
    const usuario = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { hierarquia: true },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    // 🔥 REGRA DE VISIBILIDADE
    const whereCondition =
      usuario.hierarquia === "admin"
        ? { createdById: user.userId }      // admin vê o que ELE criou
        : { scheduledForId: user.userId };  // user vê o que foi agendado PRA ELE

    const reservas = await prisma.roomPeriod.findMany({
      where: whereCondition,
      include: {
        room: {
          select: {
            ID_Ambiente: true,
            tipo: true,
            bloco: {
              select: {
                nome: true,
              },
            },
          },
        },
        createdBy: {
          select: {
            id: true,
            login: true,
            nome: true,
          },
        },
        scheduledFor: {
          select: {
            id: true,
            login: true,
            nome: true,
          },
        },
      },
      orderBy: {
        start: "desc",
      },
    });

    return res.json({
      success: true,
      reservas,
    });
  } catch (err) {
    console.error("Erro ao listar reservas:", err);
    return res.status(500).json({
      error: "Erro interno ao listar reservas",
    });
  }
}


// ===============================
//  Cancelar reserva
// ===============================
export async function cancelarReserva(req: Request, res: Response) {
  try {
    const user = (req as any).user;
    const userId = user?.userId;
    const reservaId = Number(req.params.id);

    if (!userId) {
      return res.status(401).json({ error: "Usuário não autenticado" });
    }

    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { hierarquia: true },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const reserva = await prisma.roomPeriod.findUnique({
      where: { id: reservaId },
      select: {
        id: true,
        start: true,
        createdById: true,
        scheduledForId: true,
      },
    });

    if (!reserva) {
      return res.status(404).json({ error: "Reserva não encontrada" });
    }

    const agora = new Date();

    // =========================
    // 🔐 PERMISSÕES
    // =========================

    if (usuario.hierarquia === "user") {
      if (reserva.scheduledForId !== userId) {
        return res.status(403).json({
          error: "Você não pode cancelar esta reserva",
        });
      }
    }
      
    if (reserva.start <= agora) {
      return res.status(400).json({
        error: "Não é possível cancelar uma reserva já iniciada",
      });
    }

    // =========================
    // 🗑️ CANCELAMENTO
    // =========================
    await prisma.roomPeriod.delete({
      where: { id: reservaId },
    });

    return res.json({
      success: true,
      message: "Reserva cancelada com sucesso",
    });
  } catch (err) {
    console.error("Erro ao cancelar reserva:", err);
    return res.status(500).json({
      error: "Erro interno ao cancelar reserva",
    });
  }
}

