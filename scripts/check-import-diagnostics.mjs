import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { logTail, saveImportDiagnostic } from './import-diagnostics.mjs'

const root = mkdtempSync(join(tmpdir(), 'shotai-diagnostic-test-'))
const main = readFileSync(new URL('../desktop/electron/main.cjs', import.meta.url), 'utf8')
assert.ok(main.includes("join(app.getPath('desktop'), 'ShotAI-logs')"))
assert.ok(main.includes("SHOTAI_MODEL_IMPORT_LOG_PATH: runtimeLogFile('ShotAI-model-import.log')"))
const server = readFileSync(new URL('./serve-lan.mjs', import.meta.url), 'utf8')
assert.ok(server.includes('saveImportDiagnostic(runtimeLogDirectory, content'))
assert.ok(server.includes('const path = join(runtimeLogDirectory, name)'))
try {
  const source = join(root, 'ollama.log')
  writeFileSync(source, 'llama-server: cannot get current path\nllama-quantize: signal aborted\nAuthorization: Bearer SECRET\napi_key=SECRETKEY\n')
  const result = saveImportDiagnostic(root, 'Stage: load\nVersion: 0.32.14',
    { executable: '/opt/shotai/ollama', workingDirectory: '/home/z/data/runtime-work', pid: 123, exitCode: null, signal: null },
    { Ollama: source, Missing: join(root, 'missing.log') })
  const content = readFileSync(result.path, 'utf8')
  assert.ok(!content.includes('SECRET'))
  for (const expected of ['Stage: load', '0.32.14', '/opt/shotai/ollama', '/home/z/data/runtime-work', 'signal aborted', '读取日志失败']) assert.ok(content.includes(expected))
  writeFileSync(source, 'x'.repeat(600000) + '\nEND')
  assert.ok(logTail(source).endsWith('END'))
  assert.ok(logTail(source).length < 525000)
  console.log(JSON.stringify({ runtimeMetadata: true, rawOutput: true, missingLogExplicit: true, boundedRead: true }))
} finally {
  for (const name of readdirSync(root)) unlinkSync(join(root, name))
  rmdirSync(root)
}
