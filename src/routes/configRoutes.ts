import { Router } from "express";
import {
  changePass,
  createBloco,
  createEspecialidadeRoom,
  createEspecialidadeUser,
  createUser,
  deleteBloco,
  deleteEspecialidadeRoom,
  deleteEspecialidadeUser,
  deleteUser,
  editBloco,
  editMySelf,
  editUser,
  getRoomFilters,
  listBlocos,
  listRoomEspecialidades,
  listUsers,
  listUsersDesactive,
  listUsersEspecialidades,
  myInfo,
  updateEspecialidadeRoom,
  updateEspecialidadeUser,
} from "../controllers/configControllers";
import { authenticateToken, requireRole } from "../middlewares/authMiddleware";

const router = Router();

//------------------------------------------------
// Room Filters
//------------------------------------------------
router.get("/rooms/filters", authenticateToken, getRoomFilters);

//especialidades salas
router.get("/rooms/especialidades", authenticateToken, listRoomEspecialidades);

router.post(
  "/rooms/especialidades",
  authenticateToken,
  requireRole(["boss"]),
  createEspecialidadeRoom,
);
router.put(
  "/rooms/especialidades/:id",
  authenticateToken,
  requireRole(["boss"]),
  updateEspecialidadeRoom,
);
router.delete(
  "/rooms/especialidades/:id",
  authenticateToken,
  requireRole(["boss"]),
  deleteEspecialidadeRoom,
);

//-------------------------------------------------
// especialidade users
//-------------------------------------------------
router.get("/users/especialidades", authenticateToken, listUsersEspecialidades);

router.post(
  "/users/especialidades",
  authenticateToken,
  requireRole(["boss"]),
  createEspecialidadeUser,
);

router.put(
  "/users/especialidades/:id",
  authenticateToken,
  requireRole(["boss"]),
  updateEspecialidadeUser,
);

router.delete(
  "/users/especialidades/:id",
  authenticateToken,
  requireRole(["boss"]),
  deleteEspecialidadeUser,
);

//------------------------------------------------
// Users
//------------------------------------------------
router.get("/users", authenticateToken, requireRole(["boss"]), listUsers);

router.get(
  "/users/desactive",
  authenticateToken,
  requireRole(["boss"]),
  listUsersDesactive,
);

router.post("/users", authenticateToken, requireRole(["boss"]), createUser);

router.put("/users/:id", authenticateToken, requireRole(["boss"]), editUser);

router.delete(
  "/users/:id",
  authenticateToken,
  requireRole(["boss"]),
  deleteUser,
);

router.get("/user-my", authenticateToken, myInfo);
router.put("/user-my", authenticateToken, editMySelf);
router.put("/user-pass", authenticateToken, changePass);

//------------------------------------------------
// Blocos/alas de salas
//------------------------------------------------
router.get("/blocos", authenticateToken, listBlocos);
router.post("/blocos", authenticateToken, requireRole(["boss"]), createBloco);
router.put("/blocos/:id", authenticateToken, requireRole(["boss"]), editBloco);
router.delete(
  "/blocos/:id",
  authenticateToken,
  requireRole(["boss"]),
  deleteBloco,
);

export default router;
