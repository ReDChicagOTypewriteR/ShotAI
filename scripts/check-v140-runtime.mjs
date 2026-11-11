import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeMetadataCache } from './runtime-metadata.mjs'
import { runtimeDescriptors, runtimeParallelLimit } from './runtime-pool.mjs'
import { estimateCapacity, InferenceScheduler } from './inference-scheduler.mjs'
import diagnostics from './runtime-diagnostics.cjs'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { InferenceOutcome } from './inference-outcome.mjs'
import { gpuProcesses } from './runtime-gpu.mjs'

assert.deepEqual(gpuProcesses('GPU-a, 123, 900, /runtime/llama-server\nGPU-b, 124, N/A, ollama.exe'), [
  { gpuId: 'GPU-a', pid: 123, name: '/runtime/llama-server', memoryBytes: 900 * 1024 ** 2 },
  { gpuId: 'GPU-b', pid: 124, name: 'ollama.exe', memoryBytes: null },
])
assert.deepEqual(gpuProcesses('N/A, N/A, N/A, N/A'), [])

const output = new InferenceOutcome()
const stream = Buffer.from(`${JSON.stringify({ message: { content: '私密正文不要写入日志' } })}\n${JSON.stringify({ done: true, done_reason: 'stop', eval_count: 18, load_duration: 42 })}`)
for (let index = 0; index < stream.length; index += 7) output.push(stream.subarray(index, index + 7))
assert.deepEqual(output.finish(), { done: true, stopReason: 'stop', eval_count: 18, load_duration: 42 })
const grammarError = new InferenceOutcome()
grammarError.push(Buffer.from('{"error":"Failed to initialize samplers: failed to parse grammar"}\n'))
assert.equal(grammarError.finish().code, 'GRAMMAR_PARSE_FAILED')
const oversizedLine = new InferenceOutcome()
oversizedLine.push(Buffer.alloc(1024 * 1024 + 1, 97))
oversizedLine.push(Buffer.from('\n{"done":true}\n'))
assert.equal(oversizedLine.finish().done, true)

let now = 0, reads = 0, fail = false
const cache = new RuntimeMetadataCache({ now: () => now, load: async () => {
  reads++
  await new Promise(resolve => setTimeout(resolve, 5))
  if (fail) throw new Error('offline')
  return { version: '0.40.16' }
} })
await Promise.all(Array.from({ length: 20 }, () => cache.read('http://localhost:1', '/api/show', { model: 'test' })))
assert.equal(reads, 1)
now = 10000
await cache.read('http://localhost:1', '/api/show', { model: 'test' })
assert.equal(reads, 1)
cache.invalidate()
fail = true
await assert.rejects(cache.read('http://localhost:1', '/api/show', { model: 'test' }))
fail = false
await cache.read('http://localhost:1', '/api/show', { model: 'test' })
assert.equal(reads, 3)
now += 300001
await cache.read('http://localhost:1', '/api/show', { model: 'test' })
assert.equal(reads, 4)
assert.equal(runtimeParallelLimit('qwen3.5', '0.32.14', 2), 1)
assert.equal(runtimeParallelLimit('qwen35', '0.40.16', 2), 2)
assert.equal(runtimeParallelLimit('qwen35', 'unknown', 5), 1)
const descriptors = runtimeDescriptors('http://127.0.0.1:1', [
  { id: 'primary', url: 'http://127.0.0.1:1', gpuId: 'GPU-a', parallel: 1 },
  { id: 'second', url: 'http://127.0.0.1:2', gpuId: 'GPU-b', parallel: 1 },
])
assert.equal(descriptors.length, 2)
assert.equal(runtimeDescriptors('http://localhost:1', [{ id: 'primary', url: 'http://localhost:1', parallel: 99 }])[0].parallel, 5)
assert.equal(runtimeParallelLimit('qwen35', '0.40.16', 2.8), 2)
assert.throws(() => runtimeDescriptors('http://localhost:1', [{ id: 'primary', url: 'http://localhost:2' }]), /Duplicate runtime ID/)
const GiB = 1024 ** 3
const instance = id => ({ id, online: true, parallelLimit: 1, singleModel: true, gpuTotal: 32 * GiB, gpuFree: 31 * GiB })
const observed = { ...instance('resident'), gpuFree: 11 * GiB, loadedVram: 20 * GiB, parallelLimit: 2,
  loadedModels: [{ model: 'qwen:latest', backend: 'gpu', contextLength: 32768, vramBytes: 20 * GiB }],
  residentOptions: { model: 'qwen', context: 32768, parallel: 2 } }
