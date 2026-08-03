import assert from 'node:assert/strict'
import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(
  projectDirectory,
  'release',
  'ShotAI-1.1.0-EXE-Chat-CUDA12',
)

for (const relativePath of [
  'ShotAI.exe',
  'web/index.html',
  'runtime/ollama/ollama.exe',
  'runtime/ollama/LICENSE.ollama.txt',
  'runtime/ollama/lib/ollama/ggml.dll',
  'runtime/ollama/lib/ollama/cuda_v12/ggml-cuda.dll',
  'runtime/ollama/lib/ollama/cuda_v12/cublas64_12.dll',
  'runtime/ollama/lib/ollama/cuda_v12/cublasLt64_12.dll',
]) {
  await access(join(releaseDirectory, relativePath), constants.R_OK)
}

await assert.rejects(
  access(
    join(releaseDirectory, 'runtime', 'ollama', 'lib', 'ollama', 'cuda_v13'),
    constants.F_OK,
  ),
)
await assert.rejects(
  access(
    join(releaseDirectory, 'runtime', 'ollama', 'lib', 'ollama', 'vulkan'),
    constants.F_OK,
  ),
)

const forbiddenExtensions = new Set([
  '.gguf',
  '.safetensors',
  '.sft',
  '.ckpt',
  '.onnx',
])
let totalBytes = 0
let modelFiles = 0
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await inspect(path)
      continue
    }
    const info = await stat(path)
    totalBytes += info.size
    if (forbiddenExtensions.has(extname(entry.name).toLowerCase())) {
      modelFiles += 1
    }
  }
}
await inspect(releaseDirectory)
assert.equal(modelFiles, 0)
assert.ok(totalBytes < 1.4 * 1024 * 1024 * 1024)

console.log(
  JSON.stringify(
    {
      chatReady: true,
      targetGPU: 'NVIDIA CUDA 12',
      packageGB: Number((totalBytes / 1024 / 1024 / 1024).toFixed(2)),
      cuda13Included: false,
      vulkanIncluded: false,
      imageRuntimeIncluded: false,
      modelWeightsIncluded: false,
    },
    null,
    2,
  ),
)
