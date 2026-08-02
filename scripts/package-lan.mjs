import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(projectDirectory, 'release', 'shotai-lan')

await rm(releaseDirectory, { recursive: true, force: true })
await mkdir(releaseDirectory, { recursive: true })

await cp(join(projectDirectory, 'dist'), join(releaseDirectory, 'web'), {
  recursive: true,
})
await copyFile(
  join(projectDirectory, 'scripts', 'serve-lan.mjs'),
  join(releaseDirectory, 'server.mjs'),
)
await copyFile(
  join(projectDirectory, 'deploy', 'lan', 'server.ps1'),
  join(releaseDirectory, 'server.ps1'),
)
await copyFile(
  join(projectDirectory, 'lan.config.json'),
  join(releaseDirectory, 'lan.config.json'),
)
await copyFile(
  join(projectDirectory, 'deploy', 'lan', 'start-windows.bat'),
  join(releaseDirectory, 'start-windows.bat'),
)
await copyFile(
  join(projectDirectory, 'deploy', 'lan', 'start-image-runtime.ps1'),
  join(releaseDirectory, 'start-image-runtime.ps1'),
)
await copyFile(
  join(projectDirectory, 'deploy', 'lan', 'prepare-image-runtime.ps1'),
  join(releaseDirectory, 'prepare-image-runtime.ps1'),
)
await copyFile(
  join(projectDirectory, 'deploy', 'lan', '准备图片运行组件.bat'),
  join(releaseDirectory, 'prepare-image-runtime.bat'),
)
await copyFile(
  join(projectDirectory, 'deploy', 'lan', 'start-linux.sh'),
  join(releaseDirectory, 'start-linux.sh'),
)
await mkdir(join(releaseDirectory, 'nginx'), { recursive: true })
await copyFile(
  join(projectDirectory, 'deploy', 'nginx', 'shotai.conf'),
  join(releaseDirectory, 'nginx', 'shotai.conf'),
)

const guide = await readFile(
  join(projectDirectory, 'docs', 'LAN_DEPLOYMENT.md'),
  'utf8',
)
await writeFile(join(releaseDirectory, 'DEPLOYMENT.md'), guide, 'utf8')
await copyFile(
  join(projectDirectory, 'docs', 'USER_GUIDE.md'),
  join(releaseDirectory, 'USER-GUIDE.md'),
)
await copyFile(
  join(projectDirectory, 'CHANGELOG.md'),
  join(releaseDirectory, 'CHANGELOG.md'),
)
await copyFile(
  join(projectDirectory, 'README.md'),
  join(releaseDirectory, 'README.md'),
)
await chmod(join(releaseDirectory, 'start-linux.sh'), 0o755)

const bundledOllamaDirectory = join(
  projectDirectory,
  'vendor',
  'ollama',
  'windows',
)
if (existsSync(bundledOllamaDirectory)) {
  await cp(
    bundledOllamaDirectory,
    join(releaseDirectory, 'runtime', 'ollama'),
    { recursive: true },
  )
  console.log('已包含 Windows Ollama 运行时，目标电脑无需单独安装 Ollama。')
} else {
  await mkdir(join(releaseDirectory, 'runtime', 'ollama'), {
    recursive: true,
  })
  await writeFile(
    join(releaseDirectory, 'runtime', 'ollama', '放置Ollama运行文件.txt'),
    '将 Windows 版 Ollama 运行文件放入此目录，即可由 start-windows.bat 自动启动。\n',
    'utf8',
  )
}

const bundledImageRuntimeDirectory = join(
  projectDirectory,
  'vendor',
  'stable-diffusion.cpp',
  'windows',
)
if (existsSync(bundledImageRuntimeDirectory)) {
  await cp(
    bundledImageRuntimeDirectory,
    join(releaseDirectory, 'runtime', 'image'),
    { recursive: true },
  )
  console.log('已包含 Windows 图片运行组件。')
} else {
  await mkdir(join(releaseDirectory, 'runtime', 'image'), {
    recursive: true,
  })
  await writeFile(
    join(
      releaseDirectory,
      'runtime',
      'image',
      '先运行准备图片运行组件.txt',
    ),
    '联网准备时双击部署目录中的“准备图片运行组件.bat”，程序会从 stable-diffusion.cpp 官方 GitHub 下载 Windows CUDA 12 运行文件。\n',
    'utf8',
  )
}

await mkdir(join(releaseDirectory, 'models', 'image'), {
  recursive: true,
})
await writeFile(
  join(releaseDirectory, 'models', 'image', 'README-IMAGE-MODELS.txt'),
  [
    '单文件版：把 flux2-klein-4b.q4_k.gguf 放入此目录。',
    '画质升级版 Z-Image Turbo（推荐）：把下面 3 个文件一起放入此目录：',
    '1. z_image_turbo-Q6_K.gguf',
    '2. Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    '3. diffusion_pytorch_model.safetensors（或 ae.safetensors）',
    '放好后重新运行 start-windows.bat，ShotAI 会自动查找。',
    '',
  ].join('\n'),
  'utf8',
)

console.log(`内网部署包已生成：${releaseDirectory}`)
console.log('Windows 无需 Node.js；复制整个 shotai-lan 文件夹到主机即可。')
