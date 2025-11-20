import { Request, Response } from 'express'
import { prisma } from '../prisma/client'
import { z } from 'zod'
import { DateTime } from "luxon";
import { validateHorarios } from '../auxiliar/validateHorarios';

const TZ = "America/Sao_Paulo";

// Validação dos horários enviados
const HorarioSchema = z.object({
  data: z.string(),        // "2025-08-06"
  horaInicio: z.string(),  // "02:00"
  horaFim: z.string(),     // "16:00"
})

const BodySchema = z.object({
  horarios: z.array(HorarioSchema),
  recorrente: z.boolean(),
  maxTimeRecorrente: z.number(), // em meses
})

export const AgendamentoSchema = z.object({
  salaId: z.number(),
  responsavel: z.string(),
  horarios: z.array(HorarioSchema),
  recorrente: z.boolean(),
  userId: z.number().optional(), 
  maxTimeRecorrente: z.number(),
});

type BuscarSalasBody = z.infer<typeof BodySchema>
type AgendarSalaBody = z.infer<typeof AgendamentoSchema>

// export const buscarSalasDisponiveis = async (req: Request, res: Response) => {
//   try {
//     const { horarios, recorrente, maxTimeRecorrente } = BodySchema.parse(req.body);

//     const result = validateHorarios(horarios, recorrente);

//     if (!result.ok) {
//       return res.status(400).json({ message: result.error });
//     }

//     const TZ = "America/Sao_Paulo";

//     const salasAtivas = await prisma.room.findMany({
//       where: { active: true },
//       include: { periods: true },
//     });

//     const salasDisponiveis = salasAtivas.filter((sala) => {
//       return horarios.every(({ data, horaInicio, horaFim }) => {
        
//         // FRONT → horário BR → converter uma vez para UTC
//         const inicioReqUTC = DateTime
//           .fromISO(`${data}T${horaInicio}`, { zone: TZ })
//           .toUTC();

//         const fimReqUTC = DateTime
//           .fromISO(`${data}T${horaFim}`, { zone: TZ })
//           .toUTC();

//         const diaSemanaReq = inicioReqUTC.weekday;

//         const temConflito = sala.periods.some((period) => {

//           // Banco já está em UTC → NÃO reconverter para BR
//           const start = DateTime.fromJSDate(period.start).toUTC();
//           const end   = DateTime.fromJSDate(period.end).toUTC();
//           const diaSemanaPeriodo = start.weekday;

//           // =============================
//           //   RESERVA RECORRENTE
//           // =============================
//           if (recorrente) {

//             // --- Periodo também é recorrente
//             if (period.isRecurring) {
//               if (diaSemanaReq !== diaSemanaPeriodo) return false;

//               const reqStartHM = inicioReqUTC.toFormat("HH:mm");
//               const reqEndHM   = fimReqUTC.toFormat("HH:mm");
//               const perStartHM = start.toFormat("HH:mm");
//               const perEndHM   = end.toFormat("HH:mm");

//               const conflita =
//                 !(reqEndHM <= perStartHM || reqStartHM >= perEndHM);

//               return conflita;
//             }

//             // --- Periodo é pontual
//             else {
//               if (start < DateTime.utc()) return false;
//               if (diaSemanaReq !== diaSemanaPeriodo) return false;

//               const conflita =
//                 !(fimReqUTC <= start || inicioReqUTC >= end);

//               return conflita;
//             }
//           }

//           // =============================
//           //   RESERVA PONTUAL
//           // =============================
//           else {

//             // --- Agendamento existente é recorrente
//             if (period.isRecurring) {

//               if (inicioReqUTC < start) return false;

//               if (diaSemanaReq !== diaSemanaPeriodo) return false;

//               const recStartNaData = inicioReqUTC.set({
//                 hour: start.hour,
//                 minute: start.minute,
//               });

//               const recEndNaData = inicioReqUTC.set({
//                 hour: end.hour,
//                 minute: end.minute,
//               });

//               const conflita =
//                 !(fimReqUTC <= recStartNaData || inicioReqUTC >= recEndNaData);

//               return conflita;
//             }

//             // --- Ambos pontuais
//             const conflita =
//               !(fimReqUTC <= start || inicioReqUTC >= end);

//             return conflita;
//           }
//         });

//         return !temConflito;
//       });
//     });

//     return res.status(200).json(
//       salasDisponiveis.map((sala) => ({
//         id: sala.id,
//         nome: sala.ID_Ambiente,
//         tipo: sala.tipo ?? "",
//         ala: sala.bloco,
//         status: sala.active ? "active" : "inactive",
//       }))
//     );

