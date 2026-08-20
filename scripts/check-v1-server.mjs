import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectDirectory = new URL('..', import.meta.url).pathname
const testDirectory = await mkdtemp(join(tmpdir(), 'shotai-v1-server-'))
const port = 19090 + Math.floor(Math.random() * 500)
let server

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

try {
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
      ollamaUrl: 'http://127.0.0.1:1',
      imageRuntime: { url: 'http://127.0.0.1:2' },
    }),
  )

  server = spawn(process.execPath, ['server.mjs'], {
    cwd: testDirectory,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => process.stdout.write(chunk))
  server.stderr.on('data', (chunk) => process.stderr.write(chunk))
  const system = await waitForServer()
  assert.equal(system.version, '1.0.0')
  assert.equal(system.platform, process.platform)
  assert.equal(system.canManage, true)
  assert.equal(system.isHost, true)

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
      },
      null,
      2,
    ),
  )
} finally {
  server?.kill('SIGTERM')
  await rm(testDirectory, { recursive: true, force: true })
}
