import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })

  await page.route('**/shotai/system', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '1.0.0',
        isHost: false,
        canManage: false,
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
        runtimeFound: true,
        modelConfigured: false,
        modelLabel: '本地图片模型',
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
        body: JSON.stringify({ version: '0.13.0-v1-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'shotai-v1-test:latest',
              model: 'shotai-v1-test:latest',
              modified_at: new Date().toISOString(),
              size: 1_000_000_000,
              digest: 'sha256:v1',
              details: {
                format: 'gguf',
                family: 'qwen',
                families: ['qwen'],
                parameter_size: '1B',
                quantization_level: 'Q4',
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
          capabilities: ['completion'],
          details: { family: 'qwen', parameter_size: '1B' },
        }),
      })
    }
    return route.fulfill({ status: 404, body: '{}' })
  })

  await page.goto('http://127.0.0.1:5173/#workbench', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.getByText('ShotAI 1.0.0', { exact: true }).waitFor()
  await page.getByText('内网使用模式', { exact: true }).waitFor()
  await page.getByRole('button', { name: /日常对话/ }).click()
  await page.getByText('模型由主机统一管理', { exact: true }).waitFor()

  const modelDrawer = page.getByRole('dialog', { name: '模型管理' })
  if (await modelDrawer.getByRole('button', { name: '添加模型' }).count()) {
    throw new Error('内网使用者仍然可以看到主机模型安装入口')
  }

  await page.keyboard.press('Escape')
  await page.getByLabel('添加文件或使用我的资料').click()
  await page.getByText('创作图片', { exact: true }).click()
  await page.getByText('请在主机上添加图片模型', { exact: true }).waitFor()
  if (await page.getByRole('button', { name: /选择下载好的模型文件/ }).count()) {
    throw new Error('内网使用者仍然可以看到图片模型上传入口')
  }

  console.log(
    JSON.stringify(
      {
        versionVisible: true,
        lanModeVisible: true,
        modelAdministrationHidden: true,
        imageAdministrationHidden: true,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
