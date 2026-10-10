import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { version } = JSON.parse(await readFile(join(root, 'package.json')))
const names = [
  `windows/ShotAI-${version}-Windows-x64-Ollama-CUDA12-Setup.exe`,
  `ubuntu/ShotAI-${version}-Ubuntu-22.04-x86_64-Ollama-CUDA12.deb`,
  `ubuntu/ShotAI-${version}-Ubuntu-22.04-x86_64-Ollama-CUDA12.AppImage`,
  ...['windows', 'ubuntu'].map(platform => `${platform}/ShotAI-Image-Extension-${version}-${platform}-x86_64.zip`),
]
const files = []
for (const name of names) {
  const path = join(root, 'release', name)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  files.push({ name: basename(path), bytes: (await stat(path)).size, sha256: hash.digest('hex') })
}
await writeFile(join(root, 'release', `SHA256SUMS-${version}.txt`), files.map(file => `${file.sha256}  ${file.name}\n`).join(''))
console.log(JSON.stringify({ version, files }, null, 2))
