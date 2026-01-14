import { Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { z } from 'zod';

// --- Schemas de Validação ---
const DashboardQuerySchema = z.object({
  block: z.string().optional(),
  month: z.string().transform(Number),
  year: z.string().transform(Number),
  search: z.string().optional(),
});

const IndividualRoomQuerySchema = z.object({
  roomId: z.string(),
  month: z.string().transform(Number),
  year: z.string().transform(Number),
});

const PeriodoSchema = z.object({
  inicio: z.string(), // "2025-08-01"
  fim: z.string()     // "2025-08-07"
});

const IndividualUserQuerySchema = z.object({
  userId: z.string().transform(Number),
  month: z.string().transform(Number),
  year: z.string().transform(Number),
});

export class DashboardController {

  // ========================================================
  // MÉTODOS LEGADO (Restaurados para Home.tsx)
  // ========================================================

  /**
   * Retorna a taxa de ocupação para os próximos 7 dias
   * Rota: GET /occupation
   */
  async getOccupation(req: Request, res: Response) {
    try {
      const hoje = new Date();
      hoje.setHours(0,0,0,0);
      
      const dataFim = new Date(hoje);
      dataFim.setDate(hoje.getDate() + 6);
      dataFim.setHours(23,59,59,999);

      // 1. Total de salas ativas
      const salasAtivas = await prisma.room.count({ where: { active: true } });
      if (salasAtivas === 0) return res.json([]);

      // 2. Busca agendamentos no intervalo
      const periodos = await prisma.roomPeriod.findMany({
        where: {
          room: { active: true },
          start: { lte: dataFim },
          end: { gte: hoje },
        },
        select: { start: true, end: true, roomId: true }
      });

      // 3. Processa ocupação dia a dia
      const resultado = [];
      const diasDaSemana = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

      for (let i = 0; i < 7; i++) {
        const diaAtual = new Date(hoje);
        diaAtual.setDate(hoje.getDate() + i);
        
        // Define limites do dia atual
        const inicioDia = new Date(diaAtual); inicioDia.setHours(0,0,0,0);
        const fimDia = new Date(diaAtual); fimDia.setHours(23,59,59,999);

        // Conta salas distintas ocupadas neste dia
        const salasOcupadasSet = new Set<number>();
        
        periodos.forEach(p => {
          // Verifica intersecção de datas
          if (p.start <= fimDia && p.end >= inicioDia) {
            salasOcupadasSet.add(p.roomId);
          }
        });

        const salasOcupadas = salasOcupadasSet.size;
        const ocupacaoPercentual = (salasOcupadas / salasAtivas) * 100;

        resultado.push({
          dia: diasDaSemana[diaAtual.getDay()],
          ocupacaoPercentual: parseFloat(ocupacaoPercentual.toFixed(2)),
          salasOcupadas,
        });
      }

      return res.json(resultado);
    } catch (error) {
      console.error(error);
      return res.status(400).json({ message: "Erro ao calcular ocupação." });
    }
  }

  /**
   * Calcula tempo médio de uso num período personalizado
   * Rota: POST /tempoMedio
   */
  /**
   * Calcula tempo médio de uso num período personalizado
   * Rota: POST /tempoMedio
   */
  async calculateAverageTime(req: Request, res: Response) {
    try {
      // 1. Log para debugar o que chega do front
      console.log("Body recebido:", req.body);

      // Tenta fazer o parse. Se falhar, vai pro catch.
      const { inicio, fim } = PeriodoSchema.parse(req.body);

      // TRUQUE: Adiciona "T12:00:00" para garantir que a data seja criada 
      // no meio do dia correto, evitando o bug de voltar 1 dia pelo fuso horário.
      const dataInicio = new Date(inicio + "T12:00:00");
      const dataFim = new Date(fim + "T12:00:00");

      // Agora pode zerar e setar o final do dia com segurança
      dataInicio.setHours(0, 0, 0, 0);
      dataFim.setHours(23, 59, 59, 999);

      console.log("Datas corrigidas:", { dataInicio, dataFim });

      console.log("Datas processadas:", { dataInicio, dataFim });

      if (isNaN(dataInicio.getTime()) || isNaN(dataFim.getTime())) {
         return res.status(400).json({ message: "Datas inválidas enviadas." });
      }

      if (dataInicio > dataFim) {
        return res.status(400).json({ message: "Data inicial maior que final." });
      }

      const salasAtivas = await prisma.room.count({ where: { active: true } });

      // 2. CORREÇÃO PRINCIPAL: Adicionado filtro de room active igual ao getOccupation
      const periodos = await prisma.roomPeriod.findMany({
        where: {
          room: { active: true }, // <--- Faltava isso para consistência
          start: { lte: dataFim },
          end: { gte: dataInicio }
        },
        select: { start: true, end: true, roomId: true }
      });

      if (periodos.length === 0) {
        return res.json({ 
          message: "Nenhum agendamento no período.", 
          tempoMedio: "0min", 
          salasUsadas: 0, 
          totalSalas: salasAtivas 
        });
      }

      // Calcula minutos
      const minutosTotais = periodos.reduce((acc, p) => {
        // Garante que são objetos Date
        const dEnd = new Date(p.end);
        const dStart = new Date(p.start);
        const diffMs = dEnd.getTime() - dStart.getTime();
        return acc + (diffMs / (1000 * 60));
      }, 0);

      const mediaMinutos = minutosTotais / periodos.length;
      
      // Set distinct para contar salas únicas
      const salasUsadas = new Set(periodos.map(p => p.roomId)).size;

      // Formatação
      const horas = Math.floor(mediaMinutos / 60);
      const mins = Math.round(mediaMinutos % 60);
      let tempoFormatado = `${mins}min`;
      if (horas > 0) tempoFormatado = `${horas}h${mins > 0 ? `:${mins}` : ''}`;

      return res.json({
        salasUsadas,
        totalSalas: salasAtivas,
        tempoMedio: tempoFormatado,
        periodoAnalisado: { inicio: dataInicio, fim: dataFim }
      });

    } catch (error: any) {
      // 3. Melhoria no retorno do erro para saber se é Zod ou Prisma
      console.error("Erro no calculateAverageTime:", error);
      
      // Se for erro do Zod (validação)
      if (error.issues) {
        return res.status(400).json({ message: "Dados inválidos.", detalhes: error.issues });
      }

      return res.status(500).json({ message: "Erro interno ao calcular média." });
    }
  }

  // ========================================================
  // MÉTODOS NOVOS (Dashboard Analytics)
  // ========================================================

async getGeneralStats(req: Request, res: Response) {
    try {
      const { block, month, year } = DashboardQuerySchema.parse(req.query);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0); 
      endDate.setHours(23, 59, 59);

      // 1. Busca dados do banco
      const stats = await prisma.roomStats.findMany({
        where: {
          roomBloco: block && block !== "Todos" ? block : undefined,
          monthRef: { gte: startDate, lte: endDate }
        }
      });

      // 2. Conta TOTAL DE SALAS ATIVAS 
      const totalRoomsCount = await prisma.room.count({
        where: {
            bloco: {
                nome: block && block !== "Todos" ? block : undefined
            },
            active: true 
        }
      });
      const safeRoomCount = totalRoomsCount > 0 ? totalRoomsCount : 1;

      // 3. Acumula os minutos (Mantém igual)
      let totalUsedMin = 0;
      const weeklyUsageAccumulator = [0, 0, 0, 0, 0, 0, 0]; 

      stats.forEach(s => {
        totalUsedMin += s.totalUsedMin;
        const days = s.usageByWeekday as Record<string, number>; 
        if (days) {
          Object.keys(days).forEach((dayKey) => {
            const idx = parseInt(dayKey);
            if (!isNaN(idx)) weeklyUsageAccumulator[idx] += days[dayKey];
          });
        }
      });

      // --- CÁLCULO DE DIAS ÚTEIS ---
      const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
      let workingDaysCount = 0; // Contador de dias úteis
      
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay(); // 0 (Dom) a 6 (Sáb)
          weekdayCounts[dayOfWeek]++; 
          
          // Se não for Domingo (0) nem Sábado (6), conta como dia útil
          if (dayOfWeek !== 0 && dayOfWeek !== 6) {
             workingDaysCount++;
          }
          currentDate.setDate(currentDate.getDate() + 1);
      }

      // --- PIE CHART (Capacidade Total Baseada em DIAS ÚTEIS) ---
      const HORAS_FUNCIONAMENTO_DIA = 9; 
      const totalCapacityHours = safeRoomCount * workingDaysCount * HORAS_FUNCIONAMENTO_DIA;

      // --- PIE CHART DATA ---
      const totalUsedHours = Math.round(totalUsedMin / 60);
      const idleHours = Math.max(0, totalCapacityHours - totalUsedHours);

      const pieChartData = [
        { name: "Tempo Usado", value: totalUsedHours, color: "#059669" }, 
        { name: "Tempo Livre", value: idleHours, color: "#e5e7eb" } 
      ];

      // --- BAR CHART DATA ---
      const weekNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      
      const barChartData = weeklyUsageAccumulator.map((totalMin, index) => {
        const countDays = weekdayCounts[index] || 1;
        const divisor = countDays * safeRoomCount; 
        const averageMin = totalMin / divisor;
        
        return {
          day: weekNames[index],
          used: Number((averageMin / 60).toFixed(1)), // Retorna número com 1 casa decimal
        };
      }).filter((_, i) => i !== 0 && i !== 6); 

      // --- CÁLCULO DO OCCUPANCY RATE ---
      // Evita divisão por zero
      let occupancyRate = 0;
      if (totalCapacityHours > 0) {
        occupancyRate = Math.round((totalUsedHours / totalCapacityHours) * 100);
      }

      const summary = {
          totalBookings: stats.reduce((acc, curr) => acc + curr.totalBookings, 0),
          totalCanceled: stats.reduce((acc, curr) => acc + curr.totalCanceled, 0),
          occupancyRate: occupancyRate // <--- AGORA ESTÁ AQUI
      };

      return res.json({ pieChartData, barChartData, summary });
    } catch (error) {
      console.error(error);
      return res.status(400).json({ error: "Erro ao buscar dados gerais." });
    }
}


  async getIndividualUserStats(req: Request, res: Response) {
    try {
        const { userId, month, year } = IndividualUserQuerySchema.parse(req.query);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        endDate.setHours(23, 59, 59);

        const reports = await prisma.dailyRoomReport.findMany({
            where: {
                date: { gte: startDate, lte: endDate },
                attendedUsersList: {
                    path: ['$'], // <--- CORREÇÃO DO ARRAY DE STRINGS PARA O PRISMA
                    array_contains: [{ userId: userId }] 
                }
            },
            orderBy: { date: 'asc' }
        });

        // 1. Gráfico de Atividade Diária
        const dailyActivity = reports.reduce((acc: any[], curr) => {
            const day = new Date(curr.date).getDate().toString();
            const existingDay = acc.find(d => d.day === day);
            if (existingDay) {
                existingDay.reservas += 1;
            } else {
                acc.push({ day, reservas: 1 });
            }
            return acc;
        }, []);
        
        // 2. Salas Mais Usadas
        const roomCountMap = new Map<string, number>();
        reports.forEach(rep => {
            const roomName = rep.roomIdAmbiente;
            roomCountMap.set(roomName, (roomCountMap.get(roomName) || 0) + 1);
        });
        const topRooms = Array.from(roomCountMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        // 3. Totais e Turno
        const totalReservas = reports.length;
        let turnos = { "Manhã": 0, "Tarde": 0 };
        
        reports.forEach(rep => {
             const users = rep.attendedUsersList as any[];
             const userEntry = users.find(u => u.userId === userId);
             if (userEntry && userEntry.turno) {
                 turnos[userEntry.turno as keyof typeof turnos] = (turnos[userEntry.turno as keyof typeof turnos] || 0) + 1;
             }
        });

        return res.json({
            dailyActivity,
            topRooms,
            summary: {
                totalReservas,
                turnoPreferido: turnos["Manhã"] > turnos["Tarde"] ? "Manhã" : "Tarde"
            }
        });

    } catch (error) {
        console.error(error);
        return res.status(400).json({ error: "Erro ao buscar detalhes do usuário." });
    }
  }

  async getRoomsList(req: Request, res: Response) {
    try {
      const { block, month, year, search } = DashboardQuerySchema.parse(req.query);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const whereCondition: any = { AND: [] };
      if (block && block !== "Todos") whereCondition.AND.push({ bloco: block });
      if (search) {
        whereCondition.AND.push({
            OR: [
                { ID_Ambiente: { contains: search, mode: 'insensitive' } },
                { bloco: { contains: search, mode: 'insensitive' } }
            ]
        });
      }

      const staticRooms = await prisma.room.findMany({ where: whereCondition });
      const roomsStats = await prisma.roomStats.findMany({
        where: {
            roomBloco: block && block !== "Todos" ? block : undefined,
            monthRef: { gte: startDate, lte: endDate }
        }
      });

      const tableData = staticRooms.map(room => {
        const stat = roomsStats.find(s => s.roomIdAmbiente === room.ID_Ambiente);
        return {
            id: room.id,
            ID_Ambiente: room.ID_Ambiente,
            bloco: room.blocoId,
            especialidade: room.especialidadeId,
            tipo: room.tipo,
            banheiro: room.banheiro,
            usadoHoras: stat ? Math.round(stat.totalUsedMin / 60) : 0,
            eficiencia: stat?.avgUsageRate ? (stat.avgUsageRate * 100).toFixed(1) : "0.0",
            totalAgendamentos: stat?.totalBookings || 0,
            totalCancelados: stat?.totalCanceled || 0
        };
      });

      tableData.sort((a, b) => parseFloat(b.eficiencia) - parseFloat(a.eficiencia));
      return res.json(tableData);
    } catch (error) {
        return res.status(400).json({ error: "Erro ao buscar lista de salas." });
    }
  }

  async getUsersList(req: Request, res: Response) {
    try {
      const { block, month, year, search } = DashboardQuerySchema.parse(req.query);
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      endDate.setHours(23, 59, 59);

      const reports = await prisma.dailyRoomReport.findMany({
        where: {
            date: { gte: startDate, lte: endDate },
            roomBloco: block && block !== "Todos" ? block : undefined
        },
        select: { attendedUsersList: true, roomIdAmbiente: true }
      });

      const userMap = new Map<number, any>();
      const userIdsToFetch = new Set<number>();

      reports.forEach(rep => {
         const users = rep.attendedUsersList as any[];
         if (users && Array.isArray(users)) {
            users.forEach(u => {
                if (!u.userId) return;
                userIdsToFetch.add(u.userId);
                if (!userMap.has(u.userId)) {
                    userMap.set(u.userId, {
                        id: u.userId,
                        nomeJson: u.nome || "Usuário", 
                        totalReservas: 0,
                        roomsCount: {} as Record<string, number>,
                        shifts: { "Manhã": 0, "Tarde": 0 }
                    });
                }
                const userStat = userMap.get(u.userId);
                userStat.totalReservas += 1;
                userStat.roomsCount[rep.roomIdAmbiente] = (userStat.roomsCount[rep.roomIdAmbiente] || 0) + 1;
                if (u.turno) userStat.shifts[u.turno] = (userStat.shifts[u.turno] || 0) + 1;
            });
         }
      });

      const dbUsers = await prisma.user.findMany({
        where: { id: { in: Array.from(userIdsToFetch) } },
        select: { id: true, login: true, nome: true }
      });
      const dbUserMap = new Map(dbUsers.map(u => [u.id, u]));

      let usersList = Array.from(userMap.values()).map(u => {
        const dbUser = dbUserMap.get(u.id);
        let mostUsedRoom = "-";
        let maxCount = 0;
        Object.entries(u.roomsCount).forEach(([room, count]: [string, any]) => {
            if (count > maxCount) { maxCount = count; mostUsedRoom = room; }
        });
        const morning = u.shifts["Manhã"] || 0;
        const afternoon = u.shifts["Tarde"] || 0;
        const period = morning > afternoon ? "Manhã" : (afternoon > morning ? "Tarde" : "Variado");

        return {
            id: u.id,
            nome: dbUser?.nome || u.nomeJson,
            login: dbUser?.login || "-",
            totalReservas: u.totalReservas,
            salaMaisUsada: mostUsedRoom,
            periodoPreferido: period,
            faltas: 0
        };
      });

      if (search) {
        const lowerSearch = search.toLowerCase();
        usersList = usersList.filter(u => 
            (u.nome && u.nome.toLowerCase().includes(lowerSearch)) || 
            (u.login && u.login.toLowerCase().includes(lowerSearch))
        );
      }
      usersList.sort((a, b) => b.totalReservas - a.totalReservas);
      return res.json(usersList);
    } catch (error) {
        return res.status(400).json({ error: "Erro ao buscar lista de usuários." });
    }
  }

  async getIndividualRoomStats(req: Request, res: Response) {
    try {
        const { roomId, month, year } = IndividualRoomQuerySchema.parse(req.query);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        endDate.setHours(23, 59, 59);

        const dailyReports = await prisma.dailyRoomReport.findMany({
            where: {
                roomIdAmbiente: roomId,
                date: { gte: startDate, lte: endDate }
            },
            orderBy: { date: 'asc' }
        });

        const dailyComparison = dailyReports.map(day => ({
            day: new Date(day.date).getDate().toString(),
            used: day.totalUsedMinutes ? Math.round(day.totalUsedMinutes / 60) : 0,
            reserved: day.totalUnusedMinutes ? Math.round((day.totalUsedMinutes! + day.totalUnusedMinutes!) / 60) : 0 
        }));

        const userMap = new Map();
        dailyReports.forEach(day => {
            const users = day.attendedUsersList as any[];
            if(users && Array.isArray(users)) {
                users.forEach(u => {
                    const current = userMap.get(u.nome) || 0;
                    userMap.set(u.nome, current + 1);
                });
            }
        });

        const topUsers = Array.from(userMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        const totalUsed = dailyReports.reduce((acc, curr) => acc + (curr.totalUsedMinutes || 0), 0);
        const totalCanceled = dailyReports.reduce((acc, curr) => acc + (curr.cancellationCount || 0), 0);

        return res.json({
            dailyComparison,
            topUsers,
            totalUsedHours: Math.round(totalUsed / 60),
            totalCanceled
        });
    } catch (error) {
        return res.status(400).json({ error: "Erro ao buscar detalhe da sala." });
    }
  }

async searchUniversal(req: Request, res: Response) {
    try {
      const termo = String(req.query.termo || "").trim();
      if (!termo) return res.json([]);

      const rooms = await prisma.room.findMany({
        where: {
          OR: [
            {
              ID_Ambiente: {
                contains: termo,
                mode: 'insensitive'
              }
            },
            {
              bloco: {
                nome: {
                  contains: termo,
                  mode: 'insensitive'
                }
              }
            }
          ]
        },
        take: 3,
        select: { ID_Ambiente: true }
      });

      const users = await prisma.user.findMany({
        where: {
          nome: {
            contains: termo,
            mode: 'insensitive'
          }
        },
        take: 3,
        select: { nome: true }
      });

      const results = [
        ...rooms.map(r => ({
          label: `Sala: ${r.ID_Ambiente}`,
          value: r.ID_Ambiente,
          type: 'room'
        })),
        ...users.map(u => ({
          label: `Usuário: ${u.nome}`,
          value: u.nome,
          type: 'user'
        }))
      ];

      return res.json(results);
    } catch (error) {
      console.error(error);
      return res.status(400).json([]);
    }
  }
}