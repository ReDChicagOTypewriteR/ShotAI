import assert from 'node:assert/strict'
import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const unpackedDirectory = join(
  projectDirectory,
  'release',
  'electron',
  'win-unpacked',
)

for (const path of [
  'ShotAI.exe',
  'resources/runtime/ollama/ollama.exe',
  'resources/runtime/ollama/lib/ollama/llama-quantize.exe',
  'resources/runtime/ollama/lib/ollama/llama-server.exe',
  'resources/runtime/ollama/lib/ollama/libllama-quantize-impl.dll',
  'resources/runtime/ollama/lib/ollama/libllama-server-impl.dll',
  'resources/runtime/ollama/lib/ollama/cuda_v12/ggml-cuda.dll',
  'resources/runtime/image/sd-server.exe',
  'resources/shotai/server/serve-lan.mjs',
]) {
  await access(join(unpackedDirectory, path), constants.R_OK)
}

await assert.rejects(
  access(
    join(
      unpackedDirectory,
      'resources/runtime/ollama/lib/ollama/cuda_v13',
    ),
    constants.F_OK,
  ),
)
await assert.rejects(
  access(
    join(unpackedDirectory, 'resources/runtime/ollama/lib/ollama/vulkan'),
    constants.F_OK,
  ),
)

const modelExtensions = new Set([
  '.gguf',
  '.safetensors',
  '.sft',
  '.ckpt',
  '.onnx',
])
let modelFiles = 0
let totalBytes = 0
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await inspect(path)
      continue
    }
    totalBytes += (await stat(path)).size
    if (modelExtensions.has(extname(entry.name).toLowerCase())) modelFiles += 1
  }
}
await inspect(unpackedDirectory)

assert.equal(modelFiles, 0, '完整安装包不应包含模型文件')
assert.ok(totalBytes < 3.2 * 1024 * 1024 * 1024)

console.log(
  JSON.stringify(
    {
      electronFullPackage: true,
      ollamaIncluded: true,
      llamaQuantizeIncluded: true,
      llamaServerIncluded: true,
      imageRuntimeIncluded: true,
      cuda12Included: true,
      cuda13Included: false,
      vulkanIncluded: false,
      modelWeightsIncluded: false,
      unpackedGB: Number((totalBytes / 1024 / 1024 / 1024).toFixed(2)),
    },
    null,
    2,
  ),
)
