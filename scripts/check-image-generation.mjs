import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

let capturedRequest

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text())
  })
  await page.route('**/image-runtime/status', async (route) => {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        serviceOnline: true,
        serviceStatus: 200,
        runtimeFound: true,
        modelConfigured: true,
        modelLabel: 'FLUX.2 Klein 4B',
        modelFiles: ['flux2-klein-4b.q4_k.gguf'],
        modelDirectory: 'models/image',
        runtimeDirectory: 'runtime/image',
      }),
    })
  })
  await page.route('**/shotai/system', async (route) => {
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        version: '1.0.0',
        isHost: true,
        canManage: true,
        port: 9090,
      }),
    })
  })
  await page.route('**/image/v1/images/generations', async (route) => {
    capturedRequest = route.request().postDataJSON()
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZ7HXmQAAAAASUVORK5CYII='
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        created: Date.now(),
        data: [{ b64_json: image }],
      }),
    })
  })
  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: '0.33.0-image-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'local-chat-test:latest',
              model: 'local-chat-test:latest',
              modified_at: new Date().toISOString(),
              size: 5_700_000_000,
              digest: 'sha256:image-generation-test',
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
          details: {
            format: 'gguf',
            family: 'qwen',
            parameter_size: '1B',
            quantization_level: 'Q4',
          },
          capabilities: ['completion'],
        }),
      })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unhandled test route: ${pathname}` }),
    })
  })

  await page.goto('http://127.0.0.1:5173/#workbench', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.waitForFunction(
    () => document.body.innerText.includes('local-chat-test'),
    undefined,
    { timeout: 20_000 },
  )
  const chatModelBefore = await page.locator('.model-select').innerText()

  await page.getByLabel('添加文件或使用我的资料').click()
  await page.getByText('创作图片', { exact: true }).click()
  await page.getByText('图片模型已就绪', { exact: true }).waitFor()
  await page
    .getByText('自动使用 FLUX.2 Klein 4B', { exact: true })
    .waitFor()
  await page
    .getByText('只负责生成图片，不会更改聊天模型', { exact: true })
    .waitFor()

  const prompt = '一枚银色航天器停在火星基地，清晨阳光，电影感'
  await page.getByPlaceholder(/例如：一枚银色航天器/).fill(prompt)
  await page.getByRole('button', { name: /横图/ }).click()
  await page.getByRole('button', { name: '开始生成' }).click()
  await page
    .getByLabel('图片创作')
    .getByText('图片已生成', { exact: true })
    .waitFor()

  if (
    capturedRequest?.model !== 'FLUX.2 Klein 4B' ||
    capturedRequest?.prompt !== prompt ||
    capturedRequest?.width !== 1152 ||
    capturedRequest?.height !== 768 ||
    capturedRequest?.size !== '1152x768' ||
    capturedRequest?.response_format !== 'b64_json' ||
    capturedRequest?.steps !== 4 ||
    capturedRequest?.cfg_scale !== 1
  ) {
    throw new Error(
      `image request is incorrect: ${JSON.stringify(capturedRequest)}`,
    )
  }

  const imageLoaded = await page
    .locator('.generated-image img')
    .evaluate((image) => image.complete && image.naturalWidth > 0)
  if (!imageLoaded) throw new Error('generated image preview did not load')
  if (!(await page.getByRole('button', { name: '保存图片' }).count())) {
    throw new Error('generated image download action is missing')
  }
  const chatModelAfter = await page.locator('.model-select').innerText()
  if (chatModelAfter !== chatModelBefore) {
    throw new Error('chat model changed after image generation')
  }
  if ((await page.locator('.image-history-grid article').count()) !== 1) {
    throw new Error('generated image was not added to local history')
  }

  await page.waitForTimeout(600)
  const storedHistoryCount = await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const openRequest = indexedDB.open('shotai-local', 3)
        openRequest.onerror = () => reject(openRequest.error)
        openRequest.onsuccess = () => {
          const database = openRequest.result
          const request = database
            .transaction('image-history', 'readonly')
            .objectStore('image-history')
            .get('primary')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => {
            resolve(Array.isArray(request.result) ? request.result.length : 0)
            database.close()
          }
        }
      }),
  )
  if (storedHistoryCount !== 1) {
    throw new Error(`generated image was not saved: ${storedHistoryCount}`)
  }
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByLabel('添加文件或使用我的资料').click()
  await page.getByText('创作图片', { exact: true }).click()
  await page.locator('.image-history-grid article').waitFor({ timeout: 5_000 })
  if ((await page.locator('.image-history-grid article').count()) !== 1) {
    throw new Error('generated image history did not survive reload')
  }

  await page.screenshot({
    path: '/private/tmp/shotai-image-generation.png',
    fullPage: false,
  })

  console.log(
    JSON.stringify(
      {
        windowsRuntimeDetected: true,
        imageModelDetected: true,
        automaticModelRouting: true,
        chatModelUnchanged: true,
        imageRequestCorrect: true,
        progressCompleted: true,
        previewRendered: true,
        downloadAvailable: true,
        localHistoryRestored: true,
        screenshot: '/private/tmp/shotai-image-generation.png',
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