//   } catch (error) {
//     console.error(error);
//     return res.status(400).json({ message: "Erro ao buscar salas disponíveis." });
//   }
// };

export const buscarSalasDisponiveis = async (req: Request, res: Response) => {
  try {
    const { horarios, recorrente } = req.body;

    // ==================================================
    // 1) VALIDAÇÃO INICIAL DOS HORÁRIOS
    // ==================================================
    const result = validateHorarios(horarios, recorrente);
    if (!result.ok) {
      return res.status(400).json({ message: result.error });
    }

    const TZ = "America/Sao_Paulo";
    const agoraUTC = DateTime.utc();

    // ==================================================
    // 2) Converter horários da requisição → UTC
    // ==================================================
    const horariosReq = horarios.map((h: { data: any; horaInicio: any; horaFim: any; }) => {
      const inicio = DateTime.fromISO(`${h.data}T${h.horaInicio}`, { zone: TZ }).toUTC();
      const fim    = DateTime.fromISO(`${h.data}T${h.horaFim}`,    { zone: TZ }).toUTC();
      return {
        ...h,
        inicio,
        fim,
        diaSemana: inicio.weekday,
      };
    });

    // Para recorrência, só importa o primeiro horário
    const baseReq = horariosReq[0];

    // ==================================================
    // 3) Buscar SOMENTE AS 10 PRIMEIRAS SALAS ativas
    //    (evita overSearch)
    // ==================================================
    const salas = await prisma.room.findMany({
      where: { active: true },
      take: 10,
      orderBy: { id: "asc" },
      include: {
        periods: {
          where: {
            end: { gte: agoraUTC.toJSDate() },   // só períodos ainda relevantes
          }
        }
      }
    });

    // ==================================================
    // 4) Função auxiliar: verificar conflito entre dois intervalos
    // ==================================================
    function intervaloConflita(startA: DateTime, endA: DateTime, startB: DateTime, endB: DateTime) {
      return !(endA <= startB || startA >= endB);
    }

    // ==================================================
    // 5) Funções auxiliares de conflito por tipo
    // ==================================================

    // --------------------------
    // PEDIDO RECORRENTE × EXISTENTE RECORRENTE
    // --------------------------
    function conflitoRecorrenteComRecorrente(period: any, req: any) {
      if (period.start.weekday !== req.diaSemana) return false;

      const reqStartHM = req.inicio.toFormat("HH:mm");
      const reqEndHM   = req.fim.toFormat("HH:mm");
      const perStartHM = DateTime.fromJSDate(period.start).toUTC().toFormat("HH:mm");
      const perEndHM   = DateTime.fromJSDate(period.end).toUTC().toFormat("HH:mm");

      return !(reqEndHM <= perStartHM || reqStartHM >= perEndHM);
    }

    // --------------------------
    // PEDIDO RECORRENTE × EXISTENTE PONTUAL
    // --------------------------
    function conflitoRecorrenteComPontual(period: any, req: any) {
      const pStart = DateTime.fromJSDate(period.start).toUTC();
      const pEnd   = DateTime.fromJSDate(period.end).toUTC();

      if (pStart < agoraUTC) return false;             // ignora eventos já passados
      if (pStart.weekday !== req.diaSemana) return false;

      return intervaloConflita(req.inicio, req.fim, pStart, pEnd);
    }

    // --------------------------
    // PEDIDO PONTUAL × EXISTENTE RECORRENTE
    // --------------------------
    function conflitoPontualComRecorrente(period: any, req: any) {
      const pStart = DateTime.fromJSDate(period.start).toUTC();
      const pEnd   = DateTime.fromJSDate(period.end).toUTC();

      if (req.inicio < pStart) return false;  // recorrente só vale para datas >= primeiro start
      if (req.diaSemana !== pStart.weekday) return false;

      const recStartNaData = req.inicio.set({
        hour: pStart.hour,
        minute: pStart.minute,
      });

      const recEndNaData = req.inicio.set({
        hour: pEnd.hour,
        minute: pEnd.minute,
      });

      return intervaloConflita(req.inicio, req.fim, recStartNaData, recEndNaData);
    }

    // --------------------------
    // PEDIDO PONTUAL × EXISTENTE PONTUAL
    // --------------------------
    function conflitoPontualComPontual(period: any, req: any) {
      const pStart = DateTime.fromJSDate(period.start).toUTC();
      const pEnd   = DateTime.fromJSDate(period.end).toUTC();
      return intervaloConflita(req.inicio, req.fim, pStart, pEnd);
    }

    // ==================================================
    // 6) Filtrar salas sem conflito
    // ==================================================
    const salasDisponiveis = salas.filter(sala => {

      // Para CADA horário solicitado pelo usuário
      return horariosReq.every((reqHorario: any) => {

        const temConflito = sala.periods.some(period => {

          if (recorrente) {
            if (period.isRecurring) {
              return conflitoRecorrenteComRecorrente(period, baseReq);
            } else {
              return conflitoRecorrenteComPontual(period, baseReq);
            }
          }

          else {
            if (period.isRecurring) {
              return conflitoPontualComRecorrente(period, reqHorario);
            } else {
              return conflitoPontualComPontual(period, reqHorario);
            }
          }

        });

        return !temConflito;
      });

    });

    // ==================================================
    // 7) Retorno final
    // ==================================================
    return res.status(200).json(
      salasDisponiveis.map(s => ({
        id: s.id,
        nome: s.ID_Ambiente,
        tipo: s.tipo ?? "",
        ala: s.bloco,
        status: s.active ? "active" : "inactive",
      }))
    );

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Erro ao buscar salas disponíveis." });
  }
};

