import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runtimeJson } from './model-health.mjs'
import { ModelMaintenance } from './model-maintenance.mjs'
import { parseCookies, constantTimeEqual } from './request-permissions.mjs'
import { TaskRegistry } from './task-registry.mjs'

const directory = mkdtempSync(join(tmpdir(), 'shotai-failure-'))
const server = createServer((request, response) => {
  if (request.url === '/crash') request.socket.destroy()
  else if (request.url === '/hang') return
  else response.end('{"version":"test"}')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const target = `http://127.0.0.1:${server.address().port}`
try {
  const events = []
  const registry = new TaskRegistry({ limit: 2, record: event => events.push(event) })
  registry.create({ id: 'active', client: 'one', kind: 'text' })
  registry.create({ id: 'finished', client: 'two', kind: 'text' })
  registry.update('finished', 'failed')
  registry.create({ id: 'new', client: 'three', kind: 'text' })
  assert.equal(registry.has('active'), true)
  assert.equal(registry.has('finished'), false)
  assert.equal(registry.get('active').runtimeStopConfirmed, false)
  assert.equal(events[2].state, 'failed')
  await assert.rejects(runtimeJson(target, '/crash'), /fetch failed/)
  await assert.rejects(runtimeJson(target, '/hang', { timeout: 30 }))
  assert.equal((await runtimeJson(target, '/version')).version, 'test')
  const cookies = parseCookies({ headers: { cookie: 'broken=%ZZ; valid=hello%20world' } })
  assert.equal(cookies.valid, 'hello world')
  assert.equal(cookies.broken, undefined)
  assert.equal(constantTimeEqual('a', 'b'), false)
  let deleted = 0
  const options = { directory, list: async () => ['model'], unload: async () => {},
    remove: async () => { deleted++ }, cleanup: async () => ({}) }
  const full = new ModelMaintenance({ ...options, save: () => { throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }) } })
  assert.throws(() => full.start(), /disk full/)
  assert.equal(full.active, false)
  assert.equal(deleted, 0)
  // Simulate a process killed during cleanup, then restart from a new install.
  writeFileSync(join(directory, 'model-maintenance.json'), JSON.stringify({ id: 'old-install', state: 'running', deleted: ['done'] }))
  const restarted = new ModelMaintenance(options)
  assert.equal(restarted.snapshot().state, 'interrupted')
  assert.deepEqual(restarted.snapshot().deleted, ['done'])
  assert.equal(deleted, 0)
  writeFileSync(join(directory, 'model-maintenance.json'), '{broken')
  assert.throws(() => new ModelMaintenance(options), SyntaxError)
  console.log('Passed: upstream socket crash, timeout/recovery, malformed cookie, ENOSPC fail-before-delete, interrupted cleanup restart, corrupt state detection')
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  rmSync(directory, { recursive: true })
}
