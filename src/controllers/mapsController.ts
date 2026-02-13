import { Request, Response } from "express"
import fs from "fs"
import path from "path"
import { z } from "zod"
import { prisma } from "../prisma/client"

// ========================
// LISTAR MAPAS (agora do BD)
// ========================
export async function getMaps(req: Request, res: Response) {
  try {
    const maps = await prisma.map.findMany({
      include: {
        bloco: true
      }
    })

    return res.json(maps)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao listar mapas" })
  }
}

// ========================
// BUSCAR MAPA POR ID
// ========================
export async function getMap(req: Request, res: Response) {
  const { mapId } = req.params

  try {
    const map = await prisma.map.findUnique({
      where: { id: Number(mapId) },
      include: {
        bloco: true,
        salas: {
          include: {
            room: true
          }
        }
      }
    })

    if (!map) {
      return res.status(404).json({ error: "Mapa não encontrado" })
    }

    return res.json(map)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao buscar mapa" })
  }
}

// ========================
// SERVIR SVG DO MAPA
// ========================
export async function getMapSvg(req: Request, res: Response) {
  const { mapId } = req.params

  try {
    const map = await prisma.map.findUnique({
      where: { id: Number(mapId) }
    })

    if (!map) {
      return res.status(404).json({ error: "Mapa não encontrado" })
    }

    if (!fs.existsSync(map.svgPath)) {
      return res.status(404).json({ error: "Arquivo SVG não encontrado no servidor" })
    }

    res.setHeader("Content-Type", "image/svg+xml")
    fs.createReadStream(path.resolve(map.svgPath)).pipe(res)
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao carregar SVG" })
  }
}

export async function createMap(req: Request, res: Response) {
  let uploadedFilePath: string | null = null

  try {
    const { blocoId, posX, posY, andar } = req.body

    if (!req.file) {
      return res.status(400).json({ error: "SVG é obrigatório" })
    }

    uploadedFilePath = path.resolve(
      process.cwd(),
      `storage/maps/${req.file.filename}`
    )

    // 🔍 Verifica se bloco existe
    const bloco = await prisma.blocoRoom.findUnique({
      where: { id: Number(blocoId) }
    })

    if (!bloco) {
      fs.unlinkSync(uploadedFilePath)
      return res.status(404).json({ error: "Bloco não encontrado" })
    }


    // ✅ Cria mapa usando nome do bloco
    const map = await prisma.map.create({
      data: {
        nome: bloco.nome, // <- força igualdade
        blocoId: bloco.id,
        svgPath: `storage/maps/${req.file.filename}`,
        posX: Number(posX) || 0,
        posY: Number(posY) || 0,
        andar: Number(andar) || 0
      }
    })

    return res.status(201).json(map)

  } catch (error) {
    console.error(error)

    // 🧹 Se falhou depois do upload, remove arquivo
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlinkSync(uploadedFilePath)
    }

    return res.status(500).json({ error: "Erro ao criar mapa" })
  }
}

export async function addRoomToMap(req: Request, res: Response) {
  const { mapId } = req.params
  const { roomId, svgElementId } = req.body

  try {
    const map = await prisma.map.findUnique({
      where: { id: Number(mapId) }
    })
    // verificar mapa
    if (!map) {
      return res.status(404).json({ error: "Mapa não encontrado" })
    }
    // verificar sala
    const room = await prisma.room.findUnique({
      where: { id: Number(roomId) }
    })

    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada" })
    }
    //verificar se sala já vinculada a algum mapa
    const existing = await prisma.mapRoom.findFirst({
      where: {
        roomId: Number(roomId)
      }
    })

    if (existing) {
      return res.status(400).json({
        error: "Essa sala já está vinculada a um mapa!"
      })
    }

    //verificar se  elementeo svg já vinculado a alguma sala nesse mapa
    const existingElement = await prisma.mapRoom.findFirst({
      where: {
        mapId: Number(mapId),
        svgElementId
      }
    })

    if (existingElement) {
      return res.status(400).json({
        error: "Essa sala no mapa já está vinculada a uma sala nesse mapa!"
      })
    }


    const relation = await prisma.mapRoom.create({
      data: {
        mapId: Number(mapId),
        roomId: Number(roomId),
        svgElementId
      }
    })

    return res.status(201).json(relation)
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({
        error: "Essa sala já está vinculada a esse mapa"
      })
    }

    console.error(error)
    return res.status(500).json({ error: "Erro ao vincular sala ao mapa" })
  }
}

