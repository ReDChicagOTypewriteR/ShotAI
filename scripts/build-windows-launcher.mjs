import { access, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceDirectory = join(projectDirectory, 'desktop', 'launcher')
const outputDirectory = join(projectDirectory, 'build', 'windows')
const outputPath = join(outputDirectory, 'ShotAI.exe')
const goBinary = process.env.SHOTAI_GO_BIN || 'go'
const releaseVersion = process.env.SHOTAI_LAUNCHER_VERSION || '1.1.0-preview.3'

await mkdir(outputDirectory, { recursive: true })
await access(join(sourceDirectory, 'rsrc_windows_amd64.syso'))

const build = spawnSync(
  goBinary,
  [
    'build',
    '-trimpath',
    `-ldflags=-s -w -H=windowsgui -X main.version=${releaseVersion}`,
    '-o',
    outputPath,
    '.',
  ],
  {
    cwd: sourceDirectory,
    stdio: 'inherit',
    env: {
      ...process.env,
      CGO_ENABLED: '0',
      GOARCH: 'amd64',
      GOOS: 'windows',
      GOCACHE:
        process.env.SHOTAI_GO_CACHE || '/private/tmp/shotai-go-build-cache',
      GOPATH: process.env.SHOTAI_GO_PATH || '/private/tmp/shotai-go-path',
    },
  },
)

if (build.error) {
  throw new Error(
    `无法运行 Go 编译器。请设置 SHOTAI_GO_BIN：${build.error.message}`,
  )
}
if (build.status !== 0) {
  process.exit(build.status ?? 1)
}

console.log(`Windows 启动器已生成：${outputPath}`)
