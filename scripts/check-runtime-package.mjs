import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { extractFile, listPackage } from '@electron/asar'

const root = process.argv[2]
if (!root) throw new Error('Usage: npm run check:runtime-package -- <unpacked resources directory>')
const config = JSON.parse(await readFile('package.json', 'utf8'))
for (const resource of config.build.extraResources) {
  const target = join(root, resource.to)
  await access(target)
  if (/\.(mjs|cjs|json)$/.test(resource.from)) assert.deepEqual(await readFile(target), await readFile(resource.from), `Stale packaged resource: ${resource.from}`)
}
const archive = join(root, 'app.asar')
const files = listPackage(archive)
assert.ok(files.includes('/desktop/electron/main.cjs'))
const main = extractFile(archive, 'desktop/electron/main.cjs').toString()
assert.equal(main, await readFile('desktop/electron/main.cjs', 'utf8'))
// extraResources sources are excluded from app.asar by electron-builder.
// Check the real packaged location instead of relying on development paths.
assert.match(main, /join\(process\.resourcesPath, 'shotai', 'server', 'runtime-diagnostics.cjs'\)/)
assert.match(main, /join\(process\.resourcesPath, 'shotai', 'server', 'build-info.json'\)/)
await access(join(root, 'shotai/server/runtime-diagnostics.cjs'))
const build = JSON.parse(await readFile(join(root, 'shotai/server/build-info.json'), 'utf8'))
assert.equal(build.version, config.version)
assert.ok(build.sourceFingerprint?.length === 64)
const metadata = await readFile(join(root, 'runtime/ollama/SHOTAI_OLLAMA_RUNTIME_INFO.txt'), 'utf8')
assert.match(metadata, /Version: v0.40.16/)
await access(join(root, 'runtime/ollama/lib/ollama/cuda_v12'))
await assert.rejects(access(join(root, 'runtime/ollama/lib/ollama/cuda_v13')))
await assert.rejects(access(join(root, 'runtime/ollama/lib/ollama/vulkan')))
console.log(JSON.stringify({ packagedMainAndServer: true, exactSourceMatch: true, buildId: build.buildId,
  runtime: '0.40.16', cuda12: true, cuda13: false, vulkan: false, nativeExecutionTested: false }))
