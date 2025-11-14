import { Router } from 'express';
import { login, validateToken, logout, createUser, removeUser, getUsers, loginAnonimo } from '../controllers/userController';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware';
const router = Router();

router.post('/login', login); // definir que tipo de usuario logou;
router.post('/anonimo', loginAnonimo);
router.post("/logout", authenticateToken, logout);
router.get("/validate-token", authenticateToken, validateToken);

// só admins podem criar/remover usuários
router.get("/users",authenticateToken, requireRole(["admin"]),  getUsers);
router.post("/users", authenticateToken, requireRole(["admin"]), createUser);
router.delete("/users", authenticateToken, requireRole(["admin"]), removeUser);

export default router;
