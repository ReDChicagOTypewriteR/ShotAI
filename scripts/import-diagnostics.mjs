import { openSync, closeSync, fstatSync, readSync, mkdirSync, writeFileSync, readdirSync, lstatSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function logTail(path, limit = 512 * 1024) {
  if (!path) return '[未配置日志文件]'
  let fd
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const buffer = Buffer.alloc(Math.min(size, limit))
    const count = readSync(fd, buffer, 0, buffer.length, Math.max(0, size - limit))
    return `${size > limit ? '[仅保留最近 512 KiB 输出；完整内容见源日志]\n' : ''}${buffer.subarray(0, count).toString('utf8')}`
  } catch (error) { return `[读取日志失败：${error.message}]` }
  finally { if (fd !== undefined) closeSync(fd) }
}

export function saveImportDiagnostic(directory, summary, runtime, paths) {
  mkdirSync(directory, { recursive: true })
  const filename = `model-import-diagnostic-${Date.now()}-${randomUUID()}.log`
  const content = [summary, 'Runtime process:', JSON.stringify(runtime, null, 2),
    ...Object.entries(paths).flatMap(([name, path]) => [`\n--- ${name}: ${path || 'unavailable'} ---`, logTail(path)]),
    '\n子进程的退出原因以以上 Ollama 原始输出为准；没有记录时为未知，不推断为 GPU 或模型损坏。',
  ].join('\n')
  const path = join(directory, filename)
  const redacted = content.replace(/(authorization\s*[:=]\s*)([^\n]+)/gi, '$1[REDACTED]')
    .replace(/((?:password|api[_-]?key|access[_-]?token)\s*["']?\s*[:=]\s*["']?)([^\s,"'\n]+)/gi, '$1[REDACTED]')
  writeFileSync(path, redacted, { encoding: 'utf8', mode: 0o600 })
  // Only our generated regular files are candidates; never follow symlinks.
  const reports = readdirSync(directory).filter(name => /^model-import-diagnostic-\d+-[a-f0-9-]+\.log$/.test(name))
    .map(name => ({ name, info: lstatSync(join(directory, name)) })).filter(item => item.info.isFile())
    .sort((a, b) => b.info.mtimeMs - a.info.mtimeMs)
  for (const [index, report] of reports.entries()) {
    if (report.name !== filename && (index >= 50 || report.info.mtimeMs < Date.now() - 30 * 86400000)) {
      try { unlinkSync(join(directory, report.name)) } catch { /* Try retention again next time. */ }
    }
  }
  return { path, filename }
}
