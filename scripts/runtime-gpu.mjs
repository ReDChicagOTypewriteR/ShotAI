// NVIDIA may report N/A for process memory, notably on Windows WDDM.
// Keep that state unknown instead of presenting zero as measured usage.
export function gpuProcesses(csv) {
  return String(csv).trim().split('\n').filter(Boolean).flatMap(line => {
    const [gpuId, rawPid, memory, ...name] = line.split(',').map(value => value.trim())
    const pid = Number(rawPid)
    if (!gpuId || !Number.isInteger(pid) || pid <= 0) return []
    const memoryMiB = memory && /^\d+(?:\.\d+)?$/.test(memory) ? Number(memory) : null
    return [{ gpuId, pid, name: name.join(', '), memoryBytes: memoryMiB === null ? null : memoryMiB * 1024 ** 2 }]
  })
}
