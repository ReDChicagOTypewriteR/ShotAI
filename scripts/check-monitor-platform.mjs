import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const port = 19190 + Math.floor(Math.random() * 500)
const child = spawn(process.execPath, ['scripts/serve-lan.mjs'], {
  cwd: projectDirectory,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    SHOTAI_LAN_HOST: '127.0.0.1',
    SHOTAI_LAN_PORT: String(port),
  },
})

async function waitUntilReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/shotai/system`)
      if (response.ok) return
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
  }
  throw new Error('监控测试服务启动超时')
}

try {
  await waitUntilReady()

  const anonymous = await fetch(`http://127.0.0.1:${port}/shotai/monitor/snapshot`)
  assert.equal(anonymous.status, 401)

  const rejected = await fetch(`http://127.0.0.1:${port}/shotai/monitor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'incorrect' }),
  })
  assert.equal(rejected.status, 401)

  const login = await fetch(`http://127.0.0.1:${port}/shotai/monitor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'alexjoker443477' }),
  })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie?.startsWith('shotai_monitor_session='))

  await fetch(`http://127.0.0.1:${port}/`)
  const snapshotResponse = await fetch(
    `http://127.0.0.1:${port}/shotai/monitor/snapshot`,
    { headers: { Cookie: cookie } },
  )
  assert.equal(snapshotResponse.status, 200)
  const snapshot = await snapshotResponse.json()
  assert.ok(snapshot.performance.cpu.cores > 0)
  assert.ok(snapshot.performance.memory.totalBytes > 0)
  assert.ok(Array.isArray(snapshot.clients))

  const source = await readFile(join(projectDirectory, 'src', 'App.vue'), 'utf8')
  assert.match(source, /主机监控/)
  assert.match(source, /monitorHideIps/)
  assert.match(source, /monitorChartPoints/)

  console.log(JSON.stringify({ monitorPlatform: true, hostOnly: true, authenticated: true }))
} finally {
  child.kill('SIGTERM')
}
