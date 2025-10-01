import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Lista de blocos possíveis
const blocos = ["Bloco A",
    "Bloco B",
    "Bloco C",
    "Bloco D"];

function getRandomBloco() {
  return blocos[Math.floor(Math.random() * blocos.length)];
}

function getRandomTipo() {
  const tipos = [    "Comum",
    "Reunião",
    "Estrutura Especfica1",
    "Estrutura Especfica2",
    "Estrutura Especfica3"];
  return tipos[Math.floor(Math.random() * tipos.length)];
}

async function main() {
  console.log("Gerando salas aleatórias...");

  const salasData = [];
  const totalSalas = 100; // por exemplo, 30 salas

  for (let i = 0; i < totalSalas; i++) {
    const numero = Math.floor(Math.random() * 900) + 100; // 100 a 999
    const bloco = getRandomBloco()
    salasData.push({
      number: numero.toString(),
      bloco: bloco,
      tipo: getRandomTipo(),
      description: `Sala ${numero} do bloco ${bloco}`,
      active: true,
    });
  }

  await prisma.room.createMany({
    data: salasData,
    skipDuplicates: true,
  });

  console.log(`${totalSalas} salas criadas`);

// Criar ou buscar o usuário admin
const user = await prisma.user.upsert({
  where: { login: "admin" },
  update: {},
  create: { login: "admin", senha: "admin", hierarquia: "admin" },
});

  // Criar reservas aleatórias
  console.log("Criando reservas aleatórias...");

  const todasSalas = await prisma.room.findMany({ select: { id: true } });
  const hoje = new Date();

  for (let i = 0; i < 500; i++) {
    const room = todasSalas[Math.floor(Math.random() * todasSalas.length)];
    const diaOffset = Math.floor(Math.random() * 30); // próximos 30 dias
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() + diaOffset);
    inicio.setHours(Math.floor(Math.random() * 8) + 12, 0, 0, 0);

    const fim = new Date(inicio);
    fim.setHours(fim.getHours() + Math.floor(Math.random() * 4) + 4);

    await prisma.roomPeriod.create({
      data: {
        roomId: room.id,
        userId: user.id,
        nome: `Pessoa ${ Math.floor(Math.random() * 10) + 1}`,
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
