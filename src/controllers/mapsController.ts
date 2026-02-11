import { Request, Response } from "express"
import fs from "fs"
import path from "path"
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

    if (!map) {
      return res.status(404).json({ error: "Mapa não encontrado" })
    }

    const room = await prisma.room.findUnique({
      where: { id: Number(roomId) }
    })

    if (!room) {
      return res.status(404).json({ error: "Sala não encontrada" })
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
