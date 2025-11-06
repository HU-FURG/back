import { DateTime } from "luxon";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
const fusoHorario = "America/Sao_Paulo";

// Gera um nome aleatório fictício
function gerarNomeAleatorio() {
  const nomes = [
    "Ana Silva", "Carlos Souza", "Maria Oliveira", "João Santos",
    "Fernanda Lima", "Lucas Ribeiro", "Juliana Alves", "Pedro Carvalho",
    "Camila Rocha", "Rafael Martins",
  ];
  const sobrenomeExtra = ["Jr.", "Neto", "Filho", "da Costa", "Pereira"];
  const nomeBase = nomes[Math.floor(Math.random() * nomes.length)];
  const extra = Math.random() > 0.7 ? " " + sobrenomeExtra[Math.floor(Math.random() * sobrenomeExtra.length)] : "";
  return nomeBase + extra;
}

// Função que retorna todas as salas
async function listarSalas() {
  return await prisma.room.findMany({
    select: {
      id: true,
      ID_Ambiente: true,
      bloco: true,
    },
  });
}

export const main = async (inicio: string, fim: string) => {
  const dtInicio = DateTime.fromISO(inicio, { zone: fusoHorario }).startOf("day");
  const dtFim = DateTime.fromISO(fim, { zone: fusoHorario }).endOf("day");

  const salas = await listarSalas();
  await prisma.periodHistory.deleteMany({});
  for (const sala of salas) {
    let diaAtual = dtInicio;
    const nome = gerarNomeAleatorio();
    const dadosParaSalvar: any[] = []; // lista de registros da sala
    console.log("sala", sala)
    while (diaAtual <= dtFim) {
      const weekday = diaAtual.weekday;
      if (weekday !== 6 && weekday !== 7) { // pula sábados e domingos
        const start = diaAtual.set({ hour: 8, minute: 0 });
        const end = diaAtual.set({ hour: 18, minute: 0 });
        const durationMinutes = end.diff(start, "minutes").minutes;

        const used = Math.random() > 0.3; // 70% chance de uso
        let startService = null;
        let endService = null;
        let actualDurationMinutes = null;

        if (used) {
          const atraso = Math.floor(Math.random() * (durationMinutes / 3));
          startService = start.plus({ minutes: atraso });
          endService = startService.plus({ minutes: Math.floor(Math.random() * (durationMinutes - atraso)) });
          if (endService > end) endService = end;

          actualDurationMinutes = endService.diff(startService, "minutes").minutes;
        }

        dadosParaSalvar.push({
          roomIdAmbiente: sala.ID_Ambiente,
          roomBloco: sala.bloco,
          userName: "AleatorioTeste",
          start: start.toJSDate(),
          end: end.toJSDate(),
          weekday,
          nome,
          used,
          startService: startService?.toJSDate() ?? null,
          endService: endService?.toJSDate() ?? null,
          durationMinutes: used ? durationMinutes : null,
          actualDurationMinutes,
        });
      }

      diaAtual = diaAtual.plus({ days: 1 });
    }

    // Inserção em batch para a sala
    if (dadosParaSalvar.length > 0) {
      await prisma.periodHistory.createMany({ data: dadosParaSalvar });
    }
  }

  return { sucesso: true, salasProcessadas: salas.length };
};


main("2025-09-01","2025-09-30")
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
