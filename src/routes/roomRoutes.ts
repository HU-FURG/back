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
import { checkRoomUpdates } from '../middlewares/cache';

const router = Router();

router.post('/room',authenticateToken, createRoom);
router.get('/rooms',authenticateToken,checkRoomUpdates, listRooms);
router.patch('/room/:id', editRoom);
router.post('/rooms/delete', deleteRooms);
router.get('/room/:roomId/Schedule',authenticateToken, getRoomSchedule)
export default router;
