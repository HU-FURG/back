import bcrypt from "bcrypt";
import { prisma } from "./client";

async function main() {
  const hashedPassword = await bcrypt.hash("admin", 10);

  await prisma.user.create({
    data: {
      login: "admin",
      senha: hashedPassword,
      hierarquia: "admin",
      nome: "Conta Administrativa"
    },
  });

  console.log("Admin criado com sucesso!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

  
