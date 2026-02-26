import { Router } from "express";
import {  addRoomToMap, confirmRoom, createMap, deleteRoomFromMap, getMap, getMapStatus, getMapSvg, getMaps, getRoomByElement } from "../controllers/mapsController";
import { uploadMapSvg } from "../middlewares/upload";
// Controller
const router = Router()

// listar
router.get("/", getMaps)
// svg
router.get("/:mapId/svg", getMapSvg) //svg do mapa, para exibir no frontend
router.get("/:mapId", getMap) //info do mapa, incluindo salas e blocos

// Registro de salas em mapas
router.get("/:mapId/rooms/by-element/:svgElementId", getRoomByElement)
router.delete("/:mapId/rooms/:mapRoomId", deleteRoomFromMap)
// info mapa
router.get("/:mapId/status", getMapStatus)


// edição
router.post("/",uploadMapSvg.single("svg"),createMap)
router.post("/:mapId/rooms", addRoomToMap)
router.get("/confirmRoom/search", confirmRoom)



export default router 