import assert from 'node:assert/strict'
import { access, readFile, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(
  projectDirectory,
  'release',
  'ShotAI-1.1.0-EXE-Lite',
)

const requiredFiles = [
  'ShotAI.exe',
  'server.ps1',
  'start-image-runtime.ps1',
  'lan.config.json',
  'README.md',
  'web/index.html',
  'models/ollama/README.txt',
  'models/image/README.txt',
  'runtime/ollama/README.txt',
  'runtime/image/README.txt',
]
for (const relativePath of requiredFiles) {
  await access(join(releaseDirectory, relativePath), constants.R_OK)
}

const executablePath = join(releaseDirectory, 'ShotAI.exe')
const executable = await readFile(executablePath)
assert.equal(executable.subarray(0, 2).toString('ascii'), 'MZ')
const peOffset = executable.readUInt32LE(0x3c)
assert.equal(executable.subarray(peOffset, peOffset + 4).toString('binary'), 'PE\u0000\u0000')
assert.equal(executable.readUInt16LE(peOffset + 4), 0x8664)
const optionalHeaderOffset = peOffset + 24
assert.equal(executable.readUInt16LE(optionalHeaderOffset), 0x20b)
assert.equal(
  executable.readUInt16LE(optionalHeaderOffset + 68),
  2,
  'ShotAI.exe 不是无控制台的 Windows GUI 程序',
)
const resourceDirectoryOffset = optionalHeaderOffset + 112 + 2 * 8
assert.ok(
  executable.readUInt32LE(resourceDirectoryOffset) > 0 &&
    executable.readUInt32LE(resourceDirectoryOffset + 4) > 0,
  'ShotAI.exe 没有写入图标资源',
)
assert.ok(executable.length < 12 * 1024 * 1024, 'ShotAI.exe 超过 12MB')

const icon = await readFile(
  join(projectDirectory, 'desktop', 'launcher', 'assets', 'shotai.ico'),
)
assert.equal(icon.subarray(0, 4).toString('hex'), '00000100')
assert.ok(icon.readUInt16LE(4) >= 6, 'ShotAI 图标尺寸数量不足')

const config = JSON.parse(
  await readFile(join(releaseDirectory, 'lan.config.json'), 'utf8'),
)
assert.equal(config.port, 9090)
assert.equal(config.version, '1.1.0-preview.3')
assert.equal(config.launcherControlPort, 19090)
assert.equal(config.allowLanAdministration, false)

const forbiddenExtensions = new Set([
  '.gguf',
  '.safetensors',
  '.sft',
  '.ckpt',
  '.onnx',
])
let totalBytes = 0
let largestFile = { path: '', size: 0 }
async function inspectDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await inspectDirectory(path)
      continue
    }
    assert.ok(
      !forbiddenExtensions.has(extname(entry.name).toLowerCase()),
      `精简包意外包含模型：${path}`,
    )
    const info = await stat(path)
    totalBytes += info.size
    if (info.size > largestFile.size) largestFile = { path, size: info.size }
  }
}
await inspectDirectory(releaseDirectory)
assert.ok(totalBytes < 30 * 1024 * 1024, 'EXE 精简目录超过 30MB')

const source = await readFile(
  join(projectDirectory, 'desktop', 'launcher', 'main.go'),
  'utf8',
)
const buildSource = await readFile(
  join(projectDirectory, 'scripts', 'build-windows-launcher.mjs'),
  'utf8',
)
for (const expected of [
  'OLLAMA_MODELS=',
  'models", "ollama',
  'LauncherControlPort',
  'terminateProcessTree',
  'configureFirewall',
  'startImageRuntime',
  'server.log',
  'portAvailable',
]) {
  assert.ok(source.includes(expected), `启动器缺少关键逻辑：${expected}`)
}
assert.ok(buildSource.includes('-H=windowsgui'))
assert.ok(!source.includes('readConsoleCommands'))

console.log(
  JSON.stringify(
    {
      windowsExecutable: true,
      architecture: 'windows-amd64',
      executableMB: Number((executable.length / 1024 / 1024).toFixed(2)),
      packageMB: Number((totalBytes / 1024 / 1024).toFixed(2)),
      largestFile: largestFile.path.replace(`${releaseDirectory}/`, ''),
      modelsIncluded: false,
      portableModelDirectory: true,
      duplicateLaunchControl: true,
      gracefulStopControl: true,
      consoleWindow: false,
      iconEmbedded: true,
    },
    null,
    2,
  ),
)
