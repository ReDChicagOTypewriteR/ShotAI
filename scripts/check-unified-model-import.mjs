import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright-core'

const projectDirectory = resolve(import.meta.dirname, '..')
const builtHtml = readFileSync(resolve(projectDirectory, 'dist/index.html'), 'utf8')
if (/import\.meta\.resolve/.test(builtHtml) || /type=["']module["']/.test(builtHtml)) {
  throw new Error('legacy-compatible build still contains the modern browser probe')
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
      body: JSON.stringify({ version: '1.1.4', isHost: true, canManage: true, port: 9090 }),
    }),
  )
  await page.route('**/image-runtime/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        available: false,
        serviceOnline: false,
        runtimeFound: true,
        modelConfigured: false,
        modelLabel: 'FLUX.2 Klein 9B',
        modelFiles: [],
        missingFiles: ['图片模型文件'],
      }),
    }),
  )
  await page.route('**/image/v1/models', (route) => route.fulfill({ status: 503, body: '{}' }))
  await page.route('**/ollama/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/version')) return route.fulfill({ contentType: 'application/json', body: '{"version":"test"}' })
    if (pathname.endsWith('/tags') || pathname.endsWith('/ps')) {
      return route.fulfill({ contentType: 'application/json', body: '{"models":[]}' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.getByLabel('打开设置').click()
  await page.getByRole('button', { name: /日常对话/ }).click()
  const modelDrawer = page.getByRole('dialog', { name: '模型管理' })
  await modelDrawer.getByRole('button', { name: '添加模型', exact: true }).click()
  const dialog = page.locator('.import-dialog')
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: 'flux-2-klein-9b-Q4_0.gguf', mimeType: 'application/octet-stream', buffer: Buffer.alloc(64) },
    { name: 'Qwen3-8B-Q4_K_M.gguf', mimeType: 'application/octet-stream', buffer: Buffer.alloc(64) },
    { name: 'flux2-vae.safetensors', mimeType: 'application/octet-stream', buffer: Buffer.alloc(64) },
  ])
  await dialog.getByText('已识别为图片生成与修改模型', { exact: true }).waitFor()
  await dialog.getByText(/重复的文件会直接复用/).waitFor()
  await dialog.getByRole('button', { name: '取消' }).click()

  await page.keyboard.press('Escape')
  await page.getByLabel('打开设置').click()
  await page.getByText('模型临时文件', { exact: true }).waitFor()

  console.log(
    JSON.stringify(
      {
        oldBrowserProbeRemoved: true,
        oneModelImportEntry: true,
        imagePipelineAutoDetected: true,
        duplicateFileReuseExplained: true,
        modelCacheCleanupVisible: true,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
