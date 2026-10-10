import assert from 'node:assert/strict'
import { readFile, stat, access, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
const root = new URL('..', import.meta.url).pathname
const { version } = JSON.parse(await readFile(join(root, 'package.json')))
const unpacked = join(root, 'release/ubuntu/linux-unpacked')
for (const file of ['serve-lan.mjs', 'inference-scheduler.mjs', 'model-health.mjs', 'import-diagnostics.mjs', 'model-maintenance.mjs', 'request-permissions.mjs', 'task-registry.mjs']) {
  assert.deepEqual(await readFile(join(unpacked, 'resources/shotai/server', file)), await readFile(join(root, 'scripts', file)))
}
assert.deepEqual(await readFile(join(unpacked, 'resources/shotai/web/index.html')), await readFile(join(root, 'dist/index.html')))
for (const file of await readdir(join(unpacked, 'resources/shotai/web/assets'))) {
  if (!/\.(js|css)$/.test(file)) continue
  assert.doesNotMatch(await readFile(join(unpacked, 'resources/shotai/web/assets', file), 'utf8'), /desktop-pet|desktopPetEnabled|开启桌面宠物/, '安装包仍包含宠物功能')
}
const config = JSON.parse(await readFile(join(unpacked, 'resources/shotai/lan.config.json')))
assert.equal(config.concurrency.maxActiveUsers, 5)
const binary = await readFile(join(unpacked, 'shotai'))
assert.equal(binary.subarray(0, 4).toString('hex'), '7f454c46')
assert.equal(binary.readUInt16LE(18), 62, 'Expected Linux x86_64 ELF')
const runtime = join(unpacked, 'resources/runtime/ollama/lib/ollama')
await access(join(runtime, 'cuda_v12'))
for (const excluded of ['cuda_v13', 'vulkan']) await assert.rejects(access(join(runtime, excluded)))
await assert.rejects(access(join(unpacked, 'resources/runtime/image')))
for (const extension of ['deb', 'AppImage']) {
  const name = `ShotAI-${version}-Ubuntu-22.04-x86_64-Ollama-CUDA12.${extension}`
  const path = join(root, 'release/ubuntu', name)
  const info = await stat(path)
  assert.ok(info.size > 100 * 1024 ** 2)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  console.log(JSON.stringify({ artifact: name, bytes: info.size, sha256: hash.digest('hex') }))
}
console.log(JSON.stringify({ ubuntuArtifacts: true, currentServerModules: true, currentWeb: true, architecture: 'x86_64', cuda12Only: true }))
