import assert from 'node:assert/strict'
import { readdirSync, lstatSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const require = createRequire(import.meta.url)
const config = require(join(root, 'desktop/electron/electron-builder.ubuntu-full.cjs'))
const runtime = config.extraResources.find(item => item.from === 'vendor/ollama/linux')
assert.ok(runtime.filter.includes('!lib/ollama/cuda_v13/**'))
assert.ok(runtime.filter.includes('!lib/ollama/vulkan/**'))
assert.ok(!config.extraResources.some(item => item.to === 'runtime/image'))
function bytes(path) {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) return 0
  return stat.isDirectory() ? readdirSync(path).reduce((sum, name) => sum + bytes(join(path, name)), 0) : stat.size
}
const cuda = join(root, 'vendor/ollama/linux/lib/ollama/cuda_v12')
const libraries = readdirSync(cuda).filter(name => lstatSync(join(cuda, name)).isFile())
  .map(name => ({ name, bytes: bytes(join(cuda, name)) })).sort((a, b) => b.bytes - a.bytes)
const webBytes = bytes(join(root, 'dist'))
// Catch accidental bundling of weights/data instead of hiding growth in a large runtime.
assert.ok(webBytes < 20 * 1024 * 1024, '网页产物超过 20 MiB，请检查误打包或依赖膨胀')
assert.ok(!config.extraResources.some(item => /(?:^|\/)(?:models|logs|data)(?:\/|$)/.test(item.from)))
console.log(JSON.stringify({ webBytes, cuda12Bytes: bytes(cuda), libraries,
  note: 'Uncompressed resource sizes, not installer sizes. Required CUDA libraries are retained.' }, null, 2))
