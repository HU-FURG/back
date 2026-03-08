// src/routes/roomRoutes.ts
import { Router } from "express";
import {
  createRoom,
  listRooms,
  editRoom,
  deleteRooms,
  getRoomSchedule,
  getBlockDayGrade,
} from "../controllers/roomController";
import { authenticateToken, requireRole } from "../middlewares/authMiddleware";

const router = Router();

router.post("/room", authenticateToken, requireRole(["boss"]), createRoom);

router.get("/rooms", authenticateToken, listRooms);
router.patch("/room/:id", authenticateToken, requireRole(["boss"]), editRoom);

router.post(
  "/rooms/delete",
  authenticateToken,
  requireRole(["boss"]),
  deleteRooms,
);
router.get("/room/:roomId/Schedule", authenticateToken, getRoomSchedule);

router.get("/grade/:block/:date", authenticateToken, getBlockDayGrade);

export default router;
