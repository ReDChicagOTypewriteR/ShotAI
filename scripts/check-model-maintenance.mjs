import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, unlinkSync, rmdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ModelMaintenance, writeTaskEvent } from './model-maintenance.mjs'

const directory = mkdtempSync(join(tmpdir(), 'shotai-maintenance-test-'))
const calls = []
let release
const blocked = new Promise(resolve => { release = resolve })
const options = { directory, list: async () => ['a', 'b'],
  unload: async model => { calls.push(`unload:${model}`); if (model === 'a') await blocked },
  remove: async model => { calls.push(`delete:${model}`); if (model === 'b') throw new Error('test delete failure') },
  cleanup: () => ({ removedFiles: 1, removedBytes: 10 }),
}
try {
  const manager = new ModelMaintenance(options)
  const job = manager.start()
  assert.equal(job.state, 'running')
  assert.throws(() => manager.start(), /已经/)
  release(); await manager.done
  assert.equal(manager.snapshot().state, 'partial')
  assert.deepEqual(manager.snapshot().deleted, ['a'])
  assert.deepEqual(calls, ['unload:a', 'delete:a', 'unload:b', 'delete:b'])
  assert.equal(new ModelMaintenance(options).snapshot().id, job.id)
  const persisted = manager.snapshot(); persisted.state = 'running'
  writeFileSync(join(directory, 'model-maintenance.json'), JSON.stringify(persisted))
  assert.equal(new ModelMaintenance(options).snapshot().state, 'interrupted')
  writeTaskEvent(directory, { id: job.id, state: 'partial' })
  assert.ok(readFileSync(join(directory, 'tasks.jsonl'), 'utf8').includes(job.id))
  console.log(JSON.stringify({ serverOwnedCleanup: true, partialFailure: true, unloadBeforeDelete: true, duplicateStartBlocked: true, restartInterrupted: true, correlation: true }))
} finally { for (const name of readdirSync(directory)) unlinkSync(join(directory, name)); rmdirSync(directory) }
