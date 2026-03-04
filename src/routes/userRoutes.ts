import { Router } from "express";
import {
  login,
  validateToken,
  logout,
  createUser,
  getUsers,
  getMyProfile,
  updateProfile,
  searchUsers,
} from "../controllers/userController";
import { authenticateToken, requireRole } from "../middlewares/authMiddleware";
const router = Router();

router.post("/login", login);
router.post("/logout", authenticateToken, logout);
router.get("/validate-token", authenticateToken, validateToken);

// só Boss podem criar/remover usuários
router.get(
  "/users-search",
  authenticateToken,
  requireRole(["admin", "boss"]),
  searchUsers,
);

router.get("/users", authenticateToken, requireRole(["boss"]), getUsers);
router.post("/users", authenticateToken, requireRole(["boss"]), createUser);

router.get(
  "/my-profile",
  authenticateToken,
  requireRole(["admin", "boss"]),
  getMyProfile,
);

router.patch(
  "/my-profile",
  authenticateToken,
  requireRole(["admin", "boss"]),
  updateProfile,
);

export default router;
