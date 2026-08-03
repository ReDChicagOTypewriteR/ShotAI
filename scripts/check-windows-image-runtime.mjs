import assert from 'node:assert/strict'
import { access, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(
  projectDirectory,
  'release',
  'ShotAI-1.1.0-Optional-Image-Runtime-CUDA12',
)

for (const relativePath of [
  'README.md',
  'runtime/image/sd-server.exe',
  'runtime/image/stable-diffusion.dll',
  'runtime/image/ggml-cuda.dll',
  'runtime/image/cublas64_12.dll',
  'runtime/image/cublasLt64_12.dll',
  'runtime/image/SHOTAI_RUNTIME_INFO.txt',
]) {
  await access(join(releaseDirectory, relativePath), constants.R_OK)
}

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

assert.equal(modelFiles, 0, '可选图片组件包不应包含模型文件')
assert.ok(totalBytes < 1.3 * 1024 * 1024 * 1024)

console.log(
  JSON.stringify(
    {
      imageGenerationRuntime: true,
      targetGPU: 'NVIDIA CUDA 12',
      packageGB: Number((totalBytes / 1024 / 1024 / 1024).toFixed(2)),
      modelWeightsIncluded: false,
    },
    null,
    2,
  ),
)
