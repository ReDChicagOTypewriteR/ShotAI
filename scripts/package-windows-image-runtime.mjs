import { copyFile, cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJson = JSON.parse(
  await readFile(join(projectDirectory, 'package.json'), 'utf8'),
)
const releaseDirectory = join(
  projectDirectory,
  'release',
  `ShotAI-${packageJson.version}-Optional-Image-Runtime-CUDA12`,
)

await rm(releaseDirectory, { recursive: true, force: true })
await mkdir(join(releaseDirectory, 'runtime'), { recursive: true })
await cp(
  join(projectDirectory, 'vendor', 'stable-diffusion.cpp', 'windows'),
  join(releaseDirectory, 'runtime', 'image'),
  { recursive: true },
)
await copyFile(
  join(projectDirectory, 'docs', 'EXE_IMAGE_RUNTIME_GUIDE.md'),
  join(releaseDirectory, 'README.md'),
)

console.log(`ShotAI 可选图片组件包已生成：${releaseDirectory}`)
console.log('包内只有 Windows CUDA 12 图片运行组件，不包含任何图片模型。')
