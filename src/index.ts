// src/app.ts
import express from 'express';
import cors from 'cors';
import cron from 'node-cron'
import roomRoutes from './routes/roomRoutes'
import periodRoutes from './routes/periodRoutes'
import userRoutes from './routes/userRoutes'

import { clearPeriodsandUpdate } from './prisma/clear';

const app = express();
const PORT = 3333;
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))


app.use('/api', roomRoutes);
app.use('/api', periodRoutes);
app.use('/api', userRoutes);


app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);

  // Fazer a manutenção dos dados historicos
  cron.schedule('0 0 * * 6', async()=> {
    console.log('executando Limpeza semana ...')
    await clearPeriodsandUpdate();
  })
});

