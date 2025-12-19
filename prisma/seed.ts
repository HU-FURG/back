import bcrypt from "bcrypt"
import { prisma } from "./client"

export const especialidadesSeed: string[] = [
  // Sistema
  "Administrador",
  "Any",

  // Base institucional
  "CID",

  // Clínicas médicas
  "Clínica Geral",
  "Cardiologia",
  "Endocrinologia",
  "Gastroenterologia",
  "Pneumologia",
  "Pneumologia Pediátrica",
  "Neurologia",
  "Hematologia",
  "Oncologia",
  "Infectologia",
  "Nefrologia",
  "Reumatologia",
  "Geriatria",
  "Genética",

  // Pediatria
  "Pediatria",
  "Residente Pediatria",

  // Gineco / obstetrícia
  "Ginecologia",
  "Cirurgia Ginecológica",

  // Cirurgias
  "Cirurgia Geral",
  "Cirurgia Pediátrica",
  "Cirurgia Vascular",
  "Cirurgia Torácica",
  "Cirurgia Plástica",
  "Cirurgia Cabeça e Pescoço",

  // Outras especialidades médicas
  "Oftalmologia",
  "Otorrinolaringologia",
  "Ortopedia",
  "Urologia",
  "Anestesiologia",
  "Endoscopia",

  // Saúde mental
  "Psiquiatria",
  "Psicologia",

  // Odonto
  "Odontologia",

  // Multidisciplinar
  "Enfermagem",
  "Nutrição",
  "Fonoaudiologia",
  "Assistência Social",
  "Educação Física",
  "Medicina do Trabalho",
  "Medicina da Família",
]

async function seedEspecialidades() {
  for (const nome of especialidadesSeed) {
    await prisma.especialidade.upsert({
      where: { nome },
      update: {},
      create: { nome },
    })
  }

  console.log("✅ Especialidades criadas/atualizadas")
}

async function seedAdmin() {
  const hashedPassword = await bcrypt.hash("admin", 10)

  const adminEspecialidade = await prisma.especialidade.findUnique({
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
