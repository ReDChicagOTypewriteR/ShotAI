import { runtimeJson } from './model-health.mjs'

const lifetimes = { '/api/version': 60000, '/api/tags': 2000, '/api/ps': 1000, '/api/show': 300000 }

export class RuntimeMetadataCache {
  constructor({ load = runtimeJson, now = Date.now } = {}) {
    this.load = load
    this.now = now
    this.entries = new Map()
  }

  invalidate() { this.entries.clear() }

  read(target, path, body, refresh = false) {
    const key = JSON.stringify([String(target), path, body])
    if (refresh) this.entries.delete(key)
    const cached = this.entries.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.promise
    const entry = { expiresAt: Infinity, promise: null }
    entry.promise = this.load(target, path, { body }).then(result => {
      entry.expiresAt = this.now() + (lifetimes[path] || 0)
      return result
    }).catch(error => {
      if (this.entries.get(key) === entry) this.entries.delete(key)
      throw error
    })
    if (this.entries.size >= 256) this.entries.delete(this.entries.keys().next().value)
    this.entries.set(key, entry)
    return entry.promise
  }
}
