
// src/routes/roomRoutes.ts
import { Router } from 'express';
import { listReschedule } from '../controllers/reScheduleController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.get('', listReschedule)

export default router;
