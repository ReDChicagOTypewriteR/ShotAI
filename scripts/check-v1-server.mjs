import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectDirectory = new URL('..', import.meta.url).pathname
const testDirectory = await mkdtemp(join(tmpdir(), 'shotai-v1-server-'))
const port = 19090 + Math.floor(Math.random() * 500)
const modelImportLogPath = join(testDirectory, 'Desktop', 'ShotAI-model-import.log')
let server
let ollamaServer
let activeInference = 0
let maximumObservedInference = 0
let cancelledInference = 0

function createTestGguf() {
  const buffer = Buffer.alloc(64)
  buffer.write('GGUF', 0, 'ascii')
  buffer.writeUInt32LE(3, 4)
  buffer.writeBigUInt64LE(1n, 8)
  buffer.writeBigUInt64LE(1n, 16)
  return buffer
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/shotai/system`)
      if (response.ok) return response.json()
    } catch {
      // The server normally needs only a few short attempts to start.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('ShotAI 测试服务没有启动')
}

async function waitForConcurrency(expected, timeout = 2_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const snapshot = await fetch(
      `http://127.0.0.1:${port}/shotai/system`,
    ).then((response) => response.json())
    if (
      snapshot.concurrency.running === expected.running &&
      snapshot.concurrency.queued === expected.queued
    ) {
      return snapshot.concurrency
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error(
    `并发状态没有及时变为 running=${expected.running}, queued=${expected.queued}`,
  )
}

