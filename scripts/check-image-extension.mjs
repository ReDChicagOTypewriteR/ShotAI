import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, open, readFile, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const platform = process.argv[2]
if (platform && !['ubuntu', 'windows'].includes(platform)) throw new Error('平台只能是 ubuntu 或 windows')
const packageJson = JSON.parse(await readFile(join(projectDirectory, 'package.json'), 'utf8'))
const require = createRequire(import.meta.url)
for (const [name, configPath] of [
  ['ubuntu', 'desktop/electron/electron-builder.ubuntu-full.cjs'],
  ['windows', 'desktop/electron/electron-builder.windows.cjs'],
]) {
  const config = require(join(projectDirectory, configPath))
  assert.ok(!config.extraResources.some((item) => item.to === 'runtime/image'), `${name} 主安装包不能内置图片运行组件`)
}

async function verifySource(name) {
  const source = join(projectDirectory, 'vendor/stable-diffusion.cpp', name === 'ubuntu' ? 'linux' : 'windows')
  const executable = join(source, name === 'ubuntu' ? 'sd-server' : 'sd-server.exe')
  await access(executable, constants.R_OK)
  const handle = await open(executable, 'r')
  try {
    const header = Buffer.alloc(4096)
    await handle.read(header, 0, header.length, 0)
    if (name === 'ubuntu') {
      assert.deepEqual([...header.subarray(0, 4)], [0x7f, 0x45, 0x4c, 0x46])
      assert.equal(header[4], 2)
      assert.equal(header.readUInt16LE(18), 62)
      assert.ok((await stat(executable)).mode & 0o111, 'sd-server 缺少执行权限')
      await access(join(source, 'libnccl.so.2'), constants.R_OK)
    } else {
      assert.equal(header.toString('ascii', 0, 2), 'MZ')
      const offset = header.readUInt32LE(0x3c)
      assert.equal(header.toString('ascii', offset, offset + 4), 'PE\0\0')
      assert.equal(header.readUInt16LE(offset + 4), 0x8664)
    }
  } finally {
    await handle.close()
  }
}

for (const name of platform ? [platform] : ['ubuntu', 'windows']) await verifySource(name)

if (platform) {
  const target = join(projectDirectory, 'release', platform,
    `ShotAI-Image-Extension-${packageJson.version}-${platform}-x86_64`)
  const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'))
  assert.equal(manifest.version, packageJson.version)
  assert.equal(manifest.platform, platform)
  assert.equal(manifest.modelsIncluded, false)
  await access(join(target, 'README.txt'), constants.R_OK)
  const runtime = join(target, 'runtime', 'image')
  const entries = await readdir(runtime)
  assert.deepEqual(entries.sort(), Object.keys(manifest.files).sort())
  for (const fileName of entries) {
    assert.ok(!new Set(['.gguf', '.safetensors', '.sft', '.ckpt', '.onnx']).has(extname(fileName).toLowerCase()))
    const digest = createHash('sha256')
    for await (const chunk of createReadStream(join(runtime, fileName))) digest.update(chunk)
    assert.equal(digest.digest('hex'), manifest.files[fileName], `扩展文件 ${fileName} 校验失败`)
  }
}
console.log(JSON.stringify({ imageExtensionOptional: true, platform: platform || 'both', modelsIncluded: false }))
