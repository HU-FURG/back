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
  horarios: z.array(HorarioSchema),
  recorrente: z.boolean(),
  maxTimeRecorrente: z.number(), // em meses
  lastRoomId: z.number().optional().default(-1), 
  numeroSala: z.string().optional(),
  bloco: z.string().optional(),
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

export const buscarSalasDisponiveis = async (req: Request, res: Response) => {
  try {
    const { horarios, recorrente,maxTimeRecorrente, lastRoomId, numeroSala, bloco } = req.body;

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

    // NOVO: Determina a data máxima de validade da recorrência pedida (se houver)
    const maxRecurrenceEnd = recorrente
        ? baseReq.inicio.plus({ months: maxTimeRecorrente })
        : undefined;

    // ==================================================
    // 3) Buscar as salas, aplicando filtros e paginação
    // ==================================================

    let whereCondition: any = { active: true };
    let takeLimit: number | undefined = undefined; // Por padrão, busca TUDO.

    // Checa se é uma busca filtrada (que sempre deve começar do ID 1)
    const isFilteredSearch = !!numeroSala || !!bloco;
    
    // --- FILTROS ---
    if (numeroSala) {
        whereCondition.ID_Ambiente = { contains: numeroSala, mode: 'insensitive' };
    }
    
    if (bloco) {
        whereCondition.bloco = { equals: bloco, mode: 'insensitive' };
    }
    
    // --- LÓGICA DE PAGINAÇÃO (apenas se NÃO houver filtros e lastRoomId > -1) ---
    if (!isFilteredSearch && lastRoomId > -1) {
        // Se a paginação está ativa, buscamos a partir do último ID.
        // Usamos um 'take' alto (ex: 50) para garantir que temos salas suficientes para encontrar 12 DISPONÍVEIS.
        whereCondition.id = { gt: lastRoomId };
    }

    // A busca inicial no Prisma
    const salas = await prisma.room.findMany({
        where: whereCondition,
        take: takeLimit, // Será 50 se paginando, ou undefined (todos) se na 1ª página ou com filtros.
        orderBy: { id: "asc" },
        include: {
            periods: {
                where: {
                    end: { gte: agoraUTC.toJSDate() }, // só períodos ainda relevantes
                }
            }
        }
    });

    // ==================================================
    // 6) Filtrar salas sem conflito
    // ==================================================
    let ultimoIdDaBusca = -1; // Usado para a próxima paginação (ID da última sala buscada no DB)
    
    const salasDisponiveis: any[] = [];

    for (const sala of salas) {
    if (salasDisponiveis.length < 12) {
        // Verifica se TODOS os horários solicitados estão livres nesta sala
        const isAvailable = horariosReq.every((req: any) => {
            
            // Verifica se ALGUM período existente no banco conflita com o horário atual da requisição
            const temConflito = sala.periods.some((dbPeriod: any) => {
                return verificarConflitoUniversal(
                    req.data,         // String 'YYYY-MM-DD' da requisição
                    req.horaInicio,   // String 'HH:mm'
                    req.horaFim,      // String 'HH:mm'
                    recorrente,       // Boolean
                    maxTimeRecorrente,// Number (meses)
                    
                    dbPeriod.start,   // Date do banco
                    dbPeriod.end,     // Date | null do banco
                    dbPeriod.isRecurring, // Boolean do banco
                    dbPeriod.maxScheduleTime
                );
            });

            return !temConflito; // Se NÃO tem conflito, está livre
        });

            if (isAvailable) {
                salasDisponiveis.push(sala);
                ultimoIdDaBusca = sala.id;
            }
        } else {
            break; // Já achamos 12 salas disponíveis, saímos do loop
        }
    }


    // ==================================================
    // 7) Retorno final
    // ==================================================
    const indiceDaUltimaSalaProcessada = salas.findIndex(sala => sala.id === ultimoIdDaBusca);

    const temMaisSalas = ultimoIdDaBusca > -1  && salasDisponiveis.length === 12 && indiceDaUltimaSalaProcessada < (salas.length - 1);

    return res.status(200).json({
        salas: salasDisponiveis.map(s => ({
            id: s.id,
            nome: s.ID_Ambiente,
            tipo: s.tipo ?? "",
            ala: s.bloco,
            status: s.active ? "active" : "inactive",
        })),
        meta: {
            ultimoIdAchado: ultimoIdDaBusca,
            temMaisSalas: temMaisSalas, 
        }
    });

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
    
    // Validação Zod
    const body = AgendamentoSchema.parse(req.body);
    const { salaId, responsavel, horarios, recorrente, maxTimeRecorrente, userId } = body;

    
    // 1. Verifica usuário autenticado
    const usuarioLogado = await prisma.user.findUnique({
      where: { login: user.login }
    });

    if (!usuarioLogado) {
      return res.status(401).json({ message: "Usuário não autenticado." });
    }

    const TZ = "America/Sao_Paulo";

    // 2. Buscar TODAS as reservas ativas desta sala para validar na memória
    // Isso evita fazer N consultas dentro do loop e garante que pegamos recorrências
    const reservasExistentes = await prisma.roomPeriod.findMany({
      where: {
        roomId: salaId,
        // Otimização: Pegar recorrentes OU eventos futuros
        OR: [
            { isRecurring: true },
            { end: { gte: new Date() } } 
        ]
      }
    });

    console.log(`\n🔎 Validando conflitos contra ${reservasExistentes.length} reservas existentes...`);

    // 3. Loop de Validação (Memória)
    for (const { data, horaInicio, horaFim } of horarios) {
      // Verifica este horário específico contra TODAS as reservas do banco
      const temConflito = reservasExistentes.some((dbPeriod) => {
        return verificarConflitoUniversal(
          data,             // 'YYYY-MM-DD' do request
          horaInicio,       // 'HH:mm'
          horaFim,          // 'HH:mm'
          recorrente,       // boolean
          maxTimeRecorrente, // number (meses estimados)

          dbPeriod.start,          // Date
          dbPeriod.end,            // Date | null
          dbPeriod.isRecurring,    // boolean
          dbPeriod.maxScheduleTime // number | null (ou Date convertido, depende do seu prisma schema)
        );
      });

      if (temConflito) {
        console.log(`⚠️ Conflito detectado para: ${data} ${horaInicio}-${horaFim}`);
        return res.status(400).json({
          message: `Conflito de horário detectado no dia ${data} (${horaInicio}-${horaFim}). Atualize a lista e tente novamente.`,
        });
      }
    }

    // ==================================================
    // 4. Preparar Dados para Salvar
    // ==================================================
    const autoApproveConfig = await prisma.systemLog.findUnique({
      where: { key: "last_clear_update" }
    });
    const autoApprove = autoApproveConfig?.autoApprove ?? false;

    const donoReserva = usuarioLogado.hierarquia === "admin" ? userId : usuarioLogado.id;
    const approved = usuarioLogado.hierarquia === "admin" ? true : autoApprove;

    console.log("\n============= CRIANDO REGISTROS =============");

    const registros = horarios.map(({ data, horaInicio, horaFim }: any) => {
      const inicioUTC = DateTime.fromISO(`${data}T${horaInicio}`, { zone: TZ }).toUTC();
      const fimUTC = DateTime.fromISO(`${data}T${horaFim}`, { zone: TZ }).toUTC();

      // 2. Calcula o Teto da Recorrência (maxScheduleTime) baseado na data DESTE item
      let maxUTC = null;

      if (recorrente && typeof maxTimeRecorrente === 'number') {
          // A mágica é aqui: Somamos X meses à data de início DESTE horário específico
          maxUTC = inicioUTC
              .plus({ months: maxTimeRecorrente })
              .endOf('day') // Garante até o fim do dia daquele mês
              .toUTC(); // Salva em UTC no banco
      }

      return {
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
    });

    // 5. Salvar no Banco
    await prisma.roomPeriod.createMany({ data: registros });

    console.log("\n✔️ AGENDAMENTO SALVO COM SUCESSO!");

    return res.status(201).json({ message: "Agendamento criado com sucesso." });

  } catch (error: any) {
    console.error("Erro ao agendar sala:", error);
    // Tratamento para erros do Zod
    if (error.errors) {
        return res.status(400).json({ message: "Dados inválidos", details: error.errors });
    }
    return res.status(500).json({ message: "Erro interno ao agendar sala." });
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
