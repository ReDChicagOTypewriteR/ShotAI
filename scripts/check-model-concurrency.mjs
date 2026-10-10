import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InferenceScheduler, estimateCapacity } from './inference-scheduler.mjs'
import { loadedModelStatus } from './model-health.mjs'

const GiB = 1024 ** 3
const resources = { gpuTotal: 32 * GiB, gpuFree: 30 * GiB, ramTotal: 128 * GiB, ramFree: 100 * GiB }
const tick = () => new Promise((resolve) => setTimeout(resolve, 20))
const starts = []
const scheduler = new InferenceScheduler({ resourceProvider: async () => resources, ceiling: 5 })
const job = (client, kind = 'text', size = 4 * GiB) => ({ client, kind, model: 'test', modelBytes: size, context: 4096, ready: true,
  start(done) { starts.push(this.client); this.done = done; this.abort = done } })
const a = job('a'), a2 = job('a'), b = job('b'), c = job('c'), d = job('d'), e = job('e')
assert.ok(scheduler.enqueue(a)); await tick()
assert.ok(scheduler.enqueue(a2)); assert.equal(scheduler.enqueue(job('a')), false)
for (const item of [b, c, d, e]) assert.ok(scheduler.enqueue(item))
assert.equal(scheduler.enqueue(job('sixth')), false)
await tick(); assert.deepEqual(starts, ['a', 'b', 'c', 'd', 'e'])
assert.equal(a2.state, 'queued')
for (const item of [a, b, c, d, e]) item.done()
await tick(); assert.equal(a2.state, 'running'); a2.done(); await tick()
const large = job('large', 'text', 22 * GiB)
assert.equal(estimateCapacity({ jobs: [], candidate: large, resources, ceiling: 5 }).limit, 1)
assert.equal(estimateCapacity({ jobs: [large], candidate: large, resources, ceiling: 5 }).allowed, false)
assert.equal(estimateCapacity({ jobs: [], candidate: job('unknown', 'text', 0), resources, ceiling: 5 }).limit, 1)
assert.equal(estimateCapacity({ jobs: [], candidate: job('cpu'), resources: { ...resources, loadedModels: [{ model: 'test', backend: 'cpu' }] }, ceiling: 5 }).limit, 1)
const first = job('first'); scheduler.enqueue(first); await tick()
const image = job('image', 'image'); const later = job('later')
scheduler.enqueue(image); scheduler.enqueue(later); await tick()
assert.equal(image.state, 'queued'); assert.equal(later.state, 'queued')
first.done(); await tick(); assert.equal(image.state, 'running'); assert.equal(later.state, 'queued')
scheduler.cancel(image); await tick(); assert.equal(later.state, 'running'); later.done(); await tick()
const never = job('never'); never.ready = false; scheduler.enqueue(never); scheduler.cancel(never); await tick()
assert.equal(never.state, 'done'); assert.equal(scheduler.snapshot().queued, 0)
assert.equal(loadedModelStatus({ name: 'cpu', size: 100, size_vram: 0 }).backend, 'cpu')
assert.equal(loadedModelStatus({ name: 'mixed', size: 100, size_vram: 40 }).backend, 'mixed')
assert.equal(loadedModelStatus({ name: 'gpu', size: 100, size_vram: 100 }).backend, 'gpu')

const dir = await mkdtemp(join(tmpdir(), 'shotai-phase2-'))
let active = 0, peak = 0, aborted = 0, loaded = false, unloaded = false
let maintenanceModel = false
const upstream = createServer(async (req, res) => {
  let body = ''; for await (const part of req) body += part
  const json = (value) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)) }
  if (req.url === '/api/version') return json({ version: 'test' })
  if (req.url === '/api/tags') return json({ models: maintenanceModel ? [{ name: 'maintenance:latest' }] : [] }) // Unknown sizes must serialize.
  if (req.url === '/api/ps') return json({ models: loaded ? [{ name: 'cpu:latest', size: GiB, size_vram: 0 }] : [] })
  if (req.url === '/api/show') {
    if (JSON.parse(body).model === 'broken') { res.statusCode = 400; return json({ error: 'unsupported model' }) }
    return json({ details: { family: 'qwen3' }, capabilities: ['completion'] })
  }
  if (req.url === '/api/generate') {
    if (JSON.parse(body).model === 'maintenance:latest') await new Promise(resolve => setTimeout(resolve, 200))
    loaded = false; unloaded = true; return json({ done: true })
  }
  if (req.url === '/api/delete') { maintenanceModel = false; res.statusCode = 200; res.end(); return }
  if (req.url === '/v1/models') return json({ data: [{ id: 'image' }] })
  if (req.url === '/api/chat' || req.url === '/v1/images/generations' || req.url === '/sdapi/v1/img2img') {
    if (req.url !== '/api/chat') assert.equal(active, 0, 'Image must not overlap text')
    active++; peak = Math.max(peak, active)
    const input = JSON.parse(body)
    const timer = setTimeout(() => { active--; loaded = req.url === '/api/chat'; json({ message: { content: '你好' }, done: true, data: [] }) }, input.slow ? 10000 : 80)
    res.once('close', () => { if (!res.writableEnded) { clearTimeout(timer); active--; aborted++ } })
    return
  }
  res.statusCode = 404; json({ error: 'missing' })
})
upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
const portSocket = createServer(); portSocket.listen(0, '127.0.0.1'); await once(portSocket, 'listening')
const port = portSocket.address().port; await new Promise((resolve) => portSocket.close(resolve))
const runtime = `http://127.0.0.1:${upstream.address().port}`
const child = spawn(process.execPath, ['scripts/serve-lan.mjs'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
  SHOTAI_LAN_HOST: '127.0.0.1', SHOTAI_LAN_PORT: String(port), SHOTAI_DATA_ROOT: dir, SHOTAI_OLLAMA_URL: runtime, SHOTAI_IMAGE_RUNTIME_URL: runtime, SHOTAI_OLLAMA_ISOLATED: '1' } })
