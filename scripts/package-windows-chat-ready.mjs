import {
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const liteDirectory = join(
  projectDirectory,
  'release',
  'ShotAI-1.1.0-EXE-Lite',
)
const releaseDirectory = join(
  projectDirectory,
  'release',
  'ShotAI-1.1.0-EXE-Chat-CUDA12',
)
const sourceRuntime = join(
  projectDirectory,
  'vendor',
  'ollama',
  'windows',
)
const targetRuntime = join(releaseDirectory, 'runtime', 'ollama')

await rm(releaseDirectory, { recursive: true, force: true })
await cp(liteDirectory, releaseDirectory, { recursive: true })
await mkdir(join(targetRuntime, 'lib', 'ollama'), { recursive: true })

for (const fileName of [
  'ollama.exe',
  'LICENSE.ollama.txt',
  'SHOTAI_OLLAMA_RUNTIME_INFO.txt',
]) {
  await copyFile(join(sourceRuntime, fileName), join(targetRuntime, fileName))
}

const librarySource = join(sourceRuntime, 'lib', 'ollama')
const libraryTarget = join(targetRuntime, 'lib', 'ollama')
for (const entry of await readdir(librarySource, { withFileTypes: true })) {
  if (entry.isFile()) {
    await copyFile(
      join(librarySource, entry.name),
      join(libraryTarget, entry.name),
    )
  }
}
await cp(
  join(librarySource, 'cuda_v12'),
  join(libraryTarget, 'cuda_v12'),
  { recursive: true },
)
await copyFile(
  join(projectDirectory, 'docs', 'EXE_CHAT_READY_GUIDE.md'),
  join(releaseDirectory, 'README.md'),
)

console.log(`ShotAI CUDA 12 对话免安装包已生成：${releaseDirectory}`)
console.log('已排除 CUDA 13、Vulkan、图片生成组件和全部模型权重。')
