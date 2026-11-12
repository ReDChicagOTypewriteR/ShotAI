let cachedId = ''
const operations = new WeakMap<AbortSignal, string>()
export function clientHeaders(signal?: AbortSignal): Record<string, string> {
  if (!cachedId) {
    try { cachedId = localStorage.getItem('shotai-client-id') || '' } catch { /* Private mode */ }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(cachedId)) {
      cachedId = `client_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
      try { localStorage.setItem('shotai-client-id', cachedId) } catch { /* Memory identity */ }
    }
  }
  const headers: Record<string, string> = { 'X-ShotAI-Client-Id': cachedId }
  if (signal) {
    let operation = operations.get(signal)
    if (!operation) {
      operation = `operation_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
      operations.set(signal, operation)
    }
    headers['X-ShotAI-Operation-Id'] = operation
  }
  return headers
}

export function linkOperation(parent: AbortSignal, child: AbortSignal) {
  operations.set(child, clientHeaders(parent)['X-ShotAI-Operation-Id']!)
}

export function reportOfficeResult(signal: AbortSignal, files: Array<{ kind: string; checks?: string[] }>) {
  if (signal.aborted || !files.length) return
  void fetch('/shotai/office-results', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...clientHeaders(signal) },
    body: JSON.stringify({ files: files.map(file => ({ kind: file.kind, checks: file.checks?.length || 0 })) }),
    signal,
  }).catch(() => { /* Diagnostic delivery does not affect validated local files. */ })
}

export function reportTaskEvent(signal: AbortSignal, event: { tool: string; state: 'started' | 'completed' | 'failed'; durationMs?: number; cached?: boolean }) {
  if (signal.aborted) return
  void fetch('/shotai/task-events', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...clientHeaders(signal) }, body: JSON.stringify(event), signal,
  }).catch(() => { /* Diagnostics never block the office task. */ })
}
