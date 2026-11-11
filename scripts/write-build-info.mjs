import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const fingerprint = createHash('sha256')
async function include(directory) {
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await include(path)
    else if (/\.(?:vue|ts|mjs|cjs|json|css|html|sh)$/.test(entry.name)) {
      fingerprint.update(path).update('\0').update(await readFile(path)).update('\0')
    }
  }
}
for (const directory of ['src', 'scripts', 'desktop/electron']) await include(directory)
fingerprint.update(await readFile('package.json'))
for (const platform of ['linux', 'windows']) {
  fingerprint.update(await readFile(`vendor/ollama/${platform}/SHOTAI_OLLAMA_RUNTIME_INFO.txt`))
}
const sourceFingerprint = fingerprint.digest('hex')
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
const builtAt = new Date().toISOString()
let revision = 'unknown'
try { revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { /* Source archives may lack Git metadata. */ }
const buildId = `${version}-${builtAt.replace(/[-:.]/g, '')}-${sourceFingerprint.slice(0, 12)}`
await writeFile('build-info.json', `${JSON.stringify({ version, buildId, builtAt, revision, sourceFingerprint }, null, 2)}\n`)
console.log(`Build ${buildId}`)
