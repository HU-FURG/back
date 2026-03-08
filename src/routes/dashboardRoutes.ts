import { Router } from "express";
import {
  getOccupation,
  calculateAverageTime,
  getBlockGraphAnalytics,
  getBlockTableAnalytics,
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
// router.get("/dashboard/roomstable/:id", dashboardController.getRoomAnalytics);
// router.get("/dashboard/roomsgrafc/:id", dashboardController.getRoomAnalytics);

// router.get("/dashboard/users", dashboardController.getUsersAnalytics);
export default router;
