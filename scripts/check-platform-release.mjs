import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const packageJson = JSON.parse(await read('package.json'))
const windows = await read('desktop/electron/electron-builder.windows.cjs')
const ubuntu = await read('desktop/electron/electron-builder.ubuntu-full.cjs')
const main = await read('desktop/electron/main.cjs')
const agents = await read('AGENTS.md')

assert.equal(packageJson.version, '1.2.0', '本次整理不得修改版本号')
assert.equal(packageJson.scripts['release:windows'], 'npm run electron:pack:win:full')
assert.equal(packageJson.scripts['release:ubuntu'], 'npm run electron:pack:ubuntu:full')
assert.ok(packageJson.scripts['release:all'].includes('release:windows'))
assert.ok(packageJson.scripts['release:all'].includes('release:ubuntu'))

assert.ok(windows.includes("output: 'release/windows'"))
assert.ok(windows.includes("from: 'vendor/ollama/windows'"))
assert.ok(windows.includes("from: 'vendor/stable-diffusion.cpp/windows'"))
assert.ok(ubuntu.includes("output: 'release/ubuntu'"))
assert.ok(ubuntu.includes("from: 'vendor/ollama/linux'"))
assert.ok(ubuntu.includes("from: 'vendor/stable-diffusion.cpp/linux'"))

assert.ok(main.includes("process.platform === 'win32'"))
assert.ok(main.includes("process.platform === 'linux'"))
assert.ok(agents.includes('codex/unified'))

console.log(JSON.stringify({
  unifiedBranch: true,
  sharedVersion: packageJson.version,
  windowsOutput: 'release/windows',
  ubuntuOutput: 'release/ubuntu',
  platformRuntimesSeparated: true,
  releaseAllAvailable: true,
}, null, 2))
