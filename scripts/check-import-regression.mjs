import assert from 'node:assert/strict'
import { readFile, mkdtemp, mkdir, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const main = await readFile(new URL('../desktop/electron/main.cjs', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/services/ollama.ts', import.meta.url), 'utf8')
assert.ok(main.includes("ensureDirectory(join(dataRoot, 'runtime-work', 'ollama'))"))
assert.ok(main.includes('cwd: workingDirectory'))
assert.ok(!main.includes('cwd: existsSync(executable) ? dirname(executable) : undefined'))
assert.ok(client.includes('原始错误：${error.message}'))
assert.ok(client.includes('这不代表模型文件下载损坏'))

// Removing an installation/mount directory must not affect helper getcwd().
const root = await mkdtemp(join(tmpdir(), 'shotai-cwd-regression-'))
const install = join(root, 'old-install')
const stable = join(root, 'runtime-work')
await mkdir(install)
await mkdir(stable)
try {
  await rmdir(install)
  const result = spawnSync(process.execPath, ['-e', 'console.log(process.cwd())'], {
    cwd: stable, encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), stable.replace(/^\/var\//, '/private/var/'))
} finally {
  await rmdir(stable)
  await rmdir(root)
}
console.log(JSON.stringify({ stableRunnerCwd: true, originalImportErrorPreserved: true }))
