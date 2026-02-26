// src/routes/roomRoutes.ts
import { Router } from 'express';
import { deleteScheduling, listCurrentRoomStatus, listScheduling, searchUsersAndRooms, updateScheduling } from '../controllers/schedulingController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', authenticateToken, listScheduling);
router.get('/search', authenticateToken, searchUsersAndRooms)//confirma busca
router.put('/:id', authenticateToken, updateScheduling)
router.delete('/:id', authenticateToken, deleteScheduling)
router.get('/statusnow/:ala', listCurrentRoomStatus)

export default router;
