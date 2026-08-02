import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
let capturedChat

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: '0.32.4-vision-test' }),
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
              size: 5_000_000_000,
              digest: 'sha256:chat-test',
              details: {
                format: 'gguf',
                family: 'qwen',
                families: ['qwen'],
                parameter_size: '8B',
                quantization_level: 'Q4_K_M',
              },
            },
            {
              name: 'qwen3.6-vision-test:latest',
              model: 'qwen3.6-vision-test:latest',
              modified_at: new Date().toISOString(),
              size: 17_000_000_000,
              digest: 'sha256:vision-test',
              details: {
                format: 'gguf',
                family: 'qwen3_5',
                families: ['qwen3_5'],
                parameter_size: '27B',
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
      const requestedModel = request.postDataJSON()?.model ?? ''
      const supportsVision = requestedModel.includes('vision')
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          details: {
            format: 'gguf',
            family: 'qwen3_5',
            parameter_size: '27B',
            quantization_level: 'Q4_K_M',
          },
          capabilities: supportsVision
            ? ['completion', 'vision', 'thinking']
            : ['completion'],
          model_info: { 'qwen35.context_length': 262144 },
        }),
      })
    }
    if (pathname.endsWith('/chat')) {
      capturedChat = request.postDataJSON()
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: [
          JSON.stringify({
            message: {
              role: 'assistant',
              thinking: '正在分析本地图片。',
            },
            done: false,
          }),
          JSON.stringify({
            message: {
              role: 'assistant',
              content: '多模态图片识别链路测试成功。',
            },
            done: true,
          }),
        ].join('\n'),
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

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M/wn4GBgYGJAQoAHgQCAZ7HXmQAAAAASUVORK5CYII=',
    'base64',
  )
  await page
    .locator('input[type="file"][accept*="image"]')
    .setInputFiles({
      name: 'vision-check.png',
      mimeType: 'image/png',
      buffer: tinyPng,
    })
  await page.waitForFunction(
    () => document.body.innerText.includes('已添加 1 个文件'),
    undefined,
    { timeout: 10_000 },
  )
  await page.getByText(/本次将自动使用 qwen3\.6-vision-test/).waitFor()

  const editor = page.locator('.composer-textarea')
  await editor.fill('请描述这张测试图片。')
  await editor.press('Enter')
  await page.waitForFunction(
    () => document.body.innerText.includes('多模态图片识别链路测试成功'),
    undefined,
    { timeout: 20_000 },
  )

  const userMessage = capturedChat?.messages?.findLast(
    (message) => message.role === 'user',
  )
  const imagePayload = userMessage?.images?.[0]
  if (!imagePayload || imagePayload.startsWith('data:')) {
    throw new Error('chat payload did not contain raw Base64 image data')
  }
  const normalizedImage = Buffer.from(imagePayload, 'base64')
  if (
    normalizedImage[0] !== 0xff ||
    normalizedImage[1] !== 0xd8 ||
    normalizedImage[2] !== 0xff
  ) {
    throw new Error('vision image was not normalized to a compatible JPEG')
  }
  if (userMessage.content !== '请描述这张测试图片。') {
    throw new Error(
      `chat payload lost the image prompt: ${JSON.stringify(userMessage?.content)}`,
    )
  }
  if (capturedChat?.model !== 'qwen3.6-vision-test:latest') {
    throw new Error(`vision request used wrong model: ${capturedChat?.model}`)
  }
  const chatModelAfter = await page.locator('.model-select').innerText()
  if (
    chatModelBefore !== chatModelAfter ||
    !chatModelAfter.includes('local-chat-test')
  ) {
    throw new Error('automatic vision routing changed the chat model')
  }

  await page.waitForFunction(
    () => document.body.innerText.includes('本地数据已保存'),
    undefined,
    { timeout: 10_000 },
  )
  await page.reload({ waitUntil: 'networkidle' })
  const restoredImages = await page.locator('.message-image-grid img').count()
  if (restoredImages !== 1) {
    throw new Error('the conversation image was not restored from IndexedDB')
  }

  await page.screenshot({
    path: '/private/tmp/shotai-vision-check.png',
    fullPage: false,
  })
  console.log(
    JSON.stringify(
      {
        visionCapabilityDetected: true,
        automaticVisionRouting: true,
        chatModelUnchanged: true,
        imagePreviewRendered: restoredImages === 1,
        rawBase64Sent: !imagePayload.startsWith('data:'),
        compatibleJpegSent: true,
        promptSent: userMessage.content,
        conversationRestored: true,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
