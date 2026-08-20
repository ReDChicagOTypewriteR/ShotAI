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
assert.ok(
  fullConfig.extraResources.some(
    (resource) =>
      resource.from === 'vendor/ollama/linux' &&
      resource.filter.includes('bin/ollama') &&
      resource.filter.includes('lib/ollama/**/*'),
  ),
)
assert.ok(mainSource.includes("[name, join('bin', name)]"))
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
      imageRuntime: 'requires Ubuntu 22.04 native build',
    },
    null,
    2,
  ),
)
