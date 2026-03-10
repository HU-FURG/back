import { Router } from "express";
import {
  getOccupation,
  calculateAverageTime,
  getBlockGraphAnalytics,
  getBlockTableAnalytics,
  getRoomTableAnalytics,
  getRoomGraphAnalytics,
  getRoomTopUsers,
} from "../controllers/dashboardController";
import { authenticateToken } from "../middlewares/authMiddleware";

const router = Router();
// --- Rotas do Dashboard ---

// Taxa de Ocupação (Próximos 7 dias)
router.get("/occupation", authenticateToken, getOccupation);

router.post("/tempoMedio", authenticateToken, calculateAverageTime);

router.post("/dashboard/blocoGraf", getBlockGraphAnalytics);

router.post("/dashboard/blocotable", getBlockTableAnalytics);

// lista iformações pra tabela e pra grafico da sala em especifico, do min ao max, vai gerar um lista dos dias
router.post("/dashboard/roomstable", getRoomGraphAnalytics);
router.post("/dashboard/roomsgrafc", getRoomTableAnalytics);
router.post("/dashboard/roomTopUsers", getRoomTopUsers);

// router.get("/dashboard/users", dashboardController.getUsersAnalytics);
export default router;
