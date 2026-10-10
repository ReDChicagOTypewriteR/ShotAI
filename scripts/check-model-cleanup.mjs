import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('./serve-lan.mjs', import.meta.url), 'utf8')
const fn = source.slice(source.indexOf('function cleanupModelCache()'), source.indexOf('const inferenceTasks ='))
const root = mkdtempSync(join(tmpdir(), 'shotai-cleanup-test-'))
const blobs = join(root, 'models', 'ollama', 'blobs')
mkdirSync(blobs, { recursive: true })
const retained = 'a'.repeat(64), orphan = 'b'.repeat(64)
const names = [`sha256-${retained}`, `sha256-${orphan}`, 'COPY123', 'model.uploading', 'unknown-file']
for (const name of names) writeFileSync(join(blobs, name), 'fixture')
try {
  const result = runInNewContext(`${fn}\ncleanupModelCache()`, {
    dataDirectory: root, ollamaModelDirectory: join(root, 'models', 'ollama'), join, basename, statSync, unlinkSync,
    walkFiles: () => readdirSync(blobs).map(name => join(blobs, name)),
    collectReferencedOllamaDigests: () => new Set([retained]),
  })
  assert.equal(result.removedFiles, 3)
  assert.ok(existsSync(join(blobs, `sha256-${retained}`)))
  assert.ok(existsSync(join(blobs, 'unknown-file')))
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8')
  assert.ok(app.includes('inputPattern: /^清理模型$/'))
  assert.ok(app.includes('if (!systemInfo.value.ollama.isolated)'))
  assert.ok(app.includes('完整清理对话与检索模型'))
  const ollama = readFileSync(new URL('../src/services/ollama.ts', import.meta.url), 'utf8')
  assert.ok(ollama.indexOf('keep_alive: 0') < ollama.indexOf('`${OLLAMA_API_BASE}/delete`'))
  console.log(JSON.stringify({ orphanCleanup: true, sharedWeightsPreserved: true, unloadBeforeDelete: true, typedConfirmation: true, externalRuntimeGuard: true }))
} finally {
  for (const name of readdirSync(blobs)) unlinkSync(join(blobs, name))
  rmdirSync(blobs); rmdirSync(join(root, 'models', 'ollama')); rmdirSync(join(root, 'models')); rmdirSync(root)
}
