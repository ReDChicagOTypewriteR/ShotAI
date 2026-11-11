export function runtimeParallelLimit(family, version, configured = 1) {
  const parallel = parallelLimit(configured)
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)/)
  const modern = match && (Number(match[1]) > 0 || Number(match[2]) > 40 || (Number(match[2]) === 40 && Number(match[3]) >= 16))
  const serial = ['mllama', 'qwen3vl', 'qwen3vlmoe', 'qwen35', 'qwen35moe', 'qwen3next', 'lfm2', 'lfm2moe', 'nemotron_h', 'nemotron_h_moe', 'nemotron_h_omni']
  const normalized = String(family || '').toLowerCase().replace(/[.\-_]/g, '')
  return !modern && serial.some(name => name.replace(/_/g, '') === normalized) ? 1 : parallel
}

function parallelLimit(value, fallback = 1) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(5, Math.floor(number) || fallback)) : fallback
}

export function runtimeDescriptors(primary, entries = [], parallel = 1) {
  const result = []
  for (const entry of [{ id: 'primary', url: String(primary), parallel }, ...entries]) {
    const url = new URL(entry.url)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid runtime URL')
    const duplicate = result.find(item => item.url === url.href)
    const descriptor = { ...entry, url: url.href, parallel: parallelLimit(entry.parallel, parallelLimit(parallel)) }
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(descriptor.id || '')) throw new Error('Invalid runtime ID')
    if (result.some(item => item !== duplicate && item.id === descriptor.id)) throw new Error('Duplicate runtime ID')
    if (duplicate) Object.assign(duplicate, descriptor)
    else result.push(descriptor)
  }
  return result
}
