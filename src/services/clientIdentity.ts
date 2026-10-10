let cachedId = ''
export function clientHeaders(): Record<string, string> {
  if (!cachedId) {
    try { cachedId = localStorage.getItem('shotai-client-id') || '' } catch { /* Private mode */ }
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(cachedId)) {
      cachedId = `client_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`
      try { localStorage.setItem('shotai-client-id', cachedId) } catch { /* Memory identity */ }
    }
  }
  return { 'X-ShotAI-Client-Id': cachedId }
}
