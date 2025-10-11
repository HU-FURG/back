import { prisma } from "./client";
import { Prisma } from "@prisma/client";
const templateData: Prisma.RoomScheduleTemplateCreateManyInput[] = [];

// Função utilitária para calcular a diferença em minutos entre duas datas
function durationInMinutes(start: Date, end: Date): number {
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60));
}

export const clearPeriodsandUpdate = async () => {
    const agora = new Date();
    // 💡 Otimização: Calcular o offset de 7 dias uma vez.
    const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000; 

    try {
        await prisma.$transaction(async (tx) => {
            
            // 1. BUSCA POR TODOS OS PERÍODOS EXPIRADOS
            // Garante que os campos ID_Ambiente e bloco (Room) e login (User) estão inclusos.
            const expiredPeriods = await tx.roomPeriod.findMany({
                where: {
                    end: { lt: agora }, // Filtra onde o FIM é menor que a hora atual
                },
                include: {
                    room: {
                        select: {
                            ID_Ambiente: true, // Corresponde ao campo do modelo Room
                            bloco: true,      // Corresponde ao campo do modelo Room
                        },
                    },
                    user: {
                        select: {
                            login: true,      // Corresponde ao campo do modelo User
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
            const historyData: any[] = []; // Usamos 'any' temporariamente para evitar erros complexos do TS/Prisma
            // Tipagem explícita para o Template (opcional, mas bom para clareza)

            for (const period of expiredPeriods) {
                const roomIdAmbiente = period.room.ID_Ambiente; // Usamos o nome do campo do Room
                const roomBloco = period.room.bloco;             // Usamos o nome do campo do Room
                const userName = period.user?.login;
                const duration = durationInMinutes(period.start, period.end);

                // --- 2. PREPARAR DADOS PARA ARQUIVO E TEMPLATE ---
                
                // 2a. Dados para Histórico (PeriodHistory)
                // ✅ CORREÇÃO: Alinhar as chaves (Keys) com o modelo PeriodHistory (roomIdAmbiente, roomBloco)
                historyData.push({
                    roomIdAmbiente: roomIdAmbiente, // Nome de campo do PeriodHistory
                    roomBloco: roomBloco,           // Nome de campo do PeriodHistory
                    userName: userName ?? "Usuário Deletado/Não Registrado", // userName aceita 'null' no schema, mas String? no objeto
                    start: period.start,
                    end: period.end,
                    nome: period.nome,
                    archivedAt: new Date(),
                });

                // 2b. Dados para Template de Re-agendamento (RoomScheduleTemplate)
                // ✅ CORREÇÃO: Alinhar as chaves com o modelo RoomScheduleTemplate
                templateData.push({
                    userId: period.userId,          // userId é Int? (number | null) no schema
                    nome: period.nome,
                    durationInMinutes: duration,
                    roomIdAmbiente: roomIdAmbiente, // Nome de campo do RoomScheduleTemplate
                    roomBloco: roomBloco,           // Nome de campo do RoomScheduleTemplate
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
                // ✅ CORREÇÃO: Removendo o cast 'as any' se as chaves estiverem corretas (ver 2a)
                await tx.periodHistory.createMany({ data: historyData });
            }

            // 4b. Criar Templates de Re-agendamento (RoomScheduleTemplate)
            if (templateData.length > 0) {
                // ✅ CORREÇÃO: Removendo o mapeamento 'validTemplateData' e o 'as any'.
                // O templateData já tem o tipo correto com userId: number | null.
                await tx.roomScheduleTemplate.createMany({ data: templateData }); 
            }


            // 4c. Deletar Períodos Não Recorrentes Antigos
            if (nonRecurrentToDeleteIds.length > 0) {
                await tx.roomPeriod.deleteMany({
                    where: { id: { in: nonRecurrentToDeleteIds } },
                });
            }

            // 4d. Atualizar Períodos Recorrentes (Próxima Semana)
            for (const period of recurrentToUpdate) {
                // ✅ Otimização: Usando o offset calculado em milissegundos
                const novaStart = new Date(period.start.getTime() + sevenDaysInMs);
                const novaEnd = new Date(period.end.getTime() + sevenDaysInMs);

                await tx.roomPeriod.update({
                    where: { id: period.id },
                    data: {
                        start: novaStart,
                        end: novaEnd,
                    },
                });
            }
          console.log(`[✅] Processamento concluído. Períodos arquivados: ${expiredPeriods.length}.`);
        });

    } catch (error) {
        console.error("[❌] Erro crítico ao processar períodos:", error);
    }
};