import { Router } from 'express';
import { login, validateToken, logout, createUser, removeUser } from '../controllers/userController';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware';
const router = Router();

router.post('/login', login);
router.post("/logout", authenticateToken, logout);
router.get("/validate-token", authenticateToken, validateToken);

// só admins podem criar/remover usuários
router.post("/users", authenticateToken, requireAdmin, createUser);
router.delete("/users", authenticateToken, requireAdmin, removeUser);

export default router;
