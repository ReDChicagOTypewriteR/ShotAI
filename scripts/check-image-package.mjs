import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const releaseDirectory = join(projectDirectory, 'release', 'shotai-lan')

const requiredFiles = [
  'lan.config.json',
  'server.ps1',
  'start-windows.bat',
  'start-image-runtime.ps1',
  'prepare-image-runtime.ps1',
  'prepare-image-runtime.bat',
  'runtime/image/SHOTAI_RUNTIME_INFO.txt',
  'runtime/image/sd-server.exe',
  'runtime/image/ggml-cuda.dll',
  'runtime/image/cudart64_12.dll',
  'runtime/image/cublas64_12.dll',
  'runtime/image/cublasLt64_12.dll',
  'runtime/ollama/ollama.exe',
  'runtime/ollama/LICENSE.ollama.txt',
  'runtime/ollama/SHOTAI_OLLAMA_RUNTIME_INFO.txt',
  'models/image/README-IMAGE-MODELS.txt',
  'USER-GUIDE.md',
  'CHANGELOG.md',
  'DEPLOYMENT.md',
  'web/index.html',
]

for (const relativePath of requiredFiles) {
  await access(join(releaseDirectory, relativePath), constants.R_OK)
}

const config = JSON.parse(
  await readFile(join(releaseDirectory, 'lan.config.json'), 'utf8'),
)
assert.equal(config.port, 9090)
assert.equal(config.version, '1.0.0')
assert.equal(config.allowLanAdministration, false)
assert.equal(config.imageRuntime?.url, 'http://127.0.0.1:1234')
assert.equal(config.imageRuntime?.mode, 'auto')
assert.equal(config.imageRuntime?.steps, 4)
assert.equal(config.imageRuntime?.cfgScale, 1)

const startScript = await readFile(
  join(releaseDirectory, 'start-image-runtime.ps1'),
  'utf8',
)
for (const expectedText of [
  'sd-server.exe',
  '--model',
  '--diffusion-model',
  '--llm',
  '--vae',
  '--offload-to-cpu',
  '--diffusion-fa',
  'image-runtime-error.log',
]) {
  assert.match(startScript, new RegExp(expectedText.replaceAll('-', '\\-')))
}
assert.match(startScript, /flux2-klein-4b\.q4_k\.gguf/i)
assert.match(startScript, /z\.\?image\.\*turbo/i)
assert.match(startScript, /diffusion_pytorch_model\.safetensors/i)

const serverScript = await readFile(
  join(releaseDirectory, 'server.ps1'),
  'utf8',
)
assert.match(serverScript, /\/image-runtime\/status/)
assert.match(serverScript, /\/shotai\/system/)
assert.match(serverScript, /Save-ImageModelFile/)
assert.match(serverScript, /Remove-ImageModelFile/)
assert.match(serverScript, /Restart-ImageRuntime/)
assert.match(serverScript, /Test-RequestCanManage/)
assert.match(serverScript, /模型由主机管理员统一管理/)
assert.match(serverScript, /StartsWith\("\/image\/"\)/)
assert.match(serverScript, /x-shotai-proxy/i)
assert.match(serverScript, /\$shouldBufferBody = \$relativePath -eq "api\/chat"/)
assert.match(serverScript, /\$proxyRequest\.ContentLength = \$bodyBytes\.Length/)
assert.match(serverScript, /100MB/)

const windowsLauncher = await readFile(
  join(releaseDirectory, 'start-windows.bat'),
  'utf8',
)
assert.match(windowsLauncher, /start-image-runtime\.ps1/i)
assert.match(windowsLauncher, /server\.ps1/i)
assert.match(windowsLauncher, /runtime\\ollama\\ollama\.exe/i)

const setupScript = await readFile(
  join(releaseDirectory, 'prepare-image-runtime.ps1'),
  'utf8',
)
assert.match(
  setupScript,
  /api\.github\.com\/repos\/leejet\/stable-diffusion\.cpp\/releases\/latest/,
)
assert.match(setupScript, /sd-\*-bin-win-cuda12-x64\.zip/)
assert.match(setupScript, /sd-server\.exe/)

const modelGuide = await readFile(
  join(
    releaseDirectory,
    'models',
    'image',
    'README-IMAGE-MODELS.txt',
  ),
  'utf8',
)
assert.match(modelGuide, /flux2-klein-4b\.q4_k\.gguf/i)
assert.match(modelGuide, /Z-Image Turbo/)
assert.match(modelGuide, /z_image_turbo-Q6_K\.gguf/i)

const webIndex = await readFile(
  join(releaseDirectory, 'web', 'index.html'),
  'utf8',
)
assert.match(webIndex, /nomodule/)
assert.match(webIndex, /polyfills-legacy/)
const assetPaths = [
  ...webIndex.matchAll(/(?:src|href)="\.?\/?([^"]+assets\/[^"]+)"/g),
].map((match) => match[1])
assert.ok(assetPaths.length >= 2, '发布首页没有引用构建后的网页文件')
for (const assetPath of assetPaths) {
  await access(join(releaseDirectory, 'web', assetPath), constants.R_OK)
}

const runtimeFiles = await readdir(
  join(releaseDirectory, 'runtime', 'image'),
)
assert.ok(
  runtimeFiles.includes('sd-server.exe') &&
    runtimeFiles.includes('ggml-cuda.dll') &&
    runtimeFiles.includes('cudart64_12.dll'),
  '离线发布包没有包含完整的 Windows CUDA 图片运行组件',
)

console.log(
  JSON.stringify(
    {
      releaseReady: true,
      windowsLauncherIncluded: true,
      runtimeSetupIncluded: true,
      offlineImageRuntimeIncluded: true,
      offlineOllamaRuntimeIncluded: true,
      singleFileModelSupported: true,
      splitModelSupported: true,
      imageProxyIncluded: true,
      hostAdministrationProtected: true,
      legacyBrowserFallbackIncluded: true,
      webAssetsIncluded: assetPaths.length,
    },
    null,
    2,
  ),
)
