import { Router } from 'express';
import { DashboardController } from '../controllers/dashboardController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();
const dashboardController = new DashboardController();

// --- Rotas do Dashboard ---

// Taxa de Ocupação (Próximos 7 dias)
router.get('/occupation', authenticateToken, (req, res) => dashboardController.getOccupation(req, res));

// Tempo Médio de Uso (Período personalizado)
router.post('/tempoMedio', authenticateToken, (req, res) => dashboardController.calculateAverageTime(req, res));


// 1. Visão Geral (Gráficos)
// GET /dashboard/general?block=X&month=Y&year=Z
router.get('/dashboard/general', authenticateToken, (req, res) => dashboardController.getGeneralStats(req, res));

// 2. Lista de Salas (Com busca por nome/bloco)
// GET /dashboard/rooms?block=X&month=Y&year=Z&search=Sala1
router.get('/dashboard/rooms', authenticateToken, (req, res) => dashboardController.getRoomsList(req, res));

// 3. Lista de Usuários (Com busca por nome/login)
// GET /dashboard/users?block=X&month=Y&year=Z&search=joao
router.get('/dashboard/users', authenticateToken, (req, res) => dashboardController.getUsersList(req, res));

// 4. Detalhe da Sala
// GET /dashboard/room-detail?roomId=SALA-101&month=Y&year=Z
router.get('/dashboard/room-detail', authenticateToken, (req, res) => dashboardController.getIndividualRoomStats(req, res));

router.get('/dashboard/user-detail', authenticateToken, (req, res) => dashboardController.getIndividualUserStats(req, res))

export default router;