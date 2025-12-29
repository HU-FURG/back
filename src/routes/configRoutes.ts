import { Router } from 'express';
import { createBloco, createEspecialidadeRoom, createEspecialidadeUser, createUser, editBloco, editUser, getRoomFilters, listBlocos, listRoomEspecialidades, listUsers, listUsersEspecialidades, updateEspecialidadeRoom } from '../controllers/configControllers';
import { authenticateToken } from '../middlewares/authMiddleware';

const router = Router();

//------------------------------------------------
// Room Filters
//------------------------------------------------
router.get('/rooms/filters', authenticateToken, getRoomFilters);

//especialidades salas
router.get('/rooms/especialidades', authenticateToken, listRoomEspecialidades);
router.post('/rooms/especialidades', authenticateToken, createEspecialidadeRoom);
router.put('/rooms/especialidades/:id', authenticateToken, updateEspecialidadeRoom);
//-------------------------------------------------
// especialidade users
//-------------------------------------------------
router.get('/users/especialidades', authenticateToken, listUsersEspecialidades);
router.post('/users/especialidades', authenticateToken, createEspecialidadeUser);
//------------------------------------------------
// Users
//------------------------------------------------
router.get('/users', authenticateToken, listUsers);
router.post('/users', authenticateToken, createUser);
router.put('/users/:id', authenticateToken, editUser);
//------------------------------------------------
// Blocos/alas de salas
//------------------------------------------------
router.get('/blocos', authenticateToken, listBlocos);
router.post('/blocos', authenticateToken, createBloco);
router.put('/blocos/:id', authenticateToken, editBloco);

export default router;
