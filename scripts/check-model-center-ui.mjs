import { chromium } from 'playwright-core'

const targetUrl = process.env.SHOTAI_UI_URL || 'http://127.0.0.1:5175/'
const screenshotPath =
  process.env.SHOTAI_MODEL_CENTER_SCREENSHOT ||
  '/private/tmp/shotai-model-center.png'
const collapsedScreenshotPath = '/private/tmp/shotai-sidebar-collapsed.png'

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
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
        available: true,
        serviceOnline: true,
        serviceStatus: 200,
        runtimeFound: true,
        modelConfigured: true,
        modelLabel: 'FLUX.2 Klein 4B',
        modelFiles: [
          'flux-2-klein-4b-Q8_0.gguf',
          'Qwen3-4B-Q4_K_M.gguf',
          'diffusion_pytorch_model.safetensors',
        ],
        missingFiles: [],
        runtimeError: '',
      }),
    }),
  )
  await page.route('**/image/v1/models', (route) =>
    route.fulfill({ contentType: 'application/json', body: '{"data":[]}' }),
  )
  await page.route('**/ollama/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/version')) {
      return route.fulfill({ contentType: 'application/json', body: '{"version":"0.12-test"}' })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'qwen3-vl:8b',
              model: 'qwen3-vl:8b',
              size: 5_100_000_000,
              digest: 'a'.repeat(64),
              details: { family: 'qwen3vl', parameter_size: '8B', quantization_level: 'Q4_K_M' },
            },
            {
              name: 'qwen3-embedding:4b',
              model: 'qwen3-embedding:4b',
              size: 2_500_000_000,
              digest: 'b'.repeat(64),
              details: { family: 'qwen3', parameter_size: '4B', quantization_level: 'Q4_K_M' },
            },
          ],
        }),
      })
    }
    if (pathname.endsWith('/ps')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ models: [{ name: 'qwen3-vl:8b', model: 'qwen3-vl:8b' }] }),
      })
    }
    if (pathname.endsWith('/show')) {
      const model = route.request().postDataJSON()?.model || ''
      const embedding = model.includes('embedding')
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          details: {
            family: embedding ? 'qwen3' : 'qwen3vl',
            parameter_size: embedding ? '4B' : '8B',
            quantization_level: 'Q4_K_M',
          },
          capabilities: embedding ? ['embedding'] : ['completion', 'vision'],
          model_info: { 'qwen3.context_length': 32768 },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20_000 })
  const sidebar = page.locator('#conversation-sidebar')
  const main = page.locator('.main-shell')
  await page.getByRole('button', { name: '折叠对话侧边栏' }).click()
  await page.waitForFunction(() => document.querySelector('.shot-app')?.classList.contains('sidebar-collapsed'))
  await page.waitForTimeout(280)

  const collapsed = await page.evaluate(() => ({
    sidebarWidth: Math.round(document.querySelector('#conversation-sidebar')?.getBoundingClientRect().width || 0),
    mainLeft: Math.round(document.querySelector('.main-shell')?.getBoundingClientRect().left || 0),
    stored: localStorage.getItem('shotai:conversation-sidebar-collapsed'),
  }))
  if (collapsed.sidebarWidth !== 72 || collapsed.mainLeft !== 72 || collapsed.stored !== '1') {
    throw new Error(`sidebar did not collapse correctly: ${JSON.stringify(collapsed)}`)
  }
  await page.screenshot({ path: collapsedScreenshotPath })

  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '展开对话侧边栏' }).waitFor()
  await page.getByRole('button', { name: '展开对话侧边栏' }).click()
  await page.waitForFunction(() => !document.querySelector('.shot-app')?.classList.contains('sidebar-collapsed'))
  await page.waitForTimeout(280)

  const expanded = await page.evaluate(() => ({
    sidebarWidth: Math.round(document.querySelector('#conversation-sidebar')?.getBoundingClientRect().width || 0),
    mainLeft: Math.round(document.querySelector('.main-shell')?.getBoundingClientRect().left || 0),
  }))
  if (expanded.sidebarWidth !== 272 || expanded.mainLeft !== 272) {
    throw new Error(`sidebar did not expand correctly: ${JSON.stringify(expanded)}`)
  }

  await page.getByRole('button', { name: '打开模型管理' }).click()
  const drawer = page.getByRole('dialog', { name: '模型管理' })
  await drawer.getByRole('heading', { name: '对话与图片识别' }).waitFor()
  await drawer.getByRole('heading', { name: '资料查找' }).waitFor()
  await drawer.getByRole('heading', { name: '图片生成与修改' }).waitFor()
  await drawer.getByText('qwen3-vl:8b', { exact: true }).waitFor()
  await drawer.getByText('qwen3-embedding:4b', { exact: true }).waitFor()
  await drawer.getByText('FLUX.2 Klein 4B', { exact: true }).waitFor()
  await drawer.getByText(/查看 3 个图片模型文件/).click()
  await drawer.getByText('flux-2-klein-4b-Q8_0.gguf', { exact: true }).waitFor()
  await drawer.screenshot({ path: screenshotPath })

  console.log(JSON.stringify({
    collapsibleConversationSidebar: true,
    collapsedStatePersisted: true,
    unifiedModelManagement: true,
    conversationModelsGrouped: true,
    knowledgeModelsGrouped: true,
    imagePipelineFilesManaged: true,
    screenshotPath,
    collapsedScreenshotPath,
  }, null, 2))
} finally {
  await browser.close()
}
