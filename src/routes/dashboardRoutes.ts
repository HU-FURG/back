
// src/routes/roomRoutes.ts
import { Router } from 'express';
import { calcularTempoMedioUso, occupation } from '../controllers/dashboardController';
import { authenticateToken } from '../middlewares/authMiddleware';


const router = Router();

router.get('/occupation',authenticateToken, occupation)
router.post('/tempoMedio',authenticateToken, calcularTempoMedioUso)

export default router;
