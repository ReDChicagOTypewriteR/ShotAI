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
  'desktop/electron/assets/shotai.png',
  'desktop/electron/main.cjs',
  'dist/index.html',
  'docs/UBUNTU_GUIDE.md',
]) {
  await access(join(projectDirectory, path), constants.R_OK)
}

assert.ok(packageJson.scripts['electron:pack:ubuntu'])
assert.equal(packageJson.scripts['build:ubuntu'], 'npm run electron:pack:ubuntu')
assert.equal(packageJson.desktopName, 'ShotAI')
assert.equal(packageJson.build.linux.executableName, 'shotai')
assert.equal(packageJson.build.linux.syncDesktopName, true)
assert.equal(packageJson.build.linux.category, 'Utility')
assert.equal(
  packageJson.build.linux.artifactName,
  'ShotAI-${version}-Ubuntu-22.04-x86_64.${ext}',
)
assert.deepEqual(
  packageJson.build.linux.target.map((target) => target.target),
  ['AppImage', 'deb'],
)
assert.ok(
  packageJson.build.linux.target.every((target) =>
    target.arch.includes('x64'),
  ),
)
assert.equal(packageJson.build.deb.packageCategory, 'utils')
assert.ok(packageJson.build.deb.recommends.includes('libappindicator3-1'))

for (const expected of [
  "[name, join('bin', name)]",
  "process.platform === 'win32' ? 'sd-server.exe' : 'sd-server'",
  "child.kill('SIGTERM')",
  "process.platform === 'win32' ? 'shotai.ico' : 'shotai.png'",
]) {
  assert.ok(mainSource.includes(expected), `Linux 主进程兼容逻辑缺少：${expected}`)
}

assert.ok(serverSource.includes('platform: process.platform'))
assert.ok(!mainSource.includes('logs\\\\image-runtime.log'))

console.log(
  JSON.stringify(
    {
      ubuntuPackage: true,
      architecture: 'x86_64',
      targets: ['deb', 'AppImage'],
      lanHost: '0.0.0.0',
      lanPort: 9090,
      systemOllamaSupported: true,
      bundledModels: false,
    },
    null,
    2,
  ),
)
