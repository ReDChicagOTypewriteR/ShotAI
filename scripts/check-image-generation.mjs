import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

let capturedRequest
let capturedEditRequest

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
    await new Promise((resolve) => setTimeout(resolve, 650))
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
  await page.route('**/image/sdapi/v1/img2img', async (route) => {
    capturedEditRequest = route.request().postDataJSON()
    await new Promise((resolve) => setTimeout(resolve, 650))
    const image =
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZ7HXmQAAAAASUVORK5CYII='
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ images: [image], parameters: {}, info: '' }),
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
    () => Boolean(document.querySelector('.model-select')?.textContent?.trim()),
    undefined,
    { timeout: 20_000 },
  )
  const chatModelBefore = await page.locator('.model-select').innerText()

  const composer = page.getByLabel('输入问题')
  await composer.fill('如何生成图片模型？')
  if (await page.locator('.composer-auto-route').count()) {
    throw new Error('image tutorial question was incorrectly routed to generation')
  }
  await composer.fill('帮我生成一段 Python 代码')
  if (await page.locator('.composer-auto-route').count()) {
    throw new Error('code generation request was incorrectly routed to image generation')
  }

  const prompt = '帮我生成一张银色航天器停在火星基地的图片，清晨阳光，电影感'
  await composer.fill(prompt)
  const automaticGenerationRoute = page.locator('.composer-auto-route')
  await automaticGenerationRoute
    .getByText('将自动生成图片 · FLUX.2 Klein 4B', { exact: true })
    .waitFor()
  await page.screenshot({
    path: '/private/tmp/shotai-image-auto-route.png',
    fullPage: false,
  })
  await composer.press('Enter')
  const generatingState = page.locator('.inline-image-generating')
  await page.waitForTimeout(150)
  if (!(await generatingState.count())) {
    const state = await page.evaluate(() => ({
      text: document.body.innerText.slice(-1200),
      composer: document.querySelector('.composer-textarea')?.value,
      messageCount: document.querySelectorAll('.elx-bubble-list__item').length,
      messages: Array.from(document.querySelectorAll('.elx-bubble-list__item')).map(
        (node) => node.textContent,
      ),
    }))
    throw new Error(`inline generation did not start: ${JSON.stringify(state)}`)
  }
  await generatingState.waitFor({ state: 'visible', timeout: 5_000 })
  if (!(await generatingState.getByText(/正在载入并绘制/).count())) {
    throw new Error('inline image generation animation is missing status text')
  }
  await page.waitForFunction(
    () => document.body.innerText.includes('图片已根据你的描述在本地生成'),
    undefined,
    { timeout: 10_000 },
  )

  if (
    capturedRequest?.model !== 'FLUX.2 Klein 4B' ||
    capturedRequest?.prompt !== prompt ||
    capturedRequest?.width !== 1024 ||
    capturedRequest?.height !== 1024 ||
    capturedRequest?.size !== '1024x1024' ||
    capturedRequest?.response_format !== 'b64_json' ||
    capturedRequest?.steps !== 4 ||
    capturedRequest?.cfg_scale !== 1
  ) {
    throw new Error(
      `image request is incorrect: ${JSON.stringify(capturedRequest)}`,
    )
  }

  const imageLoaded = await page
    .locator('.message-image-grid img')
    .last()
    .evaluate((image) => image.complete && image.naturalWidth > 0)
  if (!imageLoaded) throw new Error('generated image preview did not load')
  if (!(await page.getByRole('button', { name: '保存生成的图片' }).count())) {
    throw new Error('generated image download action is missing')
  }
  const chatModelAfter = await page.locator('.model-select').innerText()
  if (chatModelAfter !== chatModelBefore) {
    throw new Error('chat model changed after image generation')
  }

  await composer.fill('再优化一下这段代码')
  if (await page.locator('.composer-auto-route').count()) {
    throw new Error('follow-up code request was incorrectly routed to image editing')
  }

  const editPrompt = '再加一点蓝色，并让灯光更自然'
  await composer.fill(editPrompt)
  const automaticEditRoute = page.locator('.composer-auto-route')
  await automaticEditRoute
    .getByText('将继续修改上一张图片 · FLUX.2 Klein 4B', { exact: true })
    .waitFor()
  await page.screenshot({
    path: '/private/tmp/shotai-image-context-edit.png',
    fullPage: false,
  })
  await composer.press('Enter')
  const editingState = page.locator('.inline-image-generating')
  await editingState.waitFor({
    state: 'visible',
    timeout: 5_000,
  })
  await editingState.getByText(/正在参考原图进行修改/).waitFor()
  await page.waitForFunction(
    () => document.body.innerText.includes('已根据上一张图片和你的新要求继续修改'),
    undefined,
    { timeout: 10_000 },
  )
  if (
    !capturedEditRequest?.prompt?.includes(`原始画面描述：${prompt}`) ||
    !capturedEditRequest?.prompt?.includes(`本次修改要求：${editPrompt}`) ||
    !capturedEditRequest?.prompt?.includes('只执行本次要求') ||
    capturedEditRequest?.init_images?.length !== 1 ||
    !capturedEditRequest.init_images[0].startsWith('data:image/png;base64,') ||
    capturedEditRequest?.denoising_strength !== 0.32 ||
    capturedEditRequest?.width !== 1024 ||
    capturedEditRequest?.height !== 1024 ||
    capturedEditRequest?.steps !== 12 ||
    capturedEditRequest?.cfg_scale !== 1
  ) {
    throw new Error(
      `image edit request is incorrect: ${JSON.stringify(capturedEditRequest)}`,
    )
  }
  if ((await page.locator('.message-image-grid img').count()) !== 2) {
    throw new Error('generated image and context-edited result were not rendered in chat')
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
  if (storedHistoryCount !== 2) {
    throw new Error(`generated image was not saved: ${storedHistoryCount}`)
  }
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.message-image-grid img').first().waitFor({ timeout: 5_000 })
  if ((await page.locator('.message-image-grid img').count()) !== 2) {
    throw new Error('generated conversation image did not survive reload')
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
        zeroClickImageGeneration: true,
        contextAwareImageEditing: true,
        nonImageRequestsStayInChat: true,
        inlineAnimationVisible: true,
        imageToImageRequestCorrect: true,
        previousImageReused: true,
        adaptiveEditStrengthApplied: true,
        automaticRouteScreenshot: '/private/tmp/shotai-image-auto-route.png',
        contextEditScreenshot: '/private/tmp/shotai-image-context-edit.png',
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
