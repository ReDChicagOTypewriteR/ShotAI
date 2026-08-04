import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const projectDirectory = resolve(import.meta.dirname, '..')
const dataRoot = mkdtempSync(join(tmpdir(), 'shotai-model-reuse-'))
const port = 19091
const server = spawn(process.execPath, ['scripts/serve-lan.mjs'], {
  cwd: projectDirectory,
  stdio: ['ignore', 'ignore', 'inherit'],
  env: {
    ...process.env,
    SHOTAI_DATA_ROOT: dataRoot,
    SHOTAI_WEB_ROOT: join(projectDirectory, 'dist'),
    SHOTAI_LAN_HOST: '127.0.0.1',
    SHOTAI_LAN_PORT: String(port),
    SHOTAI_OLLAMA_URL: 'http://127.0.0.1:19999',
  },
})

const baseUrl = `http://127.0.0.1:${port}`

async function waitUntilReady() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/shotai/system`)
      if (response.ok) return
    } catch {
      // Server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error('test server did not start')
}

try {
  await waitUntilReady()
  const content = Buffer.concat([
    Buffer.from('GGUF'),
    Buffer.alloc(64 * 1024, 7),
  ])
  const sha256 = createHash('sha256').update(content).digest('hex')
  const fileName = 'Qwen3-8B-Q4_K_M.gguf'
  const imagePath = join(dataRoot, 'models', 'image', fileName)
  const blobPath = join(dataRoot, 'models', 'ollama', 'blobs', `sha256-${sha256}`)

  const upload = await fetch(
    `${baseUrl}/image-runtime/models/${encodeURIComponent(fileName)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(content.length),
        'X-ShotAI-SHA256': sha256,
      },
      body: content,
    },
  )
  const uploadBody = await upload.json()
  if (!upload.ok || !uploadBody.sharedWithChat) {
    throw new Error(`upload was not shared: ${JSON.stringify(uploadBody)}`)
  }
  if (!existsSync(imagePath) || !existsSync(blobPath)) {
    throw new Error('shared model paths were not created')
  }
  if (statSync(imagePath).ino !== statSync(blobPath).ino) {
    throw new Error('model file was copied instead of hard-linked')
  }

  unlinkSync(imagePath)
  const reuse = await fetch(`${baseUrl}/image-runtime/models/reuse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, sha256 }),
  })
  const reuseBody = await reuse.json()
  if (!reuse.ok || !reuseBody.reused || !existsSync(imagePath)) {
    throw new Error(`existing Ollama blob was not reused: ${JSON.stringify(reuseBody)}`)
  }

  const orphanSha = 'f'.repeat(64)
  const orphanPath = join(dataRoot, 'models', 'ollama', 'blobs', `sha256-${orphanSha}`)
  mkdirSync(dirname(orphanPath), { recursive: true })
  writeFileSync(orphanPath, 'unused')
  const cleanup = await fetch(`${baseUrl}/shotai/model-cache`, { method: 'DELETE' })
  const cleanupBody = await cleanup.json()
  if (!cleanup.ok || cleanupBody.removedFiles < 1 || existsSync(orphanPath)) {
    throw new Error(`unused cache was not cleaned: ${JSON.stringify(cleanupBody)}`)
  }
  if (!existsSync(imagePath)) {
    throw new Error('cache cleanup removed an active image model link')
  }

  console.log(
    JSON.stringify(
      {
        oneUploadSharedAcrossFeatures: true,
        duplicateDiskUsageAvoided: true,
        existingOllamaFileReusable: true,
        unusedModelCacheCleanup: true,
      },
      null,
      2,
    ),
  )
} finally {
  server.kill('SIGTERM')
  rmSync(dataRoot, { recursive: true, force: true })
}
