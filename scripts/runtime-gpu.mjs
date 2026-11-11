import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute = promisify(execFile)

export function attributeProcesses(processes, parents, instances) {
  const ancestry = new Map(parents.map(row => [Number(row.pid), Number(row.parent)]))
  return processes.map(process => {
    let pid = process.pid
    const visited = new Set()
    while (pid > 0 && !visited.has(pid) && visited.size < 128) {
      const instance = instances.find(instance => Number(instance.pid) === pid)
      if (instance) return { ...process, runtimeId: instance.id }
      visited.add(pid)
      pid = ancestry.get(pid)
    }
    return process
  })
}

export async function observeGpuProcesses(processes, instances) {
  if (!instances.some(instance => Number(instance.pid) > 0)) return processes
  try {
    const windows = process.platform === 'win32'
    const { stdout } = await execute(windows ? 'powershell.exe' : 'ps', windows
      ? ['-NoProfile', '-NonInteractive', '-Command', 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress']
      : ['-eo', 'pid=,ppid='], { windowsHide: true, timeout: 2500, maxBuffer: 2 * 1024 * 1024 })
    const rows = windows ? [].concat(JSON.parse(stdout)).map(row => ({ pid: row.ProcessId, parent: row.ParentProcessId }))
      : stdout.trim().split('\n').map(line => { const [pid, parent] = line.trim().split(/\s+/); return { pid, parent } })
    return attributeProcesses(processes, rows, instances)
  } catch { return processes } // Missing permissions or a raced exit leaves ownership unknown.
}

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