const largeJob = { kind: 'text', model: 'qwen', modelBytes: 18 * GiB, context: 32768 }
assert.equal(estimateCapacity({ jobs: [largeJob], candidate: largeJob, resources: observed }).allowed, true)
assert.equal(estimateCapacity({ jobs: [largeJob], candidate: { ...largeJob, context: 65536 }, resources: observed }).allowed, false)
assert.equal(estimateCapacity({ jobs: [largeJob], candidate: largeJob, resources: { ...observed, gpuFree: 1 * GiB } }).allowed, false)
const resources = { instances: [instance('primary'), instance('second')] }
const job = client => ({ client, kind: 'text', model: 'qwen', modelBytes: 16 * GiB, context: 8192, ready: true,
  start(done) { this.done = done; this.abort = done } })
const first = job('one'), second = job('two'), third = job('three')
const scheduler = new InferenceScheduler({ resourceProvider: async () => resources })
scheduler.enqueue(first)
scheduler.enqueue(second)
scheduler.enqueue(third)
await scheduler.drain()
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal(scheduler.running.size, 2)
assert.notEqual(first.runtimeId, second.runtimeId)
assert.equal(third.state, 'queued')
scheduler.cancel(first)
await new Promise(resolve => setTimeout(resolve, 10))
assert.equal(third.state, 'running')
assert.equal(third.runtimeId, first.runtimeId)
second.done()
third.done()
assert.equal(estimateCapacity({ jobs: [], candidate: { ...job('image'), kind: 'image' }, resources }).limit, 1)
resources.instances[0].online = false
const placement = estimateCapacity({ jobs: [], candidate: job('recover'), resources })
assert.equal(placement.runtimeId, 'second')
const directory = await mkdtemp(join(tmpdir(), 'shotai-rotation-'))
try {
  const path = join(directory, 'runtime.log')
  for (let index = 0; index < 10; index++) diagnostics.appendLog(path, `event-${index}\n`, 24, 3)
  const files = await readdir(directory)
  assert.ok(files.length <= 4)
  assert.match(await readFile(path, 'utf8'), /event-9/)
  assert.ok(files.some(name => name.endsWith('.1')))
} finally { await rm(directory, { recursive: true, force: true }) }
console.log(JSON.stringify({ sharedMetadata: true, metadataExpiry: true, failureRecovery: true,
  runtimeVersionLimits: true, twoIndependentGpuSlots: true, fairQueueRecovery: true, offlineRuntimeSkipped: true, boundedLogs: true }))

