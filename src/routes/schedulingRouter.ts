// src/routes/roomRoutes.ts
import { Router } from 'express';
import { deleteScheduling, listScheduling, updateScheduling } from '../controllers/schedulingController';

const router = Router();

router.get('/', listScheduling);
router.put('/:id', updateScheduling)
router.delete('/:id', deleteScheduling)

export default router;
