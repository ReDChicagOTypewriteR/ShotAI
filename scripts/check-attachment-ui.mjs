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
        body: JSON.stringify({ version: '0.32.4-attachment-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'qwen3-attachment-test:latest',
              model: 'qwen3-attachment-test:latest',
              modified_at: new Date().toISOString(),
              size: 6_000_000_000,
              digest: 'sha256:attachment-test',
              details: {
                format: 'gguf',
                family: 'qwen3',
                families: ['qwen3'],
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
            family: 'qwen3',
            parameter_size: '8B',
            quantization_level: 'Q4_K_M',
          },
          capabilities: ['completion'],
          model_info: { 'qwen3.context_length': 32768 },
        }),
      })
    }
    if (pathname.endsWith('/chat')) {
      capturedChat = request.postDataJSON()
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: `${JSON.stringify({
          message: {
            role: 'assistant',
            content: '文本附件读取成功。',
          },
          done: true,
        })}\n`,
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
    () => document.body.innerText.includes('qwen3-attachment-test'),
    undefined,
    { timeout: 20_000 },
  )

  const attachmentText =
    'ShotAI 附件测试资料：项目代号为 ORBIT-7，明日上午九点进行内网验收。'
  await page
    .locator('input[type="file"][accept*=".txt"]')
    .setInputFiles({
      name: 'attachment-check.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(attachmentText),
    })
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('已添加 1 个文件') &&
      document.body.innerText.includes('attachment-check.txt'),
    undefined,
    { timeout: 10_000 },
  )

  const editor = page.locator('.composer-textarea')
  await editor.fill('请总结附件中的测试安排。')
  await page.waitForTimeout(150)
  await editor.press('Enter')
  await page.waitForFunction(
    () => document.body.innerText.includes('文本附件读取成功'),
    undefined,
    { timeout: 20_000 },
  )

  const userMessage = capturedChat?.messages?.findLast(
    (message) => message.role === 'user',
  )
  if (!userMessage?.content.includes('请总结附件中的测试安排。')) {
    throw new Error('chat payload lost the visible prompt')
  }
  if (
    !userMessage.content.includes('attachment-check.txt') ||
    !userMessage.content.includes(attachmentText)
  ) {
    throw new Error('chat payload lost the extracted attachment text')
  }

  const messageFileCards = await page.locator('.message-file-card').count()
  if (messageFileCards !== 1) {
    throw new Error('the sent attachment card was not rendered')
  }

  await page.waitForFunction(
    () => document.body.innerText.includes('本地数据已保存'),
    undefined,
    { timeout: 10_000 },
  )
  await page.reload({ waitUntil: 'networkidle' })
  const restoredAttachmentCards = await page
    .locator('.message-file-card')
    .count()
  if (restoredAttachmentCards !== 1) {
    throw new Error('the attachment was not restored from IndexedDB')
  }

  await page.screenshot({
    path: '/private/tmp/shotai-attachment-check.png',
    fullPage: false,
  })
  console.log(
    JSON.stringify(
      {
        attachmentParsed: true,
        extractedTextSent: true,
        visiblePromptPreserved: true,
        attachmentCardRendered: messageFileCards === 1,
        conversationRestored: restoredAttachmentCards === 1,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
