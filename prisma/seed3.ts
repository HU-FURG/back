import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { startOfMonth, getDay } from 'date-fns';

const prisma = new PrismaClient();

// Caminho para o CSV
const csvFilePath = path.resolve(__dirname, 'dados.csv');
let rawCsvData: string;
try {
  rawCsvData = fs.readFileSync(csvFilePath, { encoding: 'utf-8' });
} catch (error) {
  console.error(`Erro ao ler o arquivo CSV em: ${csvFilePath}`);
  process.exit(1);
}

// Parseia hora e minuto do CSV
function parseCsvTime(dateTimeStr: string): { hour: number; minute: number } {
  try {
    const timePart = dateTimeStr.split(' ')[1];
    const [hour, minute] = timePart.split(':').map(Number);
    return { hour, minute };
  } catch {
    return { hour: 0, minute: 0 };
  }
}

// Gera todas segundas e quartas de um ano
function getMondaysAndWednesdays(year: number): Date[] {
  const dates: Date[] = [];
  const date = new Date(year, 0, 1);
  while (date.getFullYear() === year) {
    const day = date.getDay();
    if (day === 1 || day === 3) dates.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return dates;
}

// Função principal
async function main() {
  console.log('Iniciando seed...');
  await prisma.periodHistory.deleteMany({});

  const allMondaysAndWednesdays = getMondaysAndWednesdays(2024);
  const csvLines = rawCsvData.split('\n').slice(1);
  const dataToCreate: any[] = [];
  const nome = 'fabiana';
  const csvRoomId = 'H02-D-170';
  const csvRoomBloco = 'Ala Azul';
  const csvUserName = 'admin';

   // LOOP 1: Para cada dia (Segunda ou Quarta)
  for (const loopDate of allMondaysAndWednesdays) {
    
    // --- CORREÇÃO: Inicializa as variáveis AQUI ---
    // Precisamos guardar o primeiro e o último horário do dia.
    let earliestStartService: Date | null = null;
    let latestEndService: Date | null = null;
    let recordsFoundThisDay = false;
    const csvRoomId = "H02-D-170"; 
    const csvRoomBloco = "Ala Azul"; 
    const csvUserName = "admin"; 

    for (const line of csvLines) {
      
      if (line.trim() === '') continue; // Pula linhas em branco
      const columns = line.split(',');
      const userName = columns[0].split(' ')[0].trim();
      if (userName !== 'fabiana.azevedo') {
        continue;
      }

      // Mapeando as colunas do CSV
      const inicioAtendimStr = columns[8].trim();
      const fimAtendimStr = columns[9].trim();

      // Extrai apenas as HORAS e MINUTOS do CSV
      const priemiroTempo = parseCsvTime(inicioAtendimStr);
      const ultimoTempo = parseCsvTime(fimAtendimStr);
      function zerarHora(date: Date) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
      }
      const dataTabela = zerarHora(new Date(inicioAtendimStr));
      const dataQueUto = zerarHora(new Date(loopDate));
      if( dataQueUto < dataTabela ){
        //console.log('datatabela: ', dataTabela, "dataqeuto: ", dataQueUto)
        break;
      } else if(dataQueUto > dataTabela) {
        // console.log('datatabela: ', dataTabela, "dataqeuto: ", dataQueUto)
        continue;
      }
      recordsFoundThisDay = true
      // --- CORREÇÃO: Cria datas candidatas para este dia ---
      const currentStartService = new Date(loopDate);
      currentStartService.setHours(priemiroTempo.hour, priemiroTempo.minute, 0, 0);

      const currentEndService = new Date(loopDate);
      currentEndService.setHours(ultimoTempo.hour, ultimoTempo.minute, 0, 0);

      // --- CORREÇÃO: Lógica para achar o primeiro e o último ---
      // Se 'earliest' ainda não foi setado OU o 'current' é mais cedo
      if (!earliestStartService || currentStartService < earliestStartService) {
        earliestStartService = currentStartService;
      }

      // Se 'latest' ainda não foi setado OU o 'current' é mais tarde
      if (!latestEndService || currentEndService > latestEndService) {
        latestEndService = currentEndService;
      }
      
    } 

    const start = new Date(loopDate);
    start.setHours(8, 0, 0, 0);
    const end = new Date(loopDate);
    end.setHours(18, 0, 0, 0);

    const weekday = getDay(loopDate); // 0 = Domingo ... 6 = Sábado

    // Calcula duração (em minutos)
    const durationMinutes = Math.floor((end.getTime() - start.getTime()) / 60000);
    const actualDurationMinutes =
      earliestStartService && latestEndService
        ? Math.floor((latestEndService.getTime() - earliestStartService.getTime()) / 60000)
        : null;

     if (recordsFoundThisDay) {
      dataToCreate.push({
        roomIdAmbiente: csvRoomId,
        roomBloco: csvRoomBloco,
        userName: csvUserName,
        start,
        end,
        nome,
        used: recordsFoundThisDay,
        startService: earliestStartService && !isNaN(earliestStartService.getTime())
          ? earliestStartService
          : null,
        endService: latestEndService && !isNaN(latestEndService.getTime())
          ? latestEndService
          : null,    
        weekday,
        durationMinutes,
        actualDurationMinutes,
      });
    }   else {
        dataToCreate.push({
          roomIdAmbiente: csvRoomId,
          roomBloco: csvRoomBloco,
          userName: csvUserName,
          start,
          end,
          nome,
          used: recordsFoundThisDay,
          startService: null,
          endService: null,    
          weekday,
          durationMinutes,
          actualDurationMinutes: null,         
        });
    }
  }

  console.log(`Criando ${dataToCreate.length} registros...`);
  await prisma.periodHistory.createMany({ data: dataToCreate });
  console.log('Seed concluído!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
