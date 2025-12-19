import { Hierarquia, PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

function normalizeEspecialidade(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}

async function main() {
  // 1️⃣ Lê e insere as salas do CSV
  const csvPath = path.join(__dirname, "lista.csv");
  const fileContent = fs.readFileSync(csvPath, "utf-8");

  console.log("delete todos")


  // await prisma.roomPeriod.deleteMany({where:{userId: 1}})
  // await prisma.user.deleteMany({where: {NOT: {id: 1}}})
  
  const especialidades = await prisma.especialidade.findMany({
    select: {
      id: true,
      nome: true,
    },
  })

  const especialidadeMap = new Map<string, number>()

  especialidades.forEach((e) => {
    especialidadeMap.set(normalizeEspecialidade(e.nome), e.id)
  })

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

    const salasData = records.map((sala) => {
    const especialidadeNome = normalizeEspecialidade(sala.ESPECIALIDADE)

    const especialidadeId =
      especialidadeMap.get(especialidadeNome) ??
      especialidadeMap.get("any")

    if (!especialidadeId) {
      throw new Error(`Especialidade não encontrada: ${sala.ESPECIALIDADE}`)
    }

    return {
      ID_Ambiente: sala.ID_Ambiente,
      bloco: sala.BLOCO,
      especialidadeId,
      tipo: sala.TIPO,
      banheiro: sala.BANHEIRO.toUpperCase() === "SIM",
      ambiente: sala.AMBIENTE,
      area: parseFloat(sala.ÁREA.replace(",", ".")),
      active: true,
    }
  })


  await prisma.room.createMany({
    data: salasData,
    skipDuplicates: true, 
  });

  console.log(`${salasData.length} salas criadas!`);
  const hashedPassword = await bcrypt.hash("1234", 10);
  
  // ===============================
// 👤 CRIAR USUÁRIOS A PARTIR DO CSV
// ===============================

const csvPathUser = path.join(__dirname, "pro.csv");
const fileContentUser = fs.readFileSync(csvPathUser, "utf-8");

const recordsUser: any[] = [];
  await new Promise<void>((resolve, reject) => {
      parse(fileContentUser, {
        columns: true,
        skip_empty_lines: true,
        delimiter: ",", // ajuste se for ";" no CSV
        trim: true,
      })
        .on("data", (row) => recordsUser.push(row))
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

const usuariosData = recordsUser.map((row) => {
  const especialidadeNome = normalizeEspecialidade(row.especialidade)

  const especialidadeId =
    especialidadeMap.get(especialidadeNome) ??
    especialidadeMap.get("any")

  if (!especialidadeId) {
    throw new Error(`Especialidade inválida no CSV: ${row.especialidade}`)
  }
  const userlogin = row.profissional.toLowerCase().replace(/\s+/g, ".");
  return {
    login: userlogin,
    senha: hashedPassword,
    hierarquia: Hierarquia.user,
    nome: row.profissional,
    descricao: row.ocupação,
    especialidadeId,
  }
})

await prisma.user.createMany({
  data: usuariosData,
  skipDuplicates: true,
})

console.log(`✅ ${usuariosData.length} usuários criados a partir do CSV`)
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
