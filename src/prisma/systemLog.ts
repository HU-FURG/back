import { prisma } from "../prisma/client";

/**
 * Busca ou cria uma chave de controle no SystemLog
 */
export async function getSystemLog(key: string) {
  let log = await prisma.systemLog.findUnique({ where: { key } });
  if (!log) {
    log = await prisma.systemLog.create({
      data: { key, value: null },
    });
  }
  return log;
}

/**
 * Atualiza a data de execução de uma chave
 */
export async function updateSystemLog(key: string, value?: string) {
  return prisma.systemLog.upsert({
    where: { key },
    update: { value, updatedAt: new Date() },
    create: { key, value },
  });
}