export async function confirmRoom(req: Request, res: Response ) {
    try {
      const schema = z.object({
        search: z.string().min(1),
      })
  
      const { search } = schema.parse(req.query)
  
      // 1. Busca de Salas
      const rooms = await prisma.room.findMany({
        where: {
          active: true,
          ID_Ambiente: { contains: search, mode: "insensitive" }
        },
        select: {
          id: true,
          ID_Ambiente: true,
          bloco: { select: { nome: true } }
        },
        take: 5 // Limite para não sobrecarregar
      })

      const response = rooms.map(room => ({
        id: room.id,
        title: room.ID_Ambiente,
        subtitle: room.bloco?.nome ?? "Sem Bloco",
        type: "room"
      }))

      return res.json(response)
    } catch (error) {
      console.error(error)
      return res.status(500).json({ error: "Erro ao buscar salas" })
    }
}

// Controle do registro

export async function getRoomByElement(req: Request, res: Response) {
  const { mapId, svgElementId } = req.params

  try {
    const relation = await prisma.mapRoom.findFirst({
      where: {
        mapId: Number(mapId),
        svgElementId
      },
      include: {
        room: {
          select: {
            id: true,
            ID_Ambiente: true,
            bloco: { select: { nome: true } }
          }
        }
      }
    })

    if (!relation) {
      return res.status(404).json({ message: "Elemento livre" })
    }

    return res.json({
      id: relation.id,
      svgElementId: relation.svgElementId,
      room: relation.room
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao buscar vínculo" })
  }
}


export async function deleteRoomFromMap(req: Request, res: Response) {
  const { mapId, mapRoomId } = req.params

  try {
    const relation = await prisma.mapRoom.findFirst({
      where: {
        id: Number(mapRoomId),
        mapId: Number(mapId)
      }
    })

    if (!relation) {
      return res.status(404).json({ error: "Vínculo não encontrado" })
    }

    await prisma.mapRoom.delete({
      where: { id: Number(mapRoomId) }
    })

    return res.json({ message: "Sala desvinculada com sucesso" })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao desvincular sala" })
  }
}

// info por mapa

export async function getMapStatus(req: Request, res: Response) {
  const { mapId } = req.params

  try {
    const now = new Date()

    const mapRooms = await prisma.mapRoom.findMany({
      where: {
        mapId: Number(mapId)
      },
      include: {
        room: {
          include: {
            bloco: true,
            periods: {
              where: {
                approved: true,
                start: { lte: now },
                end: { gte: now }
              },
              include: {
                scheduledFor: {
                  select: { id: true, nome: true, login: true }
                },
                createdBy: {
                  select: { id: true, nome: true, login: true }
                }
              }
            }
          }
        }
      }
    })

    const response = mapRooms.map((mr) => {
      const activePeriod = mr.room.periods[0] || null

      return {
        svgElementId: mr.svgElementId,
        roomId: mr.room.id,
        roomName: mr.room.ID_Ambiente,
        bloco: mr.room.bloco.nome,
        occupied: !!activePeriod,
        currentPeriod: activePeriod
          ? {
              start: activePeriod.start,
              end: activePeriod.end,
              scheduledFor: activePeriod.scheduledFor,
              createdBy: activePeriod.createdBy
            }
          : null
      }
    })

    return res.json(response)

  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: "Erro ao buscar status do mapa" })
  }
}
