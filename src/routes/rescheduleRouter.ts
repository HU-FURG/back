
import { Router } from 'express';
// 1. Adicione o createReschedule na importação
import { listReschedule, createReschedule } from '../controllers/reScheduleController'; 
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

// Rota para LISTAR (já existia)
router.get('', listReschedule);

// 2. Adicione esta rota para SALVAR (O botão Finalizar chama aqui)
router.post('', createReschedule);

export default router;