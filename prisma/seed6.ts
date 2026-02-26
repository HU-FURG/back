import { PrismaClient } from "@prisma/client"
import fs from "fs"
import path from "path"

const prisma = new PrismaClient()

function toCSV(data: any[]) {
  if (data.length === 0) return ""

  const headers = Object.keys(data[0]).join(",")
  const rows = data.map(obj =>
    Object.values(obj)
      .map(value =>
        typeof value === "string"
          ? `"${value.replace(/"/g, '""')}"`
          : value
      )
      .join(",")
  )

  return [headers, ...rows].join("\n")
}
function parseCSV(filePath: string) {
  const content = fs.readFileSync(filePath, "utf-8")
  const [headerLine, ...lines] = content.split("\n").filter(Boolean)

  const headers = headerLine.split(",")

  return lines.map(line => {
    const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)

    const obj: any = {}

    headers.forEach((header, i) => {
      let value = values?.[i] ?? ""

      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1).replace(/""/g, '"')
      }

      obj[header] = isNaN(Number(value)) ? value : Number(value)
    })

    return obj
  })
}
async function main() {
  const outputDir = path.resolve(__dirname, "../prisma/seeds")
  const criarCSV = false
  if (criarCSV) {
    const maps = await prisma.map.findMany()
    const mapRooms = await prisma.mapRoom.findMany()

    const mapsCsv = toCSV(maps)
    const mapRoomsCsv = toCSV(mapRooms)

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(path.join(outputDir, "maps.csv"), mapsCsv)
    fs.writeFileSync(path.join(outputDir, "mapRooms.csv"), mapRoomsCsv)

    console.log("CSV gerado com sucesso 🚀")
  } else {
    console.log("🔥 Limpando tabelas...")

    // Ordem importa por causa das relações
    await prisma.mapRoom.deleteMany()
    await prisma.map.deleteMany()

    console.log("📥 Importando CSV...")

    const maps = parseCSV(path.join(outputDir, "maps.csv"))
    const mapRooms = parseCSV(path.join(outputDir, "mapRooms.csv"))

    if (maps.length) {
      await prisma.map.createMany({
        data: maps,
        skipDuplicates: true
      })
    }

    if (mapRooms.length) {
      await prisma.mapRoom.createMany({
        data: mapRooms,
        skipDuplicates: true
      })
    }

    console.log("Seed finalizado 🚀")
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())