export function loadedModelStatus(model) {
  const bytes = Number(model.size) || 0
  const vram = Number(model.size_vram) || 0
  return { model: model.name || model.model || '', modelBytes: bytes, vramBytes: vram,
    contextLength: Number(model.context_length) || 0,
    backend: vram <= 0 ? 'cpu' : vram < bytes * 0.95 ? 'mixed' : 'gpu',
    evidence: 'ollama-api-ps', loaded: true }
}
export async function runtimeJson(target, path, { body, signal, timeout = 5000, method } = {}) {
  const response = await fetch(new URL(path, target), { method: method || (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) })
  if (!response.ok) throw new Error(`Runtime HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const raw = await response.text()
  const result = raw ? JSON.parse(raw) : {}
  if (result.error) throw new Error(String(result.error))
  return result
}
export async function inspectModel(target, model, { probe = false, signal } = {}) {
  const started = Date.now()
  const report = { model, checkedAt: new Date().toISOString(), status: 'failed', checks: [], warnings: [] }
  try {
    const version = await runtimeJson(target, '/api/version', { signal })
    report.runtimeVersion = version.version
    const show = await runtimeJson(target, '/api/show', { body: { model }, signal })
    report.checks.push('metadata-readable')
    report.details = show.details; report.capabilities = show.capabilities || []
    if (probe) {
      if (report.capabilities.includes('embedding') && !report.capabilities.includes('completion')) {
        await runtimeJson(target, '/api/embed', { body: { model, input: '模型体检' }, signal, timeout: 120000 })
      } else {
        const result = await runtimeJson(target, '/api/chat', { body: { model, messages: [{ role: 'user', content: '请只回答：你好' }], stream: false,
          ...(report.capabilities.includes('thinking') ? { think: false } : {}),
          options: { num_predict: 8, num_ctx: 2048, temperature: 0 }, keep_alive: '5m' }, signal, timeout: 120000 })
        if (!result.message?.content?.trim()) report.warnings.push('短推理未返回可见文本，请进一步检查模型模板与能力。')
      }
      report.checks.push('short-inference-completed')
    }
    const ps = await runtimeJson(target, '/api/ps', { signal })
    const normalized = (name) => name.includes(':') ? name : `${name}:latest`
    const loaded = ps.models?.find((item) => normalized(item.name || item.model || '') === normalized(model))
    report.loading = loaded ? loadedModelStatus(loaded) : { loaded: false, backend: 'not-loaded', evidence: 'ollama-api-ps' }
    if (!loaded) report.warnings.push('模型未驻留；安装成功不等于实际加载成功。')
    else if (report.loading.backend !== 'gpu') report.warnings.push('当前为 CPU 或 CPU/GPU 混合加载，请检查显存与运行日志。')
    report.status = probe && !loaded ? 'warning' : report.warnings.length ? 'warning' : 'passed'
  } catch (error) { report.error = error.message; report.code = 'MODEL_HEALTH_FAILED' }
  report.durationMs = Date.now() - started
  return report
}
