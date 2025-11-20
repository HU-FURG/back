// src/app.ts
import "dotenv/config";
import express from 'express';
import cors from 'cors';
import cron from 'node-cron'
import cookieParser from 'cookie-parser'
import morgan from 'morgan';
import path from 'path';

// routes
import dashboardRoutes from './routes/dashboardRoutes'
import roomRoutes from './routes/roomRoutes'
import periodRoutes from './routes/periodRoutes'
import userRoutes from './routes/userRoutes'
import schedulingRoutes from './routes/schedulingRouter'
import rescheduleRouter from './routes/rescheduleRouter'

// routine
import { clearPeriodsandUpdate } from './prisma/clear';
import { getSystemLog } from './prisma/systemLog';

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, '../public')));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173' || 'http://localhost:3333' || "https://precious-reyna-hu-furg-b9ddc9e2.koyeb.app",
  methods: ['GET', 'POST', 'PUT', 'DELETE', "PATCH", "HEAD"],
  allowedHeaders: ['Content-Type', 'Authorization', "If-None-Match"],
  exposedHeaders: ['ETag'],
  credentials: true,
}));

app.use(cookieParser()); 

morgan.token('body', (req: any) => JSON.stringify(req.body));

app.use(morgan(':method :url :status :response-time ms - body=:body'));

app.use('/api', roomRoutes); // Salas
app.use('/api', periodRoutes); // Agendamentos
app.use('/api', userRoutes); // sistema login get users CRUD usuarios
app.use('/api', dashboardRoutes) // dashboard
app.use('/api/scheduling', schedulingRoutes) // gerenciamento de agendamentos
app.use('/api/reschedule', rescheduleRouter) // reprogramação de agendamentos

app.get('/health', (req, res) => res.sendStatus(200)); // rota de verificação de deploy

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});


const PORT = Number(process.env.PORT) || 3333; 
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

  // Checa se precisa rodar logo no startup
  const log = await getSystemLog('last_clear_update');
  const lastRun = log?.updatedAt ?? new Date(0);
  const diffHours = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);

  if (diffHours >= 24) {
    console.log('⚙️ Rodando rotina de limpeza atrasada no startup...');
    await clearPeriodsandUpdate();
  } else {
    console.log(`⏳ Última limpeza há ${diffHours.toFixed(1)}h. Aguardando cron.`);
  }

  // Cron padrão - roda toda noite às 23h59
  cron.schedule('59 23 * * *', async () => {
    console.log('🕒 Executando rotina noturna de limpeza...');
    await clearPeriodsandUpdate();
  });
});