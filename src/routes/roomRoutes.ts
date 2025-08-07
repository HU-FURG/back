// src/routes/roomRoutes.ts
import { Router } from 'express';
import {
  createRoom,
  listRooms,
  editRoom,
  deleteRooms,
} from '../controllers/roomController';

const router = Router();

router.post('/room', createRoom);
router.get('/rooms', listRooms);
router.put('/room/:id', editRoom);
router.post('/rooms/delete', deleteRooms);

export default router;
