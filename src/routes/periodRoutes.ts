
// src/routes/roomRoutes.ts
import { Router } from 'express';
import {
buscarSalasDisponiveis, 
agendarSala,
listarMinhasReservas,
cancelarReserva
} from '../controllers/periodController';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.post('/buscarhorario',authenticateToken, buscarSalasDisponiveis)
router.post('/agendar',authenticateToken, agendarSala)

// Listar reservas do usuário autenticado
router.get("/myreserve", authenticateToken,requireRole(["user", "admin"]), listarMinhasReservas);
router.delete("/myreserve/:id", authenticateToken, requireRole(["user", "admin"]), cancelarReserva);

export default router;
