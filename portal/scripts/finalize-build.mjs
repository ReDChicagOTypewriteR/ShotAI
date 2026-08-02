import { rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const portalDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

await rename(
  join(portalDirectory, 'dist', 'app.html'),
  join(portalDirectory, 'dist', 'index.html'),
)
