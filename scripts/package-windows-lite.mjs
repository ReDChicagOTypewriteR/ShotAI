import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(
  projectDirectory,
  'release',
  'ShotAI-1.1.0-EXE-Lite',
)

await rm(releaseDirectory, { recursive: true, force: true })
await mkdir(releaseDirectory, { recursive: true })
await cp(join(projectDirectory, 'dist'), join(releaseDirectory, 'web'), {
  recursive: true,
})

for (const [source, destination] of [
  ['build/windows/ShotAI.exe', 'ShotAI.exe'],
  ['deploy/lan/server.ps1', 'server.ps1'],
  ['deploy/lan/start-image-runtime.ps1', 'start-image-runtime.ps1'],
  ['deploy/lan/prepare-image-runtime.ps1', 'prepare-image-runtime.ps1'],
  ['deploy/lan/准备图片运行组件.bat', 'prepare-image-runtime.bat'],
  ['docs/EXE_LITE_GUIDE.md', 'README.md'],
]) {
  await copyFile(join(projectDirectory, source), join(releaseDirectory, destination))
}

const baseConfig = JSON.parse(
  await readFile(join(projectDirectory, 'lan.config.json'), 'utf8'),
)
await writeFile(
  join(releaseDirectory, 'lan.config.json'),
  `${JSON.stringify(
    {
      ...baseConfig,
      version: '1.1.0-preview.3',
      launcherControlPort: 19090,
      allowLanAdministration: false,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

for (const directory of [
  'logs',
  'models/ollama',
  'models/image',
  'runtime/ollama',
  'runtime/image',
]) {
  await mkdir(join(releaseDirectory, directory), { recursive: true })
}

await writeFile(
  join(releaseDirectory, 'models', 'ollama', 'README.txt'),
  [
    'ShotAI 会把通过网页安装的聊天和图片识别模型保存在此目录。',
    '精简包不包含任何模型文件。',
    '',
  ].join('\n'),
  'utf8',
)
await writeFile(
  join(releaseDirectory, 'models', 'image', 'README.txt'),
  [
    '本地图片生成模型放在此目录，也可以在主机网页中选择模型文件。',
    '精简包不包含任何模型文件。',
    '',
  ].join('\n'),
  'utf8',
)
await writeFile(
  join(releaseDirectory, 'runtime', 'ollama', 'README.txt'),
  [
    '已经安装 Ollama 时不需要修改此目录。',
    '需要免安装运行时，可以把 ollama.exe 和配套 lib 目录复制到这里。',
    '',
  ].join('\n'),
  'utf8',
)
await writeFile(
  join(releaseDirectory, 'runtime', 'image', 'README.txt'),
  [
    '图片生成是可选功能。',
    '需要时把 stable-diffusion.cpp Windows CUDA 运行文件复制到这里。',
    '',
  ].join('\n'),
  'utf8',
)

console.log(`ShotAI EXE 精简包已生成：${releaseDirectory}`)
console.log('包内不包含任何模型权重或第三方大型运行组件。')
