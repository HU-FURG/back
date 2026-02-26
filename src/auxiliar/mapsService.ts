import fs from "fs"
import path from "path"

const MAPS_DIR = path.resolve("storage/maps")

export function loadRegistry() {
  const file = path.join(MAPS_DIR, "registry.json")
  return JSON.parse(fs.readFileSync(file, "utf-8"))
}

export function getMapMeta(mapKey: string) {
  const registry = loadRegistry()
  const map = registry[mapKey]

  if (!map) return null

  return {
    svgPath: path.join(MAPS_DIR, map.svg),
    configPath: path.join(MAPS_DIR, map.config)
  }
}

export function listMaps() {
  const registry = loadRegistry()

  return Object.entries(registry).map(([key, value]: any) => ({
    key,
    label: value.label
  }))
}

export function saveMapConfig(mapKey: string, config: any) {
  const meta = getMapMeta(mapKey)
  if (!meta) return false

  fs.writeFileSync(
    meta.configPath,
    JSON.stringify(config, null, 2),
    "utf-8"
  )

  return true
}