const GiB = 1024 ** 3
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0

// Weight residency is shared by same-model jobs; KV/workspace is per request.
// This is a conservative admission estimate, not a guarantee from the runtime.
export function estimateCapacity({ jobs, candidate, resources, ceiling = 5 }) {
  const all = [...jobs, candidate]
  if (all.some((job) => job.kind === 'image')) return { allowed: jobs.length === 0, limit: 1, reason: 'image-exclusive' }
  const normalize = (name) => name.includes(':') ? name : `${name}:latest`
  if (all.some((job) => resources?.loadedModels?.some((loaded) => normalize(loaded.model) === normalize(job.model || '') && loaded.backend === 'cpu'))) {
    return { allowed: jobs.length === 0, limit: 1, reason: 'observed-cpu-fallback' }
  }
  if (!resources || !candidate.modelBytes) return { allowed: jobs.length === 0, limit: 1, reason: 'unknown-resources' }
  const gpu = positive(resources.gpuTotal)
  const total = gpu || positive(resources.ramTotal)
  const free = gpu ? positive(resources.gpuFree) : positive(resources.ramFree)
  const reclaimable = gpu ? positive(resources.loadedVram) : positive(resources.loadedRam)
  const budget = Math.min(total * (gpu ? 0.85 : 0.65), free + reclaimable - (gpu ? 2 : 4) * GiB)
  const weight = (job) => positive(job.modelBytes) * 1.15
  const workspace = (job) => Math.max(0.75 * GiB, weight(job) * 0.14) * Math.max(1, positive(job.context) / 4096)
  const weights = new Map()
  for (const job of all) weights.set(job.model, Math.max(weights.get(job.model) || 0, weight(job)))
  const required = [...weights.values()].reduce((sum, value) => sum + value, 0) + all.reduce((sum, job) => sum + workspace(job), 0)
  const limit = Math.max(1, Math.min(ceiling, Math.floor((budget - weight(candidate)) / workspace(candidate))))
  // Let one job try when an estimate exceeds resources; report the risk explicitly.
  return { allowed: !jobs.length || (all.length <= ceiling && required <= budget), limit, reason: gpu ? 'vram-estimate' : 'ram-estimate', estimatedBytes: required, budgetBytes: Math.max(0, budget), oversized: required > budget }
}

export class InferenceScheduler {
  constructor({ maxClients = 5, ceiling = 5, resourceProvider = async () => null, onChange = () => {} } = {}) {
    this.maxClients = maxClients; this.ceiling = ceiling; this.resourceProvider = resourceProvider; this.onChange = onChange
    this.clients = new Map(); this.turns = []; this.running = new Set(); this.rejected = 0
    this.completed = 0; this.cancelled = 0; this.waitMs = 0; this.limit = 1; this.reason = 'unknown-resources'
    this.draining = false; this.again = false
  }
  snapshot() {
    return { maxActiveUsers: this.maxClients, maxParallelInferences: this.limit, configuredCeiling: this.ceiling,
      activeClients: this.activeClients().size,
      running: this.running.size, queued: [...this.clients.values()].reduce((n, queue) => n + queue.length, 0),
      available: Math.max(0, this.maxClients - this.activeClients().size), rejected: this.rejected,
      cancelled: this.cancelled, averageWaitMs: this.completed ? Math.round(this.waitMs / this.completed) : 0,
      policy: 'client-round-robin', capacityReason: this.reason, imageExclusive: true }
  }
  activeClients() { return new Set([...this.clients.keys(), ...[...this.running].map((job) => job.client)]) }
  enqueue(job) {
    const active = this.activeClients()
    // One running + one waiting task per client; no client may fill all slots.
    if ((!active.has(job.client) && active.size >= this.maxClients) || (this.clients.get(job.client)?.length || 0) >= 1) {
      this.rejected++; this.onChange(this.snapshot()); return false
    }
    job.queuedAt = Date.now(); job.state = 'queued'
    this.clients.set(job.client, [...(this.clients.get(job.client) || []), job])
    if (!this.turns.includes(job.client)) this.turns.push(job.client)
    this.drain(); return true
  }
  cancel(job) {
    if (job.state === 'done') return
    if (job.state === 'running') { job.abort?.(); return }
    const queue = this.clients.get(job.client)
    if (queue) {
      this.clients.set(job.client, queue.filter((item) => item !== job))
      if (!this.clients.get(job.client).length) { this.clients.delete(job.client); this.turns = this.turns.filter((id) => id !== job.client) }
    }
    job.state = 'done'; this.cancelled++; this.drain()
  }
  finish(job) {
    if (job.state !== 'running') return
    this.running.delete(job); job.state = 'done'; this.completed++
    this.waitMs += job.startedAt - job.queuedAt; this.drain()
  }
  async drain() {
    if (this.draining) { this.again = true; return }
    this.draining = true
    try {
      do {
        this.again = false
        let resources
        try { resources = await this.resourceProvider() } catch { resources = null }
        let scans = this.turns.length
        while (scans-- > 0 && this.running.size < this.ceiling && this.turns.length) {
          const client = this.turns.shift()
          const queue = this.clients.get(client)
          if (!queue?.length) continue
          const job = queue[0]
          const decision = estimateCapacity({ jobs: [...this.running], candidate: job, resources, ceiling: this.ceiling })
          this.limit = decision.limit; this.reason = decision.reason
          if ([...this.running].some((item) => item.client === client) || !job.ready || !decision.allowed) {
            if (job.kind === 'image' && job.ready) this.turns.unshift(client)
            else this.turns.push(client)
            // An image is a barrier: new text jobs must not starve it.
            if (job.kind === 'image' && job.ready) break
            continue
          }
          queue.shift(); if (!queue.length) this.clients.delete(client); else this.turns.push(client)
          job.state = 'running'; job.startedAt = Date.now(); job.capacity = decision; this.running.add(job)
          try { job.start(() => this.finish(job)) } catch (error) { job.fail?.(error); this.finish(job) }
          scans = this.turns.length
        }
      } while (this.again)
    } finally { this.draining = false; this.onChange(this.snapshot()) }
  }
}
