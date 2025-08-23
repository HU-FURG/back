import bcrypt from "bcrypt";
import { prisma } from "../src/prisma/client";

async function main() {
  const hashedPassword = await bcrypt.hash("admin", 10);

  await prisma.user.create({
    data: {
      login: "admin",
      senha: hashedPassword,
      hierarquia: "admin",
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
