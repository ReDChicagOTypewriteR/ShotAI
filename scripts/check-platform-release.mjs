import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)

const packageJson = JSON.parse(await read('package.json'))
const windows = require(join(projectDirectory, 'desktop/electron/electron-builder.windows.cjs'))
const ubuntu = require(join(projectDirectory, 'desktop/electron/electron-builder.ubuntu-full.cjs'))
const main = await read('desktop/electron/main.cjs')
const agents = await read('AGENTS.md')

assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/)
assert.equal(packageJson.scripts['release:windows'], 'npm run electron:pack:win:full')
assert.equal(packageJson.scripts['release:ubuntu'], 'npm run electron:pack:ubuntu:full')
for (const command of ['check:release', 'release:windows', 'release:ubuntu', 'release:image:windows', 'release:image:ubuntu']) {
  assert.ok(packageJson.scripts['release:all'].includes(command), `统一发布缺少 ${command}`)
}
assert.ok(packageJson.scripts['check:release'].includes('check:platforms'))
assert.ok(packageJson.scripts['check:release'].includes('check:monitor'))
assert.ok(packageJson.scripts['check:release'].includes('check:windows-runtime'))
assert.ok(packageJson.scripts['check:release'].includes('check:ubuntu-full'))

assert.equal(windows.directories.output, 'release/windows')
assert.equal(ubuntu.directories.output, 'release/ubuntu')
const windowsOllama = windows.extraResources.find((item) => item.from === 'vendor/ollama/windows')
const ubuntuOllama = ubuntu.extraResources.find((item) => item.from === 'vendor/ollama/linux')
assert.ok(windowsOllama?.filter.includes('lib/ollama/cuda_v12/**/*'))
assert.ok(ubuntuOllama?.filter.includes('lib/ollama/cuda_v12/**/*'))
assert.ok(ubuntuOllama.filter.includes('!lib/ollama/cuda_v13/**'))
assert.ok(ubuntuOllama.filter.includes('!lib/ollama/vulkan/**'))
assert.ok(!windows.extraResources.some((item) => item.to === 'runtime/image'))
assert.ok(!ubuntu.extraResources.some((item) => item.to === 'runtime/image'))
assert.ok(!Object.keys(packageJson.scripts).some((name) => /windows-(?:lite|launcher|chat-ready|image-runtime)|pack:win:chat|package:lan/.test(name)))

assert.ok(main.includes("process.platform === 'win32'"))
assert.ok(main.includes("process.platform === 'linux'"))
assert.ok(main.includes("bundledCudaLibrary(executable, 'cuda_v12')"))
assert.ok((await read('scripts/serve-lan.mjs')).includes('loadedModelStatus(loaded).backend'))
for (const file of ['inference-scheduler.mjs', 'model-health.mjs']) {
  assert.ok(ubuntu.extraResources.some((item) => item.to === `shotai/server/${file}`))
  assert.ok(windows.extraResources.some((item) => item.to === `shotai/server/${file}`))
}
assert.ok(agents.includes('codex/unified'))

console.log(JSON.stringify({
  unifiedBranch: true,
  sharedVersion: packageJson.version,
  windowsOutput: 'release/windows',
  ubuntuOutput: 'release/ubuntu',
  platformRuntimesSeparated: true,
  cuda13AndVulkanExcludedFromUbuntu: true,
  imageRuntimeOptional: true,
  releaseAllAvailable: true,
}, null, 2))