let output = ''; child.stdout.on('data', (data) => { output += data }); child.stderr.on('data', (data) => { output += data })
const base = `http://127.0.0.1:${port}`
const post = (path, client, body, signal) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ShotAI-Client-Id': `client_${client}` }, body: JSON.stringify(body), signal })
const waitFor = async (predicate) => {
  for (let i = 0; i < 100; i++) { try { if (await predicate()) return } catch {} await tick() }
  throw new Error(`Timeout: ${output}`)
}
try {
  await waitFor(async () => (await fetch(`${base}/shotai/system`)).ok)
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => post('/ollama/api/chat', String(i), { model: 'cpu' })))
  assert.equal(responses.filter((r) => r.status === 200).length, 5); assert.equal(responses.filter((r) => r.status === 429).length, 1)
  const successfulTask = responses.find(r => r.status === 200).headers.get('x-shotai-task-id')
  assert.ok(successfulTask)
  await waitFor(async () => (await (await fetch(`${base}/shotai/tasks/${successfulTask}`)).json()).task.state === 'completed')
  const controller = new AbortController()
  const slow = post('/ollama/api/chat', 'slow', { model: 'cpu', slow: true }, controller.signal).catch((e) => e)
  await waitFor(() => active === 1)
  const queuedAbort = new AbortController()
  const queued = post('/ollama/api/chat', 'queued', { model: 'cpu', slow: true }, queuedAbort.signal).catch((e) => e)
  await waitFor(async () => (await (await fetch(`${base}/shotai/system`)).json()).concurrency.queued === 1)
  queuedAbort.abort(); await queued
  controller.abort(); await slow; await waitFor(() => active === 0 && aborted > 0)
  const events = await readFile(join(dir, 'logs', 'tasks.jsonl'), 'utf8')
  assert.match(events, /cancel-requested/)
  assert.match(events, /connection-closed/)
  const health = await (await post('/shotai/models/health', 'health', { model: 'cpu', probe: true })).json()
  assert.equal(health.status, 'warning'); assert.equal(health.loading.backend, 'cpu'); assert.ok(health.checks.includes('short-inference-completed'))
  const failed = await (await post('/shotai/models/health', 'health', { model: 'broken', probe: true })).json()
  assert.equal(failed.status, 'failed'); assert.match(failed.error, /unsupported model/)
  const log = await readFile(join(dir, 'logs', 'model-health.jsonl'), 'utf8'); assert.match(log, /MODEL_HEALTH_FAILED/)
  assert.equal((await post('/image/v1/images/generations', 'image', { prompt: 'cat' })).status, 200)
  assert.ok(unloaded)
  const imageController = new AbortController()
  const imageRun = post('/image/sdapi/v1/img2img', 'image', { slow: true }, imageController.signal).catch((e) => e)
  await waitFor(() => active === 1); imageController.abort(); await imageRun; await waitFor(() => active === 0 && aborted >= 2)
  await waitFor(async () => (await (await fetch(`${base}/shotai/system`)).json()).concurrency.running === 0)
  assert.equal(peak, 1)
  maintenanceModel = true
  assert.equal((await post('/shotai/model-maintenance', 'admin', { confirm: 'wrong' })).status, 400)
  const started = await post('/shotai/model-maintenance', 'admin', { confirm: '清理模型' })
  assert.equal(started.status, 202)
  await started.json() // No open browser connection is required for the job to continue.
  assert.equal((await post('/ollama/api/chat', 'blocked', { model: 'cpu' })).status, 409)
  assert.equal((await post('/shotai/model-maintenance', 'admin', { confirm: '清理模型' })).status, 409)
  await waitFor(async () => (await (await fetch(`${base}/shotai/model-maintenance`)).json()).job.state === 'completed')
  assert.equal(maintenanceModel, false)
  console.log(JSON.stringify({ actualLoad: true, cpuMixedGpu: true, healthProbeAndLog: true, fiveClients: true, fairQueue: true,
    dynamicCapacity: true, imageExclusive: true, unloadBeforeImage: true, stoppedTasksReleased: true, unknownSerialized: true,
    cleanupSurvivesDisconnect: true, maintenanceBlocksInference: true, taskCorrelation: true }))
} finally {
  child.kill('SIGTERM'); await once(child, 'exit')
  upstream.closeAllConnections(); await new Promise((resolve) => upstream.close(resolve))
  await rm(dir, { recursive: true, force: true })
}
