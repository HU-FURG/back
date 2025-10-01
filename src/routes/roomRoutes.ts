// src/routes/roomRoutes.ts
import { Router, RequestHandler } from 'express';
import {
  createRoom,
  listRooms,
  editRoom,
  deleteRooms,
  getRoomSchedule,
} from '../controllers/roomController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/room',authenticateToken, createRoom);
router.get('/rooms',authenticateToken, listRooms);
router.put('/room/:id',authenticateToken, editRoom);
router.post('/rooms/delete',authenticateToken, deleteRooms);
router.get('/room/:roomId/Schedule', getRoomSchedule)
export default router;
