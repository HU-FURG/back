import { Router } from 'express';
import { storeRoomMonitorEvent } from '../controllers/monitoramentoController';

const router = Router();

//------------------------------------------------
// Monitoramento - Salas Ativas
//------------------------------------------------
router.get('/rooms/active', storeRoomMonitorEvent);

export default router;