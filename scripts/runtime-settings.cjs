const { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } = require('node:fs')
const { dirname } = require('node:path')
const { randomUUID } = require('node:crypto')
const modes = ['single', 'spread', 'per-gpu']

function normalizeRuntimeSettings(value = {}) {
  value ||= {}
  const parallel = Number(value.parallelPerInstance ?? 2)
  return { mode: modes.includes(value.mode) ? value.mode : 'single',
    parallelPerInstance: Number.isFinite(parallel) ? Math.max(1, Math.min(5, Math.floor(parallel))) : 1 }
}

function saveRuntimeSettings(path, settings, fallback = {}) {
  if (!modes.includes(settings.mode) || !Number.isInteger(settings.parallelPerInstance) || settings.parallelPerInstance < 1 || settings.parallelPerInstance > 5) throw new Error('无效的运行设置')
  const current = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback
  const next = { ...current, ollamaRuntime: { ...current.ollamaRuntime, ...settings } }
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600, flag: 'wx' })
    renameSync(temporary, path)
  } catch (error) {
    try { unlinkSync(temporary) } catch { /* No partial config is ever used. */ }
    throw error
  }
  return next
}
module.exports = { normalizeRuntimeSettings, saveRuntimeSettings, modes }
