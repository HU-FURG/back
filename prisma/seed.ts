import bcrypt from "bcrypt"
import { prisma } from "./client"

export const especialidadesUser: string[] = [
  // Sistema
  "Administrador",
  "Any",

  "pneumologista",
  "reumatologista",
  "cirurgia pediatrica",
  "dermatologia",
  "odontologista",
  "enfermeiro",
  "cirurgia ginecologica",
  "psiquiatrica",
  "nutricionista",
  "fonoaudiologia",
  "psicologia",
  "gastrologista",
  "assistente social",
  "pneumologista pediatrica",
  "anestesiologista",
  "hematologista",
  "residente pediatria",
  "oftalmologista",
  "ginecologista",
  "ortopedista",
  "cirurgia cabeça e pescoço",
  "clinico geral",
  "cirurgia geral",
  "cirurgia vascular",
  "nefrologista",
  "medico do trabalho",
  "neurologista",
  "endoscopista",
  "cardiologista",
  "infectologista",
  "urologista",
  "pediatra",
  "otorrinologista",
  "endocrinologista",
  "medico da familia",
  "educador fisico",
  "cirurgia plastica",
  "cirurgia toracica",
  "geneticista",
  "geriatria",
  "medico pediatra"
]

export const especialidadeRooms: string[] = [
    "CID",
    "Odontologia",
    "Oftalmologia",
    "Cirurgia",
    "Gastroenterologia",
    "Pneumologia",
    "Urologia",
    "Oncologia",
    "Neurologia",
    "Clínico",
    "Otorrino",
    "Hematologia",
    "Pediatria",
    "Ginecologia",
    "Traumatologia",
    "Infectologia"
]

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
}


async function seedEspecialidades() {
  for (const nome of especialidadesUser) {
    await prisma.especialidadeUser.upsert({
      where: { nome },
      update: {},
      create: { nome },
    })
  }

  console.log("✅ Especialidades criadas/atualizadas")
}
async function seedEspecialidadesSala() {
  for (const nome of especialidadeRooms) {
    await prisma.especialidadeRoom.upsert({
      where: { nome },
      update: {
        especialidadesAceitas: "[]",
      },
      create: {
        nome,
        especialidadesAceitas: "[]",
      },
    })
  }

  console.log("✅ Especialidades de sala criadas")
}


async function seedAdmin() {
  const hashedPassword = await bcrypt.hash("admin", 10)

  const adminEspecialidade = await prisma.especialidadeUser.findUnique({
    where: { nome: "Administrador" },
  })

  if (!adminEspecialidade) {
    throw new Error("Especialidade Administrador não encontrada")
  }

  await prisma.user.upsert({
    where: { login: "admin" },
    update: {
      hierarquia: "admin",
      especialidadeId: adminEspecialidade.id,
    },
    create: {
      login: "admin",
      senha: hashedPassword,
      hierarquia: "admin",
      nome: "Conta Administrativa",
      especialidadeId: adminEspecialidade.id,
    },
  })

  console.log("✅ Usuário admin criado/atualizado")
}

async function main() {
  await seedEspecialidades()
  await seedEspecialidadesSala()
  await seedAdmin()
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
