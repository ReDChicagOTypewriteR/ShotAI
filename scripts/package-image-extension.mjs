import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const platform = process.argv[2]
if (!['ubuntu', 'windows'].includes(platform)) {
  throw new Error('用法：node scripts/package-image-extension.mjs ubuntu|windows')
}
const packageJson = JSON.parse(await readFile(
  join(projectDirectory, 'package.json'), 'utf8',
))
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(packageJson.version)) {
  throw new Error('package.json 中的版本号不适合作为扩展目录名')
}
const source = join(projectDirectory, 'vendor', 'stable-diffusion.cpp', platform === 'ubuntu' ? 'linux' : 'windows')
const required = platform === 'ubuntu'
  ? ['sd-server', 'libnccl.so.2', 'LICENSE.stable-diffusion.cpp.txt', 'SHOTAI_RUNTIME_INFO.txt']
  : ['sd-server.exe', 'SHOTAI_RUNTIME_INFO.txt']
for (const name of required) await access(join(source, name))
const files = platform === 'ubuntu'
  ? required
  : (await readdir(source)).filter((name) =>
      name === 'sd-server.exe' || name.endsWith('.dll') ||
      ['SHOTAI_RUNTIME_INFO.txt', 'stable-diffusion.cpp.txt', 'ggml.txt'].includes(name),
    )
const target = join(
  projectDirectory, 'release', platform,
  `ShotAI-Image-Extension-${packageJson.version}-${platform}-x86_64`,
)
const runtimeTarget = join(target, 'runtime', 'image')
await rm(target, { recursive: true, force: true })
await mkdir(runtimeTarget, { recursive: true })

const manifest = {
  name: 'ShotAI optional image runtime',
  version: packageJson.version,
  platform,
  architecture: 'x86_64',
  modelsIncluded: false,
  installRelativePath: 'runtime/image',
  files: {},
}
for (const name of files) {
  const from = join(source, name)
  if (!(await stat(from)).isFile()) continue
  await copyFile(from, join(runtimeTarget, name))
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(from)) digest.update(chunk)
  manifest.files[name] = digest.digest('hex')
}
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
await writeFile(join(target, 'README.txt'), [
  'ShotAI 可选图片运行扩展（不包含任何模型权重）',
  '',
  '1. 完全退出 ShotAI。',
  '2. 将本目录 runtime/image 内的文件复制到 ShotAI 数据目录的 runtime/image。',
  platform === 'ubuntu'
    ? '   Ubuntu 默认数据目录通常是 ~/.config/ShotAI/data；复制后执行 chmod +x runtime/image/sd-server。'
    : '   Windows 默认数据目录通常是 %APPDATA%\\ShotAI\\data。',
  '   如配置了 SHOTAI_DATA_ROOT，请使用该目录。不要把文件放入模型目录。',
  '3. 重新启动 ShotAI，再导入图片模型。',
  '如需校验文件完整性，请比对 manifest.json 中的 SHA-256。',
  '',
].join('\n'))
console.log(`图片运行扩展已生成：${target}`)
