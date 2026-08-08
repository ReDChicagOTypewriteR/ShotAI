import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJson = JSON.parse(
  await readFile(join(projectDirectory, 'package.json'), 'utf8'),
)
const mainSource = await readFile(
  join(projectDirectory, 'desktop', 'electron', 'main.cjs'),
  'utf8',
)
const serverSource = await readFile(
  join(projectDirectory, 'scripts', 'serve-lan.mjs'),
  'utf8',
)

for (const path of [
  'desktop/electron/main.cjs',
  'desktop/electron/assets/shotai.ico',
  'desktop/electron/assets/shotai.png',
  'dist/index.html',
  'scripts/serve-lan.mjs',
]) {
  await access(join(projectDirectory, path), constants.R_OK)
}

assert.equal(packageJson.main, 'desktop/electron/main.cjs')
assert.equal(packageJson.build.appId, 'com.shotai.desktop')
assert.equal(packageJson.build.win.requestedExecutionLevel, 'asInvoker')
assert.equal(packageJson.build.nsis.oneClick, false)
assert.equal(packageJson.build.nsis.perMachine, true)
assert.ok(packageJson.scripts['electron:pack:win'])
assert.ok(packageJson.scripts['electron:pack:win:full'])

for (const expected of [
  'requestSingleInstanceLock',
  'new BrowserWindow',
  'new Tray',
  'contextIsolation: true',
  'nodeIntegration: false',
  'sandbox: true',
  "join(dataRoot, 'models', 'ollama')",
  'startOllama',
  'startImageRuntime',
  'startLanServer',
  'pathToFileURL',
  'SHOTAI_EMBEDDED',
  'SHOTAI_SMOKE_TEST',
  "args.push('--diffusion-model', diffusion, '--llm', textEncoder, '--vae', vae)",
]) {
  assert.ok(mainSource.includes(expected), `Electron 主进程缺少：${expected}`)
}

for (const expected of [
  'SHOTAI_DATA_ROOT',
  'SHOTAI_WEB_ROOT',
  'SHOTAI_CONFIG_PATH',
  "process.send({ type: 'server-ready'",
  "process.send({ type: 'restart-image-runtime'",
]) {
  assert.ok(serverSource.includes(expected), `内网服务缺少：${expected}`)
}

assert.ok(!mainSource.includes('server.ps1'))
assert.ok(!mainSource.includes('child_process.fork'))
assert.ok(!mainSource.includes('execPath: process.execPath'))

console.log(
  JSON.stringify(
    {
      electronClient: true,
      nativeWindow: true,
      systemTray: true,
      singleInstance: true,
      lanPort: 9090,
      powershellWebServer: false,
      ollamaRuntimeOptional: true,
      imageRuntimeOptional: true,
      threeFileImagePipeline: true,
      modelsIncluded: false,
      firewallRuleInstalledOnce: true,
    },
    null,
    2,
  ),
)