try {
  const ollamaPort = port + 1
  ollamaServer = createServer((request, response) => {
    if (request.url === '/api/version') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"version":"test"}')
      return
    }
    if (request.url === '/api/ps') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end('{"models":[]}')
      return
    }
    if (request.url === '/api/chat' && request.method === 'POST') {
      activeInference += 1
      maximumObservedInference = Math.max(maximumObservedInference, activeInference)
      request.resume()
      let settled = false
      const finish = (cancelled = false) => {
        if (settled) return
        settled = true
        activeInference -= 1
        if (cancelled) cancelledInference += 1
      }
      const timer = setTimeout(() => {
        if (settled) return
        finish()
        response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        response.end('{"message":{"content":"ok"},"done":true}\n')
      }, request.headers['x-shotai-test-delay'] === 'slow' ? 5_000 : 180)
      response.once('close', () => {
        if (response.writableEnded) return
        clearTimeout(timer)
        finish(true)
      })
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise((resolveListen) => ollamaServer.listen(ollamaPort, '127.0.0.1', resolveListen))

  await cp(join(projectDirectory, 'dist'), join(testDirectory, 'web'), {
    recursive: true,
  })
  await cp(
    join(projectDirectory, 'scripts', 'serve-lan.mjs'),
    join(testDirectory, 'server.mjs'),
  )
  await writeFile(
    join(testDirectory, 'lan.config.json'),
    JSON.stringify({
      host: '127.0.0.1',
      port,
      version: '1.0.0',
      allowLanAdministration: false,
      ollamaUrl: `http://127.0.0.1:${ollamaPort}`,
      concurrency: { maxActiveUsers: 5, maxParallelInferences: 2 },
      imageRuntime: { url: 'http://127.0.0.1:2' },
    }),
  )

  server = spawn(process.execPath, ['server.mjs'], {
    cwd: testDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      SHOTAI_MODEL_IMPORT_LOG_PATH: modelImportLogPath,
      SHOTAI_OLLAMA_SOURCE: 'embedded',
      SHOTAI_OLLAMA_MODEL_DIRECTORY: join(testDirectory, 'ollama-models'),
      SHOTAI_OLLAMA_ISOLATED: '1',
    },
  })
  server.stdout.on('data', (chunk) => process.stdout.write(chunk))
  server.stderr.on('data', (chunk) => process.stderr.write(chunk))
  const system = await waitForServer()
  assert.equal(system.version, '1.0.0')
  assert.equal(system.platform, process.platform)
  assert.equal(system.canManage, true)
  assert.equal(system.isHost, true)
  assert.equal(system.apiVersion, 2)
  assert.equal(system.ollama.source, 'embedded')
  assert.ok(system.ollama.modelDirectory)
  assert.ok(system.logs.directory)
  assert.equal(system.concurrency.maxActiveUsers, 5)
  assert.equal(system.concurrency.maxParallelInferences, 2)

  const chatModel = createTestGguf()
  const chatSha256 = createHash('sha256').update(chatModel).digest('hex')
  const chatUpload = await fetch(
    `http://127.0.0.1:${port}/shotai/model-import/files/Qwen3.5-9B-Q4_K_M.gguf`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(chatModel.length),
      },
      body: chatModel,
    },
  )
  assert.equal(chatUpload.status, 201)
  const chatUploadResult = await chatUpload.json()
  assert.equal(chatUploadResult.sha256, chatSha256)
  assert.equal(chatUploadResult.fastPath, true)
  assert.equal(
    (await stat(join(testDirectory, 'ollama-models', 'blobs', `sha256-${chatSha256}`))).size,
    chatModel.length,
  )

  const concurrentResponses = await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      fetch(`http://127.0.0.1:${port}/ollama/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'qwen3.5-test', prompt: String(index) }),
      }),
    ),
  )
  const concurrentStatuses = concurrentResponses.map((response) => response.status)
  assert.equal(concurrentStatuses.filter((status) => status === 200).length, 5)
  assert.equal(concurrentStatuses.filter((status) => status === 429).length, 1)
  assert.equal(maximumObservedInference, 2)

  const runningControllerA = new AbortController()
  const runningControllerB = new AbortController()
  const queuedController = new AbortController()
  const cancellableChat = (controller) =>
    fetch(`http://127.0.0.1:${port}/ollama/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ShotAI-Test-Delay': 'slow',
      },
      body: JSON.stringify({ model: 'qwen3.5-test', prompt: 'cancel-test' }),
      signal: controller.signal,
    }).catch((error) => error)
  const runningRequestA = cancellableChat(runningControllerA)
  const runningRequestB = cancellableChat(runningControllerB)
  await waitForConcurrency({ running: 2, queued: 0 })
  const queuedRequest = cancellableChat(queuedController)
  await waitForConcurrency({ running: 2, queued: 1 })

  queuedController.abort()
  await queuedRequest
  await waitForConcurrency({ running: 2, queued: 0 })

  runningControllerA.abort()
  await runningRequestA
  await waitForConcurrency({ running: 1, queued: 0 })
  const replacementStartedAt = Date.now()
  const replacementResponse = await fetch(
    `http://127.0.0.1:${port}/ollama/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen3.5-test', prompt: 'replacement' }),
    },
  )
  assert.equal(replacementResponse.status, 200)
  assert.ok(Date.now() - replacementStartedAt < 1_500)

  runningControllerB.abort()
  await runningRequestB
  await waitForConcurrency({ running: 0, queued: 0 })
  for (let attempt = 0; attempt < 40 && cancelledInference < 2; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.ok(cancelledInference >= 2)

  const modelName = 'shotai-v1-test.gguf'
  const upload = await fetch(
    `http://127.0.0.1:${port}/image-runtime/models/${modelName}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: Buffer.from('GGUF ShotAI 1.0 test file'),
    },
  )
  assert.equal(upload.status, 201)

  const status = await fetch(
    `http://127.0.0.1:${port}/image-runtime/status`,
  ).then((response) => response.json())
  assert.ok(status.modelFiles.includes(modelName))

  const remove = await fetch(
    `http://127.0.0.1:${port}/image-runtime/models/${modelName}`,
    { method: 'DELETE' },
  )
  assert.equal(remove.status, 200)

  const restart = await fetch(
    `http://127.0.0.1:${port}/image-runtime/restart`,
    { method: 'POST' },
  ).then((response) => response.json())
  assert.equal(restart.restartRequired, true)

  const importFailure = await fetch(
    `http://127.0.0.1:${port}/shotai/model-import-log`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        stage: '首次加载测试',
        modelName: 'deepseek-test',
        files: [{ name: 'deepseek-test.gguf', size: 12345 }],
        error: 'unknown model architecture',
      }),
    },
  )
  assert.equal(importFailure.status, 201)
  const importLog = await readFile(modelImportLogPath, 'utf8')
  assert.match(importLog, /Stage: 首次加载测试/)
  assert.match(importLog, /deepseek-test\.gguf/)
  assert.match(importLog, /unknown model architecture/)

  console.log(
    JSON.stringify(
      {
        systemEndpoint: true,
        versionReported: true,
        hostPlatformReported: true,
        hostManagementDetected: true,
        streamedImageModelUpload: true,
        imageModelDelete: true,
        safeRestartInstruction: true,
        desktopImportFailureLog: true,
        ollamaRuntimeReported: true,
        runtimeLogDirectoryReported: true,
        onePassChatModelImport: true,
        isolatedBlobFastPath: true,
        fiveUserAdmissionLimit: true,
        twoRequestGpuParallelism: true,
        queuedRequestCancellation: true,
        runningRequestCancellation: true,
        cancelledSlotReleasedImmediately: true,
      },
      null,
      2,
    ),
  )
} finally {
  server?.kill('SIGTERM')
  ollamaServer?.close()
  await rm(testDirectory, { recursive: true, force: true })
}
