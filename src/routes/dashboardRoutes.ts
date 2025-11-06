
// src/routes/roomRoutes.ts
import { Router } from 'express';
import { calcularTempoMedioUso, occupation, searchForIndividual, tempoGeralPorBloco, tempoMedioUsoDiarioPeriodo } from '../controllers/dashboardController';
import { authenticateToken } from '../middlewares/authMiddleware';


const router = Router();

router.get('/occupation',authenticateToken, occupation)
router.post('/tempoMedio',authenticateToken, calcularTempoMedioUso)
router.post('/tempoMedioPeriodo', tempoMedioUsoDiarioPeriodo)
router.post('/analiseBloco', tempoGeralPorBloco)
router.get("/search", searchForIndividual)

export default router;
