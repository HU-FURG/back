import { Router } from 'express';
import { login, validateToken, logout, createUser, removeUser, getUsers, loginAnonimo } from '../controllers/userController';
import { authenticateToken, requireAdmin } from '../middlewares/authMiddleware';
const router = Router();

router.post('/login', login);
router.post('/anonimo', loginAnonimo);
router.post("/logout", authenticateToken, logout);
router.get("/validate-token", authenticateToken, validateToken);

// só admins podem criar/remover usuários
router.get("/users", authenticateToken, requireAdmin, getUsers);
router.post("/users", authenticateToken, requireAdmin, createUser);
router.delete("/users", authenticateToken, requireAdmin, removeUser);

export default router;
