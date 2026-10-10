import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractFile } from '@electron/asar'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
for (const [platform, unpacked] of [['windows', 'win-unpacked'], ['ubuntu', 'linux-unpacked']]) {
  const resources = join(root, 'release', platform, unpacked, 'resources')
  const archive = join(resources, 'app.asar')
  assert.equal(JSON.parse(extractFile(archive, 'package.json').toString()).version, metadata.version)
  assert.deepEqual(extractFile(archive, 'desktop/electron/main.cjs'), await readFile(join(root, 'desktop/electron/main.cjs')))
  for (const resource of metadata.build.extraResources) {
    if (resource.from === 'dist') {
      assert.deepEqual(await readFile(join(resources, resource.to, 'index.html')), await readFile(join(root, 'dist/index.html')))
      for (const name of await readdir(join(root, 'dist/assets'))) {
        assert.deepEqual(await readFile(join(resources, resource.to, 'assets', name)), await readFile(join(root, 'dist/assets', name)))
      }
    } else {
      assert.deepEqual(await readFile(join(resources, resource.to)), await readFile(join(root, resource.from)))
    }
  }
  console.log(`${platform}: packaged version, Electron entry, server modules, config and web match current source`)
}
