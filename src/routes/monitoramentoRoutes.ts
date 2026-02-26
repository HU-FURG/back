import { Router } from 'express';
import { storeRoomMonitorEvent } from '../controllers/monitoramentoController';

const router = Router();

//------------------------------------------------
// Monitoramento - Salas Ativas
//------------------------------------------------
router.post('/info', storeRoomMonitorEvent);

export default router;