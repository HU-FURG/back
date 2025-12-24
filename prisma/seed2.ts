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

async function loadEspecialidadeUserMap() {
  const especialidades = await prisma.especialidadeUser.findMany({
    select: { id: true, nome: true },
  })

  const map = new Map<string, number>()
  especialidades.forEach((e) => {
    map.set(normalizeEspecialidade(e.nome), e.id)
  })

  return map
}

async function loadEspecialidadeSalaMap() {
  const especialidades = await prisma.especialidadeRoom.findMany({
    select: { id: true, nome: true },
  })

  const map = new Map<string, number>()
  especialidades.forEach((e) => {
    map.set(normalizeEspecialidade(e.nome), e.id)
  })

  return map
}


async function main() {
  // ===============================
  // 🏥 SALAS
  // ===============================
  const csvPathSala = path.join(__dirname, "lista.csv")
  const fileContentSala = fs.readFileSync(csvPathSala, "utf-8")

  const especialidadeSalaMap = await loadEspecialidadeSalaMap()

  const salasRecords: any[] = []
  await new Promise<void>((resolve, reject) => {
    parse(fileContentSala, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ",",
      trim: true,
    })
      .on("data", (row) => salasRecords.push(row))
      .on("end", resolve)
      .on("error", reject)
  })

  const salasData = salasRecords.map((sala) => {
    const especialidadeNome = normalizeEspecialidade(sala.ESPECIALIDADE)

    const especialidadeId =
      especialidadeSalaMap.get(especialidadeNome) ??
      especialidadeSalaMap.get("cid")

    if (!especialidadeId) {
      throw new Error(`Especialidade de sala não encontrada: ${sala.ESPECIALIDADE}`)
    }

    return {
      ID_Ambiente: sala.ID_Ambiente,
      bloco: sala.BLOCO,
      especialidadeId,
      tipo: sala.TIPO,
      banheiro: sala.BANHEIRO?.toUpperCase() === "SIM",
      ambiente: sala.AMBIENTE,
      area: parseFloat(sala["ÁREA"].replace(",", ".")),
      active: true,
    }
  })

  await prisma.room.createMany({
    data: salasData,
    skipDuplicates: true,
  })

  console.log(`✅ ${salasData.length} salas criadas`)

  // ===============================
  // 👤 USUÁRIOS
  // ===============================
  const csvPathUser = path.join(__dirname, "pro.csv")
  const fileContentUser = fs.readFileSync(csvPathUser, "utf-8")

  const especialidadeUserMap = await loadEspecialidadeUserMap()

  const hashedPassword = await bcrypt.hash("1234", 10)

  const usersRecords: any[] = []
  await new Promise<void>((resolve, reject) => {
    parse(fileContentUser, {
      columns: true,
      skip_empty_lines: true,
      delimiter: ",",
      trim: true,
    })
      .on("data", (row) => usersRecords.push(row))
      .on("end", resolve)
      .on("error", reject)
  })

  const usuariosData = usersRecords.map((row) => {
    const especialidadeNome = normalizeEspecialidade(row.especialidade)

    const especialidadeId =
      especialidadeUserMap.get(especialidadeNome) ??
      especialidadeUserMap.get("any")

    if (!especialidadeId) {
      throw new Error(`Especialidade inválida no CSV: ${row.especialidade}`)
    }

    const login = row.profissional
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, ".")

    return {
      login,
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

  console.log(`✅ ${usuariosData.length} usuários criados`)
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