const servers = [], active = [0, 0], unloads = [0, 0], deletes = [0, 0], shows = [0, 0]
for (let index = 0; index < 2; index++) {
  const server = createServer(async (request, response) => {
    let text = ''
    for await (const chunk of request) text += chunk
    const body = text ? JSON.parse(text) : {}
    const json = value => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(value)) }
    if (request.url === '/api/version') return json({ version: '0.40.16' })
    if (request.url === '/api/tags') return json({ models: [] })
    if (request.url === '/api/ps') return json({ models: [] })
    if (request.url === '/api/show') { shows[index]++; return json({ details: { family: 'qwen35' } }) }
    if (request.url === '/api/generate') { unloads[index]++; return json({ done: true }) }
    if (request.url === '/api/delete') { deletes[index]++; return json({}) }
    if (request.url === '/api/chat') {
      if (body.model === 'grammar-failure') return json({ error: 'Failed to parse grammar: secret document text' })
      if (body.model === 'incomplete') return json({ message: { content: 'not finished private text' } })
      active[index]++
      const timer = setTimeout(() => { active[index]--; json({ done: true, message: { content: 'ok' }, runtime: index }) }, body.slow ? 10000 : 100)
      response.once('close', () => { if (!response.writableEnded) { clearTimeout(timer); active[index]-- } })
      return
    }
    response.statusCode = 404
    json({ error: 'missing' })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  servers.push(server)
}
const urls = servers.map(server => `http://127.0.0.1:${server.address().port}`)
const portSocket = createServer()
portSocket.listen(0, '127.0.0.1')
await once(portSocket, 'listening')
const port = portSocket.address().port
await new Promise(resolve => portSocket.close(resolve))
const data = await mkdtemp(join(tmpdir(), 'shotai-pool-'))
const child = spawn(process.execPath, ['scripts/serve-lan.mjs'], { env: { ...process.env,
  SHOTAI_LAN_HOST: '127.0.0.1', SHOTAI_LAN_PORT: String(port), SHOTAI_DATA_ROOT: data, SHOTAI_OLLAMA_URL: urls[0],
  SHOTAI_BUILD_ID: 'test-v140-build',
  SHOTAI_OLLAMA_INSTANCES: JSON.stringify(urls.map((url, index) => ({ id: index ? 'second' : 'primary', url, parallel: 1 }))),
}, stdio: ['ignore', 'pipe', 'pipe'] })
let serverOutput = ''
child.stdout.on('data', chunk => { serverOutput += chunk })
child.stderr.on('data', chunk => { serverOutput += chunk })
const base = `http://127.0.0.1:${port}`
const waitFor = async predicate => {
  for (let index = 0; index < 150; index++) {
    try { if (await predicate()) return } catch { /* Startup or cache refresh. */ }
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Runtime pool test timed out: ${serverOutput}`)
}
const post = (client, slow, signal) => fetch(`${base}/ollama/api/chat`, { method: 'POST', headers: {
  'Content-Type': 'application/json', 'X-ShotAI-Client-Id': `client_${client}`, 'X-ShotAI-Operation-Id': `operation_${client}`,
}, body: JSON.stringify({ model: 'qwen', slow }), signal })
try {
  await waitFor(async () => (await fetch(`${base}/shotai/system`)).ok)
  const controllers = [new AbortController(), new AbortController()]
  const running = controllers.map((controller, index) => post(String(index), true, controller.signal).catch(error => error))
  await waitFor(() => active[0] === 1 && active[1] === 1)
  const queued = post('followup', false)
  await waitFor(async () => (await (await fetch(`${base}/shotai/system`)).json()).concurrency.queued === 1)
  const busyDelete = await fetch(`${base}/ollama/api/delete`, { method: 'DELETE', body: JSON.stringify({ model: 'qwen' }), headers: { 'Content-Type': 'application/json' } })
  assert.equal(busyDelete.status, 409)
  controllers[0].abort()
  await running[0]
  const result = await queued
  assert.equal(result.status, 200)
  await result.json()
  controllers[1].abort()
  await running[1]
  await waitFor(() => active.every(count => count === 0))
  await waitFor(async () => (await (await fetch(`${base}/shotai/system`)).json()).concurrency.running === 0)
  const deleted = await fetch(`${base}/ollama/api/delete`, { method: 'DELETE', body: JSON.stringify({ model: 'qwen' }), headers: { 'Content-Type': 'application/json' } })
  assert.equal(deleted.status, 200)
  await deleted.json()
  assert.deepEqual(unloads, [1, 1])
  assert.deepEqual(deletes, [1, 1])
  await Promise.all(Array.from({ length: 15 }, () => fetch(`${base}/ollama/api/show`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen' }) }).then(response => response.json())))
  assert.equal(shows[0], 1)
  for (const [model, expected] of [['grammar-failure', 'GRAMMAR_PARSE_FAILED'], ['incomplete', 'UPSTREAM_INCOMPLETE']]) {
    const response = await fetch(`${base}/ollama/api/chat`, { method: 'POST', headers: {
      'Content-Type': 'application/json', 'X-ShotAI-Client-Id': 'client_failure', 'X-ShotAI-Operation-Id': `operation_${model}`,
    }, body: JSON.stringify({ model }) })
    assert.equal(response.status, 200)
    await response.json()
    const taskId = response.headers.get('x-shotai-task-id')
    await waitFor(async () => {
      const task = (await (await fetch(`${base}/shotai/tasks/${taskId}`, { headers: { 'X-ShotAI-Client-Id': 'client_failure' } })).json()).task
      return task?.state === 'failed' && task.code === expected
    })
  }
  const report = await fetch(`${base}/shotai/office-results`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-ShotAI-Operation-Id': 'operation_followup',
  }, body: JSON.stringify({ files: [{ kind: 'word', checks: 3 }] }) })
  assert.equal(report.status, 200)
  const invalidReport = await fetch(`${base}/shotai/office-results`, { method: 'POST', headers: {
    'Content-Type': 'application/json', 'X-ShotAI-Operation-Id': 'operation_followup',
  }, body: JSON.stringify({ files: [{ kind: 'executable', checks: 3 }] }) })
  assert.equal(invalidReport.status, 400)
  servers[0].closeAllConnections()
  await new Promise(resolve => servers[0].close(resolve))
  await new Promise(resolve => setTimeout(resolve, 2100))
  const recovered = await post('healthy', false)
  assert.equal(recovered.status, 200)
  assert.equal((await recovered.json()).runtime, 1)
  const events = await readFile(join(data, 'logs/tasks.jsonl'), 'utf8')
  assert.match(events, /test-v140-build/)
  assert.match(events, /operation_followup/)
  assert.match(events, /"runtimeId":"second"/)
  assert.match(events, /"state":"file-validated"/)
  assert.match(events, /MODEL_OUTPUT_COMPLETED/)
  assert.doesNotMatch(events, /secret document text|not finished private text/)
  assert.equal(child.exitCode, null)
  console.log(JSON.stringify({ actualDualRuntimeProxy: true, cancellationReleasesTarget: true, unloadsAllReplicas: true,
    mutationsBlockedWhileBusy: true, sharedMetadataHttp: true, survivingRuntimeRecovery: true, correlatedBuildLogs: true }))
} finally {
  child.kill('SIGTERM')
  if (child.exitCode === null) await once(child, 'exit')
  for (const server of servers) {
    server.closeAllConnections()
    if (server.listening) await new Promise(resolve => server.close(resolve))
  }
  await rm(data, { recursive: true, force: true })
}
