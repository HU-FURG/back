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
