// src/routes/roomRoutes.ts
import { Router } from "express";
import {
  deleteScheduling,
  listCurrentRoomStatus,
  listScheduling,
  searchUsersAndRooms,
} from "../controllers/schedulingController";
import { authenticateToken, requireRole } from "../middlewares/authMiddleware";

const router = Router();

router.get(
  "/",
  authenticateToken,
  requireRole(["boss", "admin"]),
  listScheduling,
);
router.get(
  "/search",
  authenticateToken,
  requireRole(["boss", "admin"]),
  searchUsersAndRooms,
);
router.delete(
  "/:id",
  authenticateToken,
  requireRole(["boss", "admin"]),
  deleteScheduling,
);
router.get(
  "/statusnow/:ala",
  authenticateToken,
  requireRole(["boss", "admin"]),
  listCurrentRoomStatus,
);

export default router;
