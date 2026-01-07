import { DateTime } from "luxon";

interface HorarioReq {
  data: string;
  horaInicio: string;
  horaFim: string;
}

interface ValidationResult {
  ok: boolean;
  error?: string;
}

const TZ = "America/Sao_Paulo";

export function validateHorarios(horarios: any[], recorrente: boolean) {
  if (!horarios || horarios.length === 0) {
    return { ok: false, error: "Nenhum horário enviado." };
  }

  // Converter tudo para Luxon
  const horariosLuxon = horarios.map(h => {
    const inicio = DateTime.fromISO(`${h.data}T${h.horaInicio}`, { zone: TZ });
    const fim = DateTime.fromISO(`${h.data}T${h.horaFim}`, { zone: TZ });

    return {
      ...h,
      inicio,
      fim,
      diaSemana: inicio.weekday, // 1 segunda ... 7 domingo
    };
  });

  // ------------------------------------------------------------------
  // 🔹 1) Validar horários básicos
  // ------------------------------------------------------------------
  for (const h of horariosLuxon) {
    if (!h.inicio.isValid || !h.fim.isValid) {
      return { ok: false, error: "Alguma das datas ou horários é inválido." };
    }

    if (h.inicio >= h.fim) {
      return { ok: false, error: "Horário de início não pode ser maior ou igual ao fim." };
    }
  }

  // ------------------------------------------------------------------
  // 🔹 2) Se NÃO for recorrente, não fazer regras extras
  // ------------------------------------------------------------------
  if (!recorrente) {
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // 🔹 3) Regras específicas para recorrência
  // ------------------------------------------------------------------

  // Group por dia da semana
  const porDiaSemana: Record<number, any[]> = {};
  for (const h of horariosLuxon) {
    if (!porDiaSemana[h.diaSemana]) porDiaSemana[h.diaSemana] = [];
    porDiaSemana[h.diaSemana].push(h);
  }

  // -------- (Regra 1) Mesmo dia da semana: horários não podem se sobrepor --------
  for (const dia in porDiaSemana) {
    const lista = porDiaSemana[dia].sort((a, b) => a.inicio.toMillis() - b.inicio.toMillis());

    for (let i = 0; i < lista.length - 1; i++) {
      const atual = lista[i];
      const prox = lista[i + 1];

      if (prox.inicio < atual.fim) {
        return {
          ok: false,
          error: `Os horários do dia ${atual.inicio.toFormat("cccc")} estão se sobrepondo.`,
        };
      }
    }
  }

  // TUDO OK
  return { ok: true };
}

/** Estrutura de um período de agendamento existente (do banco de dados). */
interface Period {
    start: Date;
    end: Date;
    isRecurring: boolean;
    // ... outras propriedades do seu período
}

/** Estrutura de um horário solicitado na requisição, já convertido para DateTime UTC. */
interface ReqHorario {
    inicio: DateTime;
    fim: DateTime;
    diaSemana: number; // 1 (Seg) a 7 (Dom)
    // ... outras propriedades
}

// ============================================================================
// 2) Lógica Universal de Conflito (O "Core" da verificação)
// ============================================================================

/**
 * Verifica se existe conflito entre um pedido (req) e um registro do banco (db).
 * Trata todos os casos: Pontual x Pontual, Recorrente x Recorrente, Híbridos.
 */
export function verificarConflitoUniversal(
  // --- DADOS DA REQUISIÇÃO ---
  reqDataStr: string,       // "YYYY-MM-DD"
  reqHoraInicio: string,    // "HH:mm"
  reqHoraFim: string,       // "HH:mm"
  reqIsRecorrente: boolean,
  reqMaxRecurrenceEnd: string | null, 

  // --- DADOS DO BANCO ---
  dbStart: Date,            
  dbEnd: Date | null,       
  dbIsRecorrente: boolean,
  dbMaxRecurrenceEnd: Date | null // SE FOR NULL = INFINITO
): boolean {

  // =======================================================================
  // A. PREPARAÇÃO DAS DATAS E VIGÊNCIA (AQUI ESTAVA O ERRO DO ZERO)
  // =======================================================================

  const reqInicioDT = DateTime.fromISO(`${reqDataStr}T${reqHoraInicio}`, { zone: TZ });
  const reqVigenciaInicio = reqInicioDT.startOf('day');
  
  // --------------------------------------------------------
  // CORREÇÃO 1: Tratar reqMaxMeses === 0 como Infinito
  // --------------------------------------------------------
  let reqVigenciaFim: DateTime;

  if (reqIsRecorrente) {
    if (!reqMaxRecurrenceEnd) {
      // recorrência infinita
      reqVigenciaFim = reqInicioDT.plus({ years: 100 }).endOf("day");
    } else {
      reqVigenciaFim = DateTime
        .fromISO(reqMaxRecurrenceEnd, { zone: TZ })
        .endOf("day");
    }
  } else {
    reqVigenciaFim = reqInicioDT.endOf("day");
  }


  // --------------------------------------------------------
  // PREPARAÇÃO DO BANCO (DB)
  // --------------------------------------------------------
  const dbInicioDT = DateTime.fromJSDate(dbStart).setZone(TZ);
  
  let dbVigenciaFim: DateTime;

  if (dbIsRecorrente) {
      // CORREÇÃO 2: Se dbMaxRecurrenceEnd for null ou invalido, considera Infinito
      if (!dbMaxRecurrenceEnd) {
          dbVigenciaFim = dbInicioDT.plus({ years: 100 }).endOf('day');
      } else {
          dbVigenciaFim = DateTime.fromJSDate(dbMaxRecurrenceEnd).setZone(TZ).endOf('day');
      }
  } else {
      // Não recorrente: usa o dbEnd ou assume mesmo dia
      dbVigenciaFim = dbEnd 
          ? DateTime.fromJSDate(dbEnd).setZone(TZ).endOf('day') 
          : dbInicioDT.endOf('day');
  }

  // LOGS PARA CONFERIR SE O ZERO VIROU "FUTURO"
  /**/
  // console.log(`\n🔍 [VIGÊNCIA DEBUG]`);
  // console.log(`   Req (${reqIsRecorrente ? 'Rec' : 'Único'} | Meses: ${reqMaxMeses}): ${reqVigenciaInicio.toISODate()} até ${reqVigenciaFim.toISODate()}`);
  // console.log(`   DB  (${dbIsRecorrente  ? 'Rec' : 'Único'}): ${dbInicioDT.toISODate()} até ${dbVigenciaFim.toISODate()}`);
  

  // =======================================================================
  // B. PREPARAÇÃO DE HORÁRIOS (TIME ONLY - Ano 2000)
  // =======================================================================
  const reqFimDT    = DateTime.fromISO(`${reqDataStr}T${reqHoraFim}`, { zone: TZ });
  const reqWeekday  = reqInicioDT.weekday; 
  const dbWeekday   = dbInicioDT.weekday;

  const baseDate = DateTime.fromISO('2000-01-01');
  const rHoraStart = baseDate.set({ hour: reqInicioDT.hour, minute: reqInicioDT.minute });
  const rHoraEnd   = baseDate.set({ hour: reqFimDT.hour, minute: reqFimDT.minute });

  const dHoraStart = baseDate.set({ hour: dbInicioDT.hour, minute: dbInicioDT.minute });
  
  // Ajuste do horário fim do DB
  let dHoraEnd;
  if (dbEnd) {
      const dbFimReal = DateTime.fromJSDate(dbEnd).setZone(TZ);
      dHoraEnd = baseDate.set({ hour: dbFimReal.hour, minute: dbFimReal.minute });
      // Se virou o dia ou bugou a hora, garante pelo menos 1 min de duração
      if (dHoraEnd <= dHoraStart) dHoraEnd = dHoraStart.plus({ minutes: 1 });
  } else {
      // Fallback padrão 1h
      dHoraEnd = dHoraStart.plus({ hours: 1 });
  }

  // =======================================================================
  // C. CHECAGENS FINAIS
  // =======================================================================
  
  // 1. DIA DA SEMANA (Só importa se algúm for recorrente)
  const algumRecorrente = reqIsRecorrente || dbIsRecorrente;
  if (algumRecorrente && reqWeekday !== dbWeekday) {
      return false; 
  }

  // 2. INTERSEÇÃO DE HORÁRIO (HH:mm)
  const horarioColide = (rHoraStart < dHoraEnd) && (rHoraEnd > dHoraStart);
  if (!horarioColide) {
      return false;
  }

  // 3. INTERSEÇÃO DE VIGÊNCIA (DATAS)
  // Agora que reqVigenciaFim está correta (com o +100 anos se for 0), essa conta funciona
  const vigenciaColide = (reqVigenciaInicio < dbVigenciaFim) && (reqVigenciaFim > dbInicioDT);
  
  return vigenciaColide;
}