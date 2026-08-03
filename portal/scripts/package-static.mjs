import { cp, mkdir, readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const portalDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const projectDirectory = dirname(portalDirectory)
const portalPackage = JSON.parse(
  await readFile(join(portalDirectory, 'package.json'), 'utf8'),
)
const outputDirectory = join(
  projectDirectory,
  'release',
  `ShotAI-${portalPackage.version}-Portal-Static`,
)

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(join(portalDirectory, 'dist'), outputDirectory, { recursive: true })

console.log(`ShotAI 门户静态目录已生成：${outputDirectory}`)
console.log('目录内为 index.html 和本地图片资源，可直接上传静态服务器。')
