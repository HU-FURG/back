import { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { z } from "zod";


// Função de Listagem (já estava pronta, mantida aqui para contexto)
export async function listReschedule(req: Request, res: Response) {
  const schema = z.object({
    page: z.string().optional(),
    bloco: z.string().optional(),
    number: z.string().optional(),
    tipo: z.string().optional(),
    date: z.string().optional(),
  });

  try {
    const { page, bloco, number, tipo, date } = schema.parse(req.query);
    const pageSize = 12;
    const currentPage = parseInt(page || "1", 10);
    const skip = (currentPage - 1) * pageSize;

    const filters: any = {};
    
    // Filtro de data (opcional, se quiser filtrar quando o template foi criado/arquivado)
    if (date) {
      const startOfDay = new Date(date + "T00:00:00");
      const endOfDay = new Date(date + "T23:59:59");
      filters.archivedAt = { gte: startOfDay, lte: endOfDay };
    }

    if (bloco) filters.roomBloco = { contains: bloco, mode: "insensitive" };
    if (number) filters.roomIdAmbiente = { contains: number, mode: "insensitive" };
    
    // Importante: Aqui você pode filtrar para não mostrar os que já foram "Reagendados" 
    // se você decidir marcar o motivo depois. Por enquanto, traz tudo.

    const total = await prisma.roomScheduleTemplate.count({ where: filters });

    const agendas = await prisma.roomScheduleTemplate.findMany({
      where: filters,
      orderBy: { archivedAt: "desc" }, // Mostra os mais recentes primeiro
      skip,
      take: pageSize,
    });

    return res.json({
      data: agendas,
      total,
      currentPage,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Erro ao listar reagendamentos:", error);
    return res.status(500).json({ error: "Erro interno do servidor" });
  }
}

// --- AQUI ESTÁ A LÓGICA DO BOTÃO FINALIZAR ---
export async function createReschedule(req: Request, res: Response) {
  // 1. Validação dos dados que vêm do Modal
  const schema = z.object({
    templateId: z.number(), // O ID do card que clicamos
    isRecurring: z.boolean().optional(), // O toggle "Repetir semanalmente"
    schedules: z.array(
      z.object({
        date: z.string(),      // ex: "2025-02-21"
        startTime: z.string(), // ex: "14:00"
        endTime: z.string(),   // ex: "15:00"
      })
    ).min(1, "É necessário selecionar pelo menos um horário."),
  });

  try {
    const { templateId, schedules, isRecurring } = schema.parse(req.body);

    // 2. Buscar as informações originais no Template (Histórico)
    const template = await prisma.roomScheduleTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return res.status(404).json({ error: "Registro de reagendamento não encontrado." });
    }

    // 3. Encontrar o ID real da sala na tabela Room
    // O template guarda apenas o nome/código da sala (string), precisamos do ID (int)
    const room = await prisma.room.findUnique({
      where: { ID_Ambiente: template.roomIdAmbiente },
    });

    if (!room) {
      return res.status(404).json({ error: `A sala ${template.roomIdAmbiente} não existe mais no sistema.` });
    }

    // 4. Criar os novos agendamentos (Transação para garantir que salva tudo ou nada)
    await prisma.$transaction(async (tx) => {
      for (const schedule of schedules) {
        // Montar objetos de data completos
        const startDateTime = new Date(`${schedule.date}T${schedule.startTime}:00`);
        const endDateTime = new Date(`${schedule.date}T${schedule.endTime}:00`);

        // Validação extra de segurança: Data final deve ser maior que inicial
        if (endDateTime <= startDateTime) {
          throw new Error(`Horário inválido no dia ${schedule.date}: Fim deve ser após o início.`);
        }

        // Cria o registro OFICIAL na tabela RoomPeriod
        await tx.roomPeriod.create({
          data: {
            //roomId: room.id,
            //userId: template.userId, // Mantém o dono original
            room: {connect: {id:room.id} },
            createdBy: {connect: {id:template.userId} },
            //nome: template.nome,     // Mantém o nome original
            
            start: startDateTime,
            end: endDateTime,
            
            isRecurring: isRecurring || false,
            approved: true, // Como é feito pelo admin, já entra aprovado
            startSchedule: startDateTime,
            endSchedule: endDateTime,
            // Opcional: Se quiser linkar que veio de um template, precisaria de um campo na RoomPeriod
          },
        });
      }

      
      await tx.roomScheduleTemplate.update({
        where: { id: templateId },
        data: { reason: `${template.reason} (Reagendado)` }
      });
      
    });

    return res.status(201).json({ message: "Reagendamento realizado com sucesso!" });

  } catch (error) {
    // Tratamento de erros (Zod ou Banco)
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error("Erro ao criar reagendamento:", error);
    return res.status(500).json({ error: "Erro interno ao processar reagendamento." });
  }
}