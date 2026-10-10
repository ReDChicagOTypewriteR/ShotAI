import assert from 'node:assert/strict'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const outputs = [
  ['windows', `ShotAI-${version}-Windows-x64-Ollama-CUDA12-Setup.exe`],
  ['ubuntu', `ShotAI-${version}-Ubuntu-22.04-x86_64-Ollama-CUDA12.deb`],
  ['ubuntu', `ShotAI-${version}-Ubuntu-22.04-x86_64-Ollama-CUDA12.AppImage`],
]
for (const [platform, file] of outputs) {
  const artifact = join(root, 'release', platform, file)
  assert.ok((await stat(artifact)).size > 1024 * 1024, `${file} 不存在或产物过小`)
}
for (const platform of ['windows', 'ubuntu']) {
  const directory = join(root, 'release', platform)
  const entries = await readdir(directory)
  assert.ok(entries.every((name) => !/\.(gguf|safetensors|ckpt)$/i.test(name)), `${platform} 发布目录包含模型权重`)
  const imageExtension = join(directory, `ShotAI-Image-Extension-${version}-${platform}-x86_64`)
  await access(join(imageExtension, 'manifest.json'))
}
console.log(JSON.stringify({ releaseArtifacts: true, version, platforms: ['ubuntu', 'windows'], imageExtensions: true }))
