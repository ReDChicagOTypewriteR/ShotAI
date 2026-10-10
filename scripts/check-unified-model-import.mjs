import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const projectDirectory = resolve(import.meta.dirname, '..')
const appUrl = process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5173'
const builtHtml = readFileSync(resolve(projectDirectory, 'dist/index.html'), 'utf8')
const ollamaServiceSource = readFileSync(
  resolve(projectDirectory, 'src/services/ollama.ts'),
  'utf8',
)
const appSource = readFileSync(resolve(projectDirectory, 'src/App.vue'), 'utf8')
let imageModelConfigured = false
let importFailureLogs = 0
if (/import\.meta\.resolve/.test(builtHtml) || /type=["']module["']/.test(builtHtml)) {
  throw new Error('legacy-compatible build still contains the modern browser probe')
}
if (!ollamaServiceSource.includes('SHOTAI_OK')) {
  throw new Error('model import is missing the instruction-following self-test')
}
if (
  !ollamaServiceSource.includes('/shotai/model-import/files/') ||
  !appSource.includes('导入时边写入边校验')
) {
  throw new Error('chat model import is missing the one-pass local fast path')
}

function createMetadataFreeGguf() {
  const buffer = Buffer.alloc(64)
  buffer.write('GGUF', 0, 'ascii')
  buffer.writeUInt32LE(3, 4)
  buffer.writeBigUInt64LE(1n, 8)
  buffer.writeBigUInt64LE(0n, 16)
  return buffer
}

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
  await page.route('**/shotai/system', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ version: '1.1.6', isHost: true, canManage: true, port: 9090 }),
    }),
  )
  await page.route('**/image-runtime/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        available: false,
        serviceOnline: false,
        runtimeFound: false,
        modelConfigured: imageModelConfigured,
        modelLabel: 'FLUX.2 Klein 9B',
        modelFiles: imageModelConfigured
          ? [
              'flux-2-klein-9b-Q4_0.gguf',
              'Qwen3-8B-Q4_K_M.gguf',
              'flux2-vae.safetensors',
            ]
          : [],
        missingFiles: imageModelConfigured ? [] : ['图片模型文件'],
        runtimeError: imageModelConfigured
          ? '图片模型文件已保存，但 Ubuntu 图片运行组件尚未安装。'
          : '',
      }),
    }),
  )
  await page.route('**/image-runtime/models/reuse', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ reused: false }),
    }),
  )
  await page.route('**/image-runtime/models/*', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        fileName: decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)),
        size: route.request().postDataBuffer()?.length || 0,
      }),
    }),
  )
  await page.route('**/image-runtime/restart', (route) => {
    imageModelConfigured = true
    return route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ accepted: true, restartRequired: false }),
    })
  })
  await page.route('**/shotai/model-import-log', (route) => {
    importFailureLogs += 1
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ saved: true }),
    })
  })
  await page.route('**/image/v1/models', (route) => route.fulfill({ status: 503, body: '{}' }))
  await page.route('**/ollama/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/version')) return route.fulfill({ contentType: 'application/json', body: '{"version":"test"}' })
    if (pathname.endsWith('/tags') || pathname.endsWith('/ps')) {
      return route.fulfill({ contentType: 'application/json', body: '{"models":[]}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(`${appUrl}/`, { waitUntil: 'networkidle' })
  await page.getByLabel('打开设置').click()
  await page.getByRole('button', { name: /日常对话/ }).click()
  const modelDrawer = page.getByRole('dialog', { name: '模型管理' })
  await modelDrawer.getByRole('button', { name: '添加模型', exact: true }).click()
  const dialog = page.locator('.import-dialog')
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'flux-2-klein-9b-Q4_0.gguf', mimeType: 'application/octet-stream', buffer: createMetadataFreeGguf() },
    { name: 'Qwen3-8B-Q4_K_M.gguf', mimeType: 'application/octet-stream', buffer: createMetadataFreeGguf() },
    { name: 'flux2-vae.safetensors', mimeType: 'application/octet-stream', buffer: Buffer.alloc(64) },
  ])
  await dialog.getByText('已识别为图片生成与修改模型', { exact: true }).waitFor()
  await dialog.getByText(/重复的文件会直接复用/).waitFor()
  await dialog.getByRole('button', { name: '下一步' }).click()
  await dialog.getByText('文件正常', { exact: true }).waitFor()
  await dialog.getByText('生成与修改图片', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '下一步' }).click()
  await dialog.getByRole('button', { name: '开始导入' }).click()
  await dialog.getByText('模型文件已导入', { exact: true }).waitFor()
  await dialog.getByText('待安装运行组件', { exact: true }).waitFor()
  await dialog.getByText(/Ubuntu 图片运行组件尚未安装/).waitFor()
  if (importFailureLogs !== 0) {
    throw new Error('missing image runtime was incorrectly recorded as a model import failure')
  }
  await dialog.getByRole('button', { name: '完成' }).click()

  await page.keyboard.press('Escape')
  await page.getByLabel('打开设置').click()
  await page.getByRole('button', { name: /日常对话/ }).click()
  await modelDrawer.getByRole('button', { name: '添加模型', exact: true }).click()
  await page.route('**/image-runtime/models/*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '测试：磁盘写入失败' }) }))
  await page.route('**/shotai/model-import-log', route => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ saved: true, path: '/home/z/桌面/ShotAI-logs/test.log', downloadUrl: '/shotai/model-import-diagnostic/test.log' }) }))
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'flux-2-klein-4b-Q4_0.gguf', mimeType: 'application/octet-stream', buffer: createMetadataFreeGguf() },
    { name: 'Qwen3-4B-Q4_K_M.gguf', mimeType: 'application/octet-stream', buffer: createMetadataFreeGguf() },
    { name: 'flux2-vae.safetensors', mimeType: 'application/octet-stream', buffer: Buffer.alloc(64) },
  ])
  await dialog.getByRole('button', { name: '下一步' }).click()
  await dialog.getByRole('button', { name: '下一步' }).click()
  await dialog.getByRole('button', { name: '开始导入' }).click()
  const failure = dialog.getByRole('alert', { name: '模型导入失败详情' })
  await failure.waitFor()
  await failure.getByRole('link', { name: '导出诊断文件' }).waitFor()
  await failure.getByRole('button', { name: '查看错误详情' }).click()
  await failure.getByText(/测试：磁盘写入失败/).waitFor()
  await failure.getByRole('button', { name: '重试导入' }).waitFor()
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await failure.getByRole('link', { name: '导出诊断文件' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: '/private/tmp/shotai-import-failure.png' })
  await page.setViewportSize({ width: 1360, height: 900 })
  await dialog.getByRole('button', { name: '取消', exact: true }).click()

  await page.keyboard.press('Escape')
  await page.getByLabel('打开设置').click()
  await page.getByText('模型临时文件', { exact: true }).waitFor()

  console.log(
    JSON.stringify(
      {
        oldBrowserProbeRemoved: true,
        oneModelImportEntry: true,
        imagePipelineAutoDetected: true,
        metadataFreeImageGgufAccepted: true,
        duplicateFileReuseExplained: true,
        modelCacheCleanupVisible: true,
        chatInstructionSelfTest: true,
        onePassChatModelImport: true,
        missingImageRuntimeKeepsImportedModel: true,
        missingImageRuntimeNotLoggedAsImportFailure: true,
        failureDiagnosticVisible: true,
        persistentErrorDetails: true,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
