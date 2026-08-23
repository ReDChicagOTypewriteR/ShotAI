import assert from 'node:assert/strict'
import { access, open, readFile, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const runtimeDirectory = join(projectDirectory, 'vendor', 'ollama', 'linux')
const executablePath = join(runtimeDirectory, 'bin', 'ollama')
const libraryDirectory = join(runtimeDirectory, 'lib', 'ollama')
const packageJson = JSON.parse(
  await readFile(join(projectDirectory, 'package.json'), 'utf8'),
)
const mainSource = await readFile(
  join(projectDirectory, 'desktop', 'electron', 'main.cjs'),
  'utf8',
)
const require = createRequire(import.meta.url)
const fullConfig = require(
  join(projectDirectory, 'desktop', 'electron', 'electron-builder.ubuntu-full.cjs'),
)

for (const path of [
  executablePath,
  libraryDirectory,
  join(runtimeDirectory, 'LICENSE.ollama.txt'),
  join(runtimeDirectory, 'SHOTAI_OLLAMA_RUNTIME_INFO.txt'),
  join(projectDirectory, 'desktop', 'electron', 'after-install-linux.sh'),
]) {
  await access(path, constants.R_OK)
}

const executable = await open(executablePath, 'r')
const elfMagic = Buffer.alloc(4)
await executable.read(elfMagic, 0, elfMagic.length, 0)
await executable.close()
assert.deepEqual([...elfMagic], [0x7f, 0x45, 0x4c, 0x46])
assert.ok((await stat(executablePath)).mode & 0o111, 'Ollama 缺少执行权限')

const libraryEntries = await readdir(libraryDirectory, { recursive: true })
assert.ok(libraryEntries.length > 5, 'Ollama Linux GPU 运行库不完整')
assert.ok(
  libraryEntries.some((entry) => /cuda/i.test(entry)),
  'Ollama Linux 包缺少 CUDA 运行库',
)

assert.equal(
  fullConfig.linux.artifactName,
  'ShotAI-${version}-Ubuntu-22.04-x86_64-Full-Ollama-CUDA.${ext}',
)
assert.equal(fullConfig.directories.output, 'release/ubuntu')
assert.ok(
  fullConfig.extraResources.some(
    (resource) =>
      resource.from === 'vendor/ollama/linux' &&
      resource.filter.includes('bin/ollama') &&
      resource.filter.includes('lib/ollama/**/*'),
  ),
)
assert.ok(mainSource.includes("[name, join('bin', name)]"))
assert.ok(mainSource.includes('findPrivateOllamaUrl'))
assert.ok(mainSource.includes('SHOTAI_OLLAMA_MODEL_DIRECTORY'))
assert.ok(mainSource.includes('SHOTAI_SYSTEM_OLLAMA_DETECTED'))
assert.ok(mainSource.includes('请先从托盘退出旧版 ShotAI'))
assert.ok(mainSource.includes('prepareRuntimeLogDirectory'))
assert.ok(mainSource.includes("runtimeLogFile('ollama.log')") || mainSource.includes("openProcessLog('ollama.log')"))
assert.ok(mainSource.includes("bundledCudaLibrary(executable, 'cuda_v12')"))
assert.ok(mainSource.includes("OLLAMA_LLM_LIBRARY: preferredComputeLibrary"))
assert.ok(mainSource.includes("OLLAMA_NO_CLOUD: 'true'"))
assert.ok(mainSource.includes("process.env.OLLAMA_CONTEXT_LENGTH || '8192'"))
assert.ok(mainSource.includes("process.kill(-child.pid, 'SIGTERM')"))
assert.ok(mainSource.includes('confirmQuitDuringModelImport'))
assert.ok(mainSource.includes('cleanupInterruptedOllamaCopies'))
assert.equal(
  packageJson.build.deb.afterInstall,
  'desktop/electron/after-install-linux.sh',
)
assert.ok(packageJson.scripts['electron:pack:ubuntu:full'])
assert.equal(
  packageJson.scripts['build:ubuntu:full'],
  'npm run electron:pack:ubuntu:full',
)

console.log(
  JSON.stringify(
    {
      ubuntuFullPackage: true,
      architecture: 'x86_64',
      bundledOllama: true,
      bundledCudaLibraries: true,
      bundledModels: false,
      isolatedOllamaRuntime: true,
      oldServiceConflictGuard: true,
      installDirectoryLogs: true,
      v100Cuda12Pinned: true,
      offlineCloudRequestsDisabled: true,
      importExitProtection: true,
      interruptedCopyCleanup: true,
      imageRuntime: 'requires Ubuntu 22.04 native build',
    },
    null,
    2,
  ),
)
