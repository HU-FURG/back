import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Função auxiliar para embaralhar array
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Função para pegar N dias da semana aleatórios únicos (1=Segunda, 5=Sexta)
function getRandomWeekdays(count: number): number[] {
  const days = [1, 2, 3, 4, 5];
  const shuffled = shuffleArray(days);
  return shuffled.slice(0, count);
}

async function main() {
  console.log("🧹 Limpando apenas tabelas de relatório...");
  await prisma.roomStats.deleteMany({});
  await prisma.dailyRoomReport.deleteMany({});
  
  const rawRooms = await prisma.room.findMany();
  const rawUsers = await prisma.user.findMany();

  if (rawRooms.length === 0 || rawUsers.length === 0) {
    console.error("❌ ERRO: Faltam dados base (Rooms ou Users).");
    return;
  }

  // Embaralha as listas para garantir aleatoriedade
  const availableRooms = shuffleArray([...rawRooms]);
  const availableUsers = shuffleArray([...rawUsers]);

  console.log(`✅ Base carregada. Salas: ${availableRooms.length} | Usuários: ${availableUsers.length}`);

  // ---------------------------------------------------------
  // 1️⃣ GERAÇÃO DE AGENDAMENTOS DUPLOS (Manhã e Tarde)
  // ---------------------------------------------------------
  console.log("📅 Iniciando simulação com DOIS usuários por sala (Manhã/Tarde)...");

  const reportsToCreate: any[] = [];
  
  const currentYear = new Date().getFullYear();
  const startDate = new Date(currentYear, 5, 1); // Junho
  const endDate = new Date(currentYear, 9, 31);  // Outubro
  
  // Turnos (Total Dia = 540 min)
  const TOTAL_DIA_MIN = 540;
  const TURNO_MANHA_MIN = 240; // 08h-12h
  const TURNO_TARDE_MIN = 300; // 13h-18h

  let pairingsCount = 0;

  // LOOP PRINCIPAL: Enquanto houver SALA e pelo menos 1 USUÁRIO
  while (availableRooms.length > 0 && availableUsers.length > 0) {
    pairingsCount++;

    // 1. Pega a Sala
    const room = availableRooms.pop()!;

    // 2. Tenta pegar 2 Usuários (Manhã e Tarde)
    const userMorning = availableUsers.pop()!; 
    const userAfternoon = availableUsers.length > 0 ? availableUsers.pop() : null; // Pode ser que falte usuário pro par

    // 3. Define o "Contrato" de cada um (Dias da semana que eles atendem)
    // Manhã: Sorteia 3 a 5 dias
    const daysCountM = Math.floor(Math.random() * (5 - 3 + 1)) + 3; 
    const daysMorning = getRandomWeekdays(daysCountM);

    // Tarde: Sorteia 3 a 5 dias (se existir o user da tarde)
    const daysCountA = Math.floor(Math.random() * (5 - 3 + 1)) + 3; 
    const daysAfternoon = userAfternoon ? getRandomWeekdays(daysCountA) : [];

    // 4. Itera sobre os dias do calendário
    const currentDateIterator = new Date(startDate);
    
    while (currentDateIterator <= endDate) {
      const currentDayOfWeek = currentDateIterator.getDay();
      
      // Verifica se HOJE tem agendamento para Manhã ou Tarde (ou ambos)
      const hasMorningSchedule = daysMorning.includes(currentDayOfWeek);
      const hasAfternoonSchedule = daysAfternoon.includes(currentDayOfWeek);

      // Se nenhum dos dois atende hoje, não gera registro (ou gera inativo, mas aqui vamos pular pra economizar linhas)
      if (!hasMorningSchedule && !hasAfternoonSchedule) {
        currentDateIterator.setDate(currentDateIterator.getDate() + 1);
        continue;
      }

      const reportDate = new Date(currentDateIterator);
      let dayUsedMinutes = 0;
      let dayCancellationCount = 0;
      const dayAttendedList: any[] = [];

      // --- Processa Turno da Manhã ---
      if (hasMorningSchedule) {
        // 20% de chance de faltar (No-Show)
        const isNoShowM = Math.random() < 0.20;
        
        if (isNoShowM) {
          dayCancellationCount++; 
          // Tempo usado não soma nada
        } else {
          dayUsedMinutes += TURNO_MANHA_MIN;
          dayAttendedList.push({
            userId: userMorning.id,
            nome: userMorning.nome,
            role: "Recorrente",
            turno: "Manhã"
          });
        }
      }

      // --- Processa Turno da Tarde ---
      if (hasAfternoonSchedule && userAfternoon) {
        // 20% de chance de faltar (No-Show)
        const isNoShowA = Math.random() < 0.20;

        if (isNoShowA) {
          dayCancellationCount++;
        } else {
          dayUsedMinutes += TURNO_TARDE_MIN;
          dayAttendedList.push({
            userId: userAfternoon.id,
            nome: userAfternoon.nome,
            role: "Recorrente",
            turno: "Tarde"
          });
        }
      }

      // --- Consolida o Dia ---
      const dayUnusedMinutes = Math.max(0, TOTAL_DIA_MIN - dayUsedMinutes);

      reportsToCreate.push({
        date: reportDate,
        roomIdAmbiente: room.ID_Ambiente,
        roomBloco: room.bloco,
        wasActive: true, // Se caiu aqui, é porque tinha agendamento (mesmo que tenha sido cancelado)
        totalUsedMinutes: dayUsedMinutes,
        totalUnusedMinutes: dayUnusedMinutes,
        cancellationCount: dayCancellationCount, // Pode ser 0, 1 ou 2 (se ambos faltarem)
        attendedUsersList: dayAttendedList, // Pode ter 0, 1 ou 2 pessoas
      });

      // Próximo dia
      currentDateIterator.setDate(currentDateIterator.getDate() + 1);
    }
  }

  console.log(`✨ ${pairingsCount} salas preenchidas com agendas duplas.`);
  console.log(`💾 Salvando ${reportsToCreate.length} relatórios diários no banco...`);
  
  const BATCH_SIZE = 2000; 
  for (let i = 0; i < reportsToCreate.length; i += BATCH_SIZE) {
    const batch = reportsToCreate.slice(i, i + BATCH_SIZE);
    await prisma.dailyRoomReport.createMany({ data: batch });
    console.log(`   ...lote ${Math.floor(i / BATCH_SIZE) + 1} inserido.`);
  }


  // ---------------------------------------------------------
  // 2️⃣ CONSOLIDAÇÃO MENSAL (RoomStats)
  // ---------------------------------------------------------
  console.log("📊 Consolidando estatísticas mensais...");

  const startMonth = 5; // Junho
  const endMonth = 9;   // Outubro

  for (let m = startMonth; m <= endMonth; m++) {
    const firstDayOfMonth = new Date(currentYear, m, 1);
    const lastDayOfMonth = new Date(currentYear, m + 1, 0);
    lastDayOfMonth.setHours(23, 59, 59, 999);

    console.log(`   Processando: ${firstDayOfMonth.toLocaleString('pt-BR', { month: 'long' })}...`);

    const monthReports = await prisma.dailyRoomReport.findMany({
      where: {
        date: { gte: firstDayOfMonth, lte: lastDayOfMonth }
      }
    });

    if (monthReports.length === 0) continue;

    const roomMap = new Map<string, any>();

    for (const rep of monthReports) {
      const key = rep.roomIdAmbiente;
      
      if (!roomMap.has(key)) {
        roomMap.set(key, {
          roomIdAmbiente: rep.roomIdAmbiente,
          roomBloco: rep.roomBloco,
          totalUsedMin: 0,
          totalReservedMin: 0,
          idleMinSum: 0,
          activeDaysCount: 0,
          cancellationCount: 0,
          totalUsedCount: 0,
          usageByWeekday: { 0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0 } as any,
        });
      }

      const stats = roomMap.get(key);
      const dayOfWeek = new Date(rep.date).getDay();

      if (rep.wasActive) {
        const used = rep.totalUsedMinutes || 0;
        const idle = rep.totalUnusedMinutes || 0;
        const cancelled = rep.cancellationCount || 0;
        
        // Na lista pode ter até 2 pessoas agora
        const attendedList = rep.attendedUsersList as any[];
        const peopleCount = attendedList ? attendedList.length : 0;
        
        stats.totalUsedMin += used;
        stats.totalReservedMin += used; // Simplificado
        stats.idleMinSum += idle;
        stats.activeDaysCount++;
        stats.cancellationCount += cancelled;
        
        // Soma quantas pessoas realmente foram (attendance)
        stats.totalUsedCount += peopleCount;

        stats.usageByWeekday[dayOfWeek] += used;
      }
    }

    const statsToCreate = Array.from(roomMap.values()).map(s => {
      const avgIdleMin = s.activeDaysCount > 0 ? s.idleMinSum / s.activeDaysCount : 0;
      const totalCapacity = s.totalUsedMin + s.idleMinSum;
      const avgUsageRate = totalCapacity > 0 ? (s.totalUsedMin / totalCapacity) : 0;

      return {
        roomIdAmbiente: s.roomIdAmbiente,
        roomBloco: s.roomBloco,
        monthRef: firstDayOfMonth,
        totalReservedMin: s.totalReservedMin,
        totalUsedMin: s.totalUsedMin,
        avgIdleMin: parseFloat(avgIdleMin.toFixed(2)),
        avgUsageRate: parseFloat(avgUsageRate.toFixed(4)),
        usageByWeekday: s.usageByWeekday,
        totalBookings: s.totalUsedCount + s.cancellationCount,
        totalUsed: s.totalUsedCount,
        totalCanceled: s.cancellationCount,
      };
    });

    if (statsToCreate.length > 0) {
        await prisma.roomStats.createMany({ data: statsToCreate });
    }
  }

  console.log("✅ Seed finalizado com sucesso!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });