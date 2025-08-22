// src/app.ts
import express from 'express';
import cors from 'cors';
import cron from 'node-cron'
import roomRoutes from './routes/roomRoutes'
import periodRoutes from './routes/periodRoutes'
import userRoutes from './routes/userRoutes'
import cookieParser from 'cookie-parser'

import { clearPeriodsandUpdate } from './prisma/clear';

const app = express();
app.use(express.json());

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(cookieParser()); 

app.use('/api', roomRoutes);
app.use('/api', periodRoutes);
app.use('/api', userRoutes);
app.get('/health', (req, res) => res.sendStatus(200));
app.get('/', (req, res) =>{
  res.send("success deploy!")
})

const PORT = Number(process.env.PORT) || 3333; 
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

  // Fazer a manutenção dos dados historicos
  cron.schedule('0 0 * * 6', async()=> {
    console.log('executando Limpeza semana ...')
    await clearPeriodsandUpdate();
  })
});