// ----------------------
// AGENDAR SALA
// ----------------------
export const agendarSala = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const body = AgendamentoSchema.parse(req.body);

    const { salaId, responsavel, horarios, recorrente, maxTimeRecorrente, userId } = body;

    console.log("\n================= RECEBIDO DO FRONT =================");
    console.log(JSON.stringify(body, null, 2));

    // Verifica usuário autenticado
    const usuarioLogado = await prisma.user.findUnique({
      where: { login: user.login }
    });
    if (!usuarioLogado)
      return res.status(401).json({ message: "Usuário não autenticado." });

    const TZ = "America/Sao_Paulo";

    console.log("\n============= CONVERSÃO BR → UTC (TESTE) =============");

    for (const { data, horaInicio, horaFim } of horarios) {

      const inicioUTC = DateTime
        .fromISO(`${data}T${horaInicio}`, { zone: TZ })
        .toUTC();

      const fimUTC = DateTime
        .fromISO(`${data}T${horaFim}`, { zone: TZ })
        .toUTC();

      console.log(`\nHorário solicitado:`);
      console.log(`  BR:  ${data} ${horaInicio} → ${data} ${horaFim}`);
      console.log(`  UTC: ${inicioUTC.toISO()} → ${fimUTC.toISO()}`);

      // Verificar conflito
      const conflito = await prisma.roomPeriod.findFirst({
        where: {
          roomId: salaId,
          start: { lt: fimUTC.toJSDate() },
          end: { gt: inicioUTC.toJSDate() }
        }
      });

      if (conflito) {
        console.log("⚠️ Conflito detectado:", conflito);
        return res.status(400).json({
          message: "Horário indisponível. Buscar novamente",
        });
      }
    }

    const autoApproveConfig = await prisma.systemLog.findUnique({
      where: { key: "last_clear_update" }
    });

    const autoApprove = autoApproveConfig?.autoApprove;

    const donoReserva =
      usuarioLogado.hierarquia === "admin" ? userId : usuarioLogado.id;

    const approved =
      usuarioLogado.hierarquia === "admin" ? true : autoApprove;

    console.log("\n============= REGISTROS A SEREM SALVOS =============");

    const registros = horarios.map(({ data, horaInicio, horaFim }) => {

      const inicioUTC = DateTime
        .fromISO(`${data}T${horaInicio}`, { zone: TZ })
        .toUTC();

      const fimUTC = DateTime
        .fromISO(`${data}T${horaFim}`, { zone: TZ })
        .toUTC();

      const maxUTC =
        recorrente && maxTimeRecorrente
          ? DateTime
              .fromISO(`${maxTimeRecorrente}T23:59:59`, { zone: TZ })
              .toUTC()
          : null;

      const registro = {
        roomId: salaId,
        userId: donoReserva,
        nome: responsavel,
        start: inicioUTC.toJSDate(),
        end: fimUTC.toJSDate(),
        isRecurring: recorrente,
        maxScheduleTime: maxUTC ? maxUTC.toJSDate() : null,
        approved,
        createdAt: new Date(),
      };

      console.log("Registro:", registro);

      return registro;
    });

    await prisma.roomPeriod.createMany({ data: registros });

    console.log("\n✔️ SALVO NO BANCO COM SUCESSO!");

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
