
// src/routes/roomRoutes.ts
import { Router } from 'express';
import {
buscarSalasDisponiveis, 
agendarSala
} from '../controllers/periodController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/buscarhorario',authenticateToken, buscarSalasDisponiveis)
router.post('/agendar',authenticateToken, agendarSala)

export default router;
