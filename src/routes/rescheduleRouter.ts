import { Router } from "express";
// 1. Adicione o createReschedule na importação
import {
  deleteReschedule,
  listReschedule,
} from "../controllers/reScheduleController";
import { authenticateToken } from "../middlewares/authMiddleware";

const router = Router();

// Rota para LISTAR (já existia)
router.get("", authenticateToken, listReschedule);
router.delete("/:id", authenticateToken, deleteReschedule);

export default router;
