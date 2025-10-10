import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";

const prisma = new PrismaClient();

async function main() {
  // 1️⃣ Lê e insere as salas do CSV
  const csvPath = path.join(__dirname, "lista.csv");
  const fileContent = fs.readFileSync(csvPath, "utf-8");

  const records: any[] = [];
  await new Promise<void>((resolve, reject) => {
    parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ",", // ajuste se for ";" no CSV
      trim: true,
    })
      .on("data", (row) => records.push(row))
      .on("end", () => resolve())
      .on("error", (err) => reject(err));
  });

  const salasData = records.map((sala) => ({
    ID_Ambiente: sala.ID_Ambiente,
    bloco: sala.BLOCO,
    especialidade: sala.ESPECIALIDADE,
    tipo: sala.TIPO,
    banheiro: sala.BANHEIRO.toUpperCase() === "SIM",
    ambiente: sala.AMBIENTE,
    area: parseFloat(sala.ÁREA.replace(",", ".")),
    active: true,
  }));

  await prisma.room.createMany({
    data: salasData,
    skipDuplicates: true,
  });

  console.log(`${salasData.length} salas criadas!`);

  // 2️⃣ Criar ou buscar o usuário admin
  const user = await prisma.user.upsert({
    where: { login: "admin" },
    update: {},
    create: { login: "admin", senha: "admin", hierarquia: "admin" },
  });

  // 3️⃣ Criar reservas aleatórias
  console.log("Criando reservas aleatórias...");

  const todasSalas = await prisma.room.findMany({ select: { id: true } });
  const hoje = new Date();

  for (let i = 0; i < 500; i++) {
    const room = todasSalas[Math.floor(Math.random() * todasSalas.length)];
    const diaOffset = Math.floor(Math.random() * 30); // próximos 30 dias
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() + diaOffset);
    inicio.setHours(Math.floor(Math.random() * 8) + 8, 0, 0, 0); // entre 8h e 15h

    const fim = new Date(inicio);
    fim.setHours(fim.getHours() + Math.floor(Math.random() * 4) + 1); // duração 1 a 4h

    await prisma.roomPeriod.create({
      data: {
        roomId: room.id,
        userId: user.id,
        nome: `Pessoa ${Math.floor(Math.random() * 50) + 1}`,
        start: inicio,
        end: fim,
        isRecurring: Math.random() < 0.3, // 30% recorrente
      },
    });
  }

  console.log("Reservas criadas!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
