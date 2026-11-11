const terminal = new Set(['completed', 'connection-closed', 'failed', 'cancelled-before-start', 'rejected'])

export class TaskRegistry extends Map {
  constructor({ limit = 200, record, context = {} }) {
    super()
    this.limit = limit
    this.record = record
    this.context = context
  }
  create({ id, client, kind, operationId, stage }) {
    const task = { id, client, kind, operationId: operationId || id, stage, state: 'queued', createdAt: Date.now(), runtimeStopConfirmed: false }
    this.set(id, task)
    for (const [oldId, old] of this) {
      if (this.size <= this.limit) break
      if (terminal.has(old.state)) this.delete(oldId)
    }
    this.update(id, 'queued')
    return task
  }
  update(id, state, details = {}) {
    const task = this.get(id)
    if (!task) throw new Error('Unknown inference task')
    task.state = state
    Object.assign(task, details)
    task.updatedAt = Date.now()
    if (state === 'running') task.startedAt = task.updatedAt
    this.record({ ...this.context, id, operationId: task.operationId, kind: task.kind, state,
      model: task.model, runtimeId: task.runtimeId, code: task.code, httpStatus: task.httpStatus,
      stage: task.stage, metrics: task.metrics,
      queueMs: task.startedAt ? task.startedAt - task.createdAt : undefined,
      elapsedMs: task.updatedAt - task.createdAt, runtimeStopConfirmed: task.runtimeStopConfirmed })
  }
}
