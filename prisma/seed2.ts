import { Hierarquia, PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // 1️⃣ Lê e insere as salas do CSV
  const csvPath = path.join(__dirname, "lista.csv");
  const fileContent = fs.readFileSync(csvPath, "utf-8");

  console.log("delete todos")
  // await prisma.roomPeriod.deleteMany({where:{userId: 1}})
  //await prisma.user.deleteMany({where: {NOT: {id: 1}}})
  

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
  const hashedPassword = await bcrypt.hash("1234", 10);
  
  //  Criar usuários comuns
  const usuariosComuns = Array.from({ length: 50 }, (_, i) => ({
    login: `user${i + 1}`,
    senha: hashedPassword,
    hierarquia: Hierarquia.user,
    nome: `user ${i + 1}`,
  }));

  // await prisma.user.createMany({
  //   data: usuariosComuns,
  //   skipDuplicates: true, 
  // });

  console.log(`${usuariosComuns.length} usuários criados!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
