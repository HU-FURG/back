import { Router } from "express";
import {  addRoomToMap, createMap, getMap, getMapSvg, getMaps } from "../controllers/mapsController";
import { uploadMapSvg } from "../middlewares/upload";
// Controller
const router = Router()

// listar
router.get("/", getMaps)
// svg
router.get("/:mapId/svg", getMapSvg) //svg do mapa, para exibir no frontend
router.get("/:mapId", getMap) //info do mapa, incluindo salas e blocos
// edição
router.post("/",uploadMapSvg.single("svg"),createMap)
router.post("/:mapId/rooms", addRoomToMap)



export default router 