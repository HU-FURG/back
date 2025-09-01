
// src/routes/roomRoutes.ts
import { Router } from 'express';
import { calcularTempoMedioUso, occupation } from '../controllers/dashboardController';


const router = Router();

router.post('/occupation',occupation)
router.post('/tempoMedio', calcularTempoMedioUso)

export default router;
