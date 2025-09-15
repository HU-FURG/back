// src/routes/roomRoutes.ts
import { Router } from 'express';
import { deleteScheduling, listScheduling, updateScheduling } from '../controllers/schedulingController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authenticateToken, listScheduling);
router.put('/:id', authenticateToken, updateScheduling)
router.delete('/:id', authenticateToken, deleteScheduling)

export default router;
