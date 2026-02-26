import multer from "multer"
import path from "path"
import fs from "fs"

const uploadDir = path.resolve(process.cwd(), "storage/maps")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}.svg`
    cb(null, uniqueName)
  }
})

export const uploadMapSvg = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "image/svg+xml") {
      cb(new Error("Apenas arquivos SVG são permitidos"))
    } else {
      cb(null, true)
    }
  }
})
