import { prisma } from "./client";

// Função utilitária para calcular a diferença em minutos entre duas datas
function durationInMinutes(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60));
}

export const clearPeriodsandUpdate = async () => {
    const agora = new Date();

    try {
        await prisma.$transaction(async (tx) => {
            
            // 1. BUSCA POR TODOS OS PERÍODOS EXPIRADOS
            // Usa 'end' para garantir que o agendamento já terminou.
            const expiredPeriods = await tx.roomPeriod.findMany({
                where: {
                    end: { lt: agora }, // Filtra onde o FIM é menor que a hora atual
                },
                include: {
                    room: {
                        select: {
                            number: true,
                            ala: true,
                        },
                    },
                    user: {
                        select: {
                            login: true,
                        },
                    },
                },
            });

            if (expiredPeriods.length === 0) {
                console.log("[✅] Nenhuma período expirado encontrado para processar.");
                return;
            }

            const recurrentToUpdate: typeof expiredPeriods = [];
            const nonRecurrentToDeleteIds: number[] = [];

            // Arrays para operações bulk
            const historyData = [];
            const templateData = [];

            for (const period of expiredPeriods) {
                const roomNumber = period.room.number;
                const roomAla = period.room.ala;
                const userName = period.user?.login;
                const duration = durationInMinutes(period.start, period.end);

                // --- 2. PREPARAR DADOS PARA ARQUIVO E TEMPLATE ---
                
                // 2a. Dados para Histórico (PeriodHistory)
                historyData.push({
                    roomNumber: roomNumber,
                    roomAla: roomAla,
                    userName: userName ?? "Usuário Deletado/Não Registrado",
                    start: period.start,
                    end: period.end,
                    nome: period.nome,
                    archivedAt: new Date(),
                });

                // 2b. Dados para Template de Re-agendamento (RoomScheduleTemplate)
                templateData.push({
                    userId: period.userId,
                    nome: period.nome,
                    durationInMinutes: duration,
                    roomNumber: roomNumber,
                    roomAla: roomAla,
                    originalStart: period.start,
                    originalEnd: period.end,
                    reason: "Vencido", 
                    archivedAt: new Date(),
                });

                // --- 3. SEPARAR PARA UPDATE OU DELETE para recorrente ---

                if (period.isRecurring) {
                    recurrentToUpdate.push(period);
                } else {
                    nonRecurrentToDeleteIds.push(period.id);
                }
            }

            // --- 4. EXECUTAR OPERAÇÕES EM BULK ---

            // 4a. Criar Histórico (PeriodHistory)
            if (historyData.length > 0) {
                await tx.periodHistory.createMany({ data: historyData });
            }

            // 4b. Criar Templates de Re-agendamento (RoomScheduleTemplate)
            // Filtramos templatesData para remover userId nulo caso o Prisma exija
            const validTemplateData = templateData.map(t => ({
                ...t,
                userId: t.userId ?? undefined, // Se userId for Int?, deve ser number ou undefined
            }));
            if (validTemplateData.length > 0) {
                 await tx.roomScheduleTemplate.createMany({ data: validTemplateData as any }); // Uso de 'as any' para lidar com tipos complexos
            }


            // 4c. Deletar Períodos Não Recorrentes Antigos
            if (nonRecurrentToDeleteIds.length > 0) {
                await tx.roomPeriod.deleteMany({
                    where: { id: { in: nonRecurrentToDeleteIds } },
                });
            }

            // 4d. Atualizar Períodos Recorrentes (Próxima Semana)
            for (const period of recurrentToUpdate) {
                const novaStart = new Date(period.start);
                const novaEnd = new Date(period.end);

                // Avança exatamente 7 dias (próxima semana)
                novaStart.setDate(novaStart.getDate() + 7);
                novaEnd.setDate(novaEnd.getDate() + 7);

                await tx.roomPeriod.update({
                    where: { id: period.id },
                    data: {
                        start: novaStart,
                        end: novaEnd,
                    },
                });
            }
          console.log(`[✅] Processamento concluído. Períodos arquivados: ${expiredPeriods.length }.`);
        });

    } catch (error) {
        console.error("[❌] Erro crítico ao processar períodos:", error);
    }
};
