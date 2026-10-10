import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, renameSync, existsSync, appendFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export class ModelMaintenance {
  constructor({ directory, list, unload, remove, cleanup, save = writeFileSync }) {
    Object.assign(this, { directory, list, unload, remove, cleanup, save })
    mkdirSync(directory, { recursive: true })
    this.file = join(directory, 'model-maintenance.json')
    try {
      this.job = JSON.parse(readFileSync(this.file, 'utf8'))
      if (this.job.state === 'running') {
        this.job.state = 'interrupted'; this.job.error = '服务重启，清理中断；请检查结果后重新发起。'
        this.persist()
      }
    } catch (error) {
      if (error.code === 'ENOENT') this.job = null
      else throw error
    }
  }
  get active() { return this.job?.state === 'running' }
  snapshot() { return this.job ? JSON.parse(JSON.stringify(this.job)) : null }
  persist() {
    const temporary = `${this.file}.tmp`
    this.save(temporary, JSON.stringify(this.job), { mode: 0o600 })
    renameSync(temporary, this.file)
  }
  start() {
    if (this.active) throw new Error('清理任务已经在执行')
    this.job = { id: randomUUID(), state: 'running', stage: 'listing', startedAt: Date.now(), total: 0, deleted: [], failures: [] }
    try { this.persist() }
    catch (error) { this.job.state = 'failed'; this.job.error = error.message; throw error }
    this.done = this.run()
    return this.snapshot()
  }
  async run() {
    try {
      const targets = await this.list()
      this.job.total = targets.length; this.persist()
      for (const model of targets) {
        this.job.stage = 'unload-delete'; this.job.currentModel = model; this.persist()
        try { await this.unload(model); await this.remove(model); this.job.deleted.push(model) }
        catch (error) { this.job.failures.push({ model, error: error.message }) }
        this.persist()
      }
      this.job.stage = 'cache'; this.persist()
      this.job.cleanup = await this.cleanup()
      this.job.state = this.job.failures.length ? 'partial' : 'completed'
    } catch (error) { this.job.state = 'failed'; this.job.error = error.message }
    finally { this.job.finishedAt = Date.now(); this.persist() }
  }
}

export function writeTaskEvent(directory, event) {
  try {
    mkdirSync(directory, { recursive: true })
    const path = join(directory, 'tasks.jsonl')
    if (existsSync(path) && statSync(path).size > 5 * 1024 * 1024) renameSync(path, `${path}.1`)
    // Never record prompts, file bodies or authorization headers.
    appendFileSync(path, `${JSON.stringify({ time: new Date().toISOString(), ...event })}\n`, { mode: 0o600 })
  } catch (error) { console.error(`任务日志写入失败：${error.message}`) }
}
