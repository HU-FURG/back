// src/routes/roomRoutes.ts
import { Router, RequestHandler } from 'express';
import {
  createRoom,
  listRooms,
  editRoom,
  deleteRooms,
  getRoomSchedule,
  getBlockDayGrade,
} from '../controllers/roomController';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

router.post('/room',authenticateToken, createRoom);

router.get('/rooms',authenticateToken, listRooms);
router.patch('/room/:id', editRoom);

router.post('/rooms/delete', deleteRooms);
router.get('/room/:roomId/Schedule',authenticateToken, getRoomSchedule)

router.get('/grade/:block/:date',authenticateToken, getBlockDayGrade)

export default router;
