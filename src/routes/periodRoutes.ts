
// src/routes/roomRoutes.ts
import { Router } from 'express';
import {
buscarSalasDisponiveis, 
agendarSala
} from '../controllers/periodController';

const router = Router();

router.post('/buscarhorario', buscarSalasDisponiveis)
router.post('/agendar', agendarSala)

export default router;
