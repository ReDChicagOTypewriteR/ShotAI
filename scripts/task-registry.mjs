const terminal = new Set(['completed', 'connection-closed', 'failed', 'cancelled-before-start', 'rejected'])

export class TaskRegistry extends Map {
  constructor({ limit = 200, record }) {
    super()
    this.limit = limit
    this.record = record
  }
  create({ id, client, kind }) {
    const task = { id, client, kind, state: 'queued', createdAt: Date.now(), runtimeStopConfirmed: false }
    this.set(id, task)
    for (const [oldId, old] of this) {
      if (this.size <= this.limit) break
      if (terminal.has(old.state)) this.delete(oldId)
    }
    this.update(id, 'queued')
    return task
  }
  update(id, state) {
    const task = this.get(id)
    if (!task) throw new Error('Unknown inference task')
    task.state = state
    task.updatedAt = Date.now()
    this.record({ id, kind: task.kind, state })
  }
}
