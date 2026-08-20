import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
const forbiddenTerms = [
  'Ollama',
  'GGUF',
  'mmproj',
  'Vision',
  'Embedding',
  'RAG',
  'SHA-256',
  'IndexedDB',
  'POST',
  'API',
  '上下文',
  '量化',
  '推理',
  '向量',
  '索引',
  '切片',
  '知识库',
  '代理',
]

function assertPlainLanguage(label, text) {
  const matches = forbiddenTerms.filter((term) =>
    text.toLowerCase().includes(term.toLowerCase()),
  )
  if (matches.length) {
    throw new Error(`${label} still exposes technical terms: ${matches.join(', ')}`)
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.setDefaultTimeout(6_000)
  await page.route('**/shotai/system', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '1.0.0',
        isHost: true,
        canManage: true,
        port: 9090,
      }),
    }),
  )
  await page.route('**/image-runtime/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        available: false,
        serviceOnline: false,
        runtimeFound: false,
        modelConfigured: false,
        modelFiles: [],
      }),
    }),
  )
  await page.route('**/image/v1/models', (route) =>
    route.fulfill({ status: 503, body: '{}' }),
  )
  await page.route('**/ollama/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: '1.0' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: '单位智能助手',
              model: 'unit-assistant',
              modified_at: new Date().toISOString(),
              size: 6_000_000_000,
              digest: 'sha256:plain-language-test',
              details: {
                format: 'gguf',
                family: 'qwen',
                families: ['qwen'],
                parameter_size: '8B',
                quantization_level: 'Q4_K_M',
              },
            },
          ],
        }),
      })
    }
    if (pathname.endsWith('/ps')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ models: [] }),
      })
    }
    if (pathname.endsWith('/show')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          details: {
            format: 'gguf',
            family: 'qwen',
            parameter_size: '8B',
            quantization_level: 'Q4_K_M',
          },
          capabilities: ['completion', 'vision', 'embedding'],
          model_info: { 'qwen.context_length': 32768 },
        }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    })
  })

  await page.goto(`${process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5173/'}#workbench`, {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  assertPlainLanguage('对话首页', await page.locator('body').innerText())
  await page.setViewportSize({ width: 1672, height: 941 })
  await page.screenshot({
    path: '/private/tmp/shotai-product-preview-plain.png',
    fullPage: false,
  })
  await page.setViewportSize({ width: 1440, height: 960 })

  await page.locator('.composer-tool-button').click()
  await page.getByText('管理 AI 模型', { exact: true }).click()
  assertPlainLanguage(
    '模型管理',
    await page.locator('.el-drawer.open').innerText(),
  )
  await page.getByRole('button', { name: '添加模型', exact: true }).click()
  assertPlainLanguage('添加模型', await page.locator('.el-dialog').innerText())
  await page.keyboard.press('Escape')

  await page.locator('.composer-tool-button').click()
  await page.getByText('选择我的资料', { exact: true }).click()
  assertPlainLanguage(
    '我的资料',
    await page.locator('.el-drawer.open').innerText(),
  )
  await page.keyboard.press('Escape')

  await page.getByLabel('打开设置').click()
  assertPlainLanguage('设置', await page.locator('.el-drawer.open').innerText())

  const portal = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  })
  portal.setDefaultTimeout(6_000)
  await portal.goto(process.env.SHOTAI_PORTAL_TEST_URL || 'http://127.0.0.1:5174/', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  assertPlainLanguage('门户网站', await portal.locator('body').innerText())

  await page.screenshot({
    path: '/private/tmp/shotai-plain-language-workbench.png',
    fullPage: false,
  })
  await portal.screenshot({
    path: '/private/tmp/shotai-plain-language-portal.png',
    fullPage: true,
  })

  console.log(
    JSON.stringify(
      {
        workbenchPlainLanguage: true,
        modelManagementPlainLanguage: true,
        modelImportPlainLanguage: true,
        knowledgePlainLanguage: true,
        settingsPlainLanguage: true,
        portalPlainLanguage: true,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
