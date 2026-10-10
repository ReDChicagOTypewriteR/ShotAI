import assert from 'node:assert/strict'
import { access, open, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const runtimeDirectory = join(projectDirectory, 'vendor', 'ollama', 'windows')
const require = createRequire(import.meta.url)
const config = require(join(projectDirectory, 'desktop/electron/electron-builder.windows.cjs'))
const executable = join(runtimeDirectory, 'ollama.exe')
for (const path of [
  executable,
  join(runtimeDirectory, 'lib/ollama/cuda_v12/ggml-cuda.dll'),
  join(runtimeDirectory, 'LICENSE.ollama.txt'),
]) await access(path, constants.R_OK)

const handle = await open(executable, 'r')
try {
  const header = Buffer.alloc(4096)
  await handle.read(header, 0, header.length, 0)
  assert.equal(header.toString('ascii', 0, 2), 'MZ')
  const peOffset = header.readUInt32LE(0x3c)
  assert.equal(header.toString('ascii', peOffset, peOffset + 4), 'PE\0\0')
  assert.equal(header.readUInt16LE(peOffset + 4), 0x8664, 'Windows Ollama 不是 x86_64 二进制')
} finally {
  await handle.close()
}
assert.equal(config.directories.output, 'release/windows')
const ollamaResource = config.extraResources.find((item) => item.from === 'vendor/ollama/windows')
assert.ok(ollamaResource)
assert.ok(ollamaResource.filter.includes('lib/ollama/cuda_v12/**/*'))
assert.ok(!ollamaResource.filter.some((entry) => /cuda_v13|vulkan/i.test(entry)))
assert.ok(!config.extraResources.some((item) => item.to === 'runtime/image'))
const main = await readFile(join(projectDirectory, 'desktop/electron/main.cjs'), 'utf8')
assert.match(main, /bundledCudaLibrary\(executable, 'cuda_v12'\)/)
assert.match(main, /Windows 图片运行扩展尚未安装/)
console.log(JSON.stringify({ windowsRuntime: true, architecture: 'x86_64', cuda12: true, imageExtensionOptional: true }))
