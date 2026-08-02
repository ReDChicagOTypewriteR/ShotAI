import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  page.on('pageerror', (error) => console.error('page error:', error.message))
  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: 'answer-format-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'answer-test:latest',
              model: 'answer-test:latest',
              size: 1_000_000_000,
              digest: 'sha256:answer-test',
              details: {
                format: 'gguf',
                family: 'qwen',
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
          model_info: { 'qwen.context_length': 32768 },
        }),
      })
    }
    if (pathname.endsWith('/chat')) {
      const content = [
        '# 测试标题',
        '',
        '1. 第一项',
        '2. 第二项',
        '',
        '| 名称 | 状态 |',
        '| --- | --- |',
        '| 对话 | 正常 |',
        '',
        '```js',
        'console.log("ShotAI")',
        '```',
        '',
        '<img src="https://example.com/tracker.png" onerror="alert(1)">',
      ].join('\n')
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: `${JSON.stringify({
          message: { role: 'assistant', content },
          done: true,
        })}\n`,
      })
    }
    return route.fulfill({ status: 404, body: '{}' })
  })

  await page.goto('http://127.0.0.1:5173/#workbench', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.locator('.composer-textarea').fill('测试回答排版')
  await page.locator('.composer-textarea').press('Enter')
  const answer = page.locator('.formatted-answer').last()
  try {
    await answer.locator('table').waitFor({ timeout: 10_000 })
  } catch (error) {
    console.error((await page.locator('body').innerText()).slice(-2_000))
    throw error
  }

  const result = await answer.evaluate((element) => ({
    heading: Boolean(element.querySelector('h1')),
    orderedList: Boolean(element.querySelector('ol')),
    table: Boolean(element.querySelector('table')),
    codeCopy: Boolean(element.querySelector('[data-copy-code]')),
    remoteImageBlocked: !element.querySelector('img'),
    unsafeHandlerBlocked: !element.innerHTML.includes('onerror'),
  }))
  if (Object.values(result).some((value) => !value)) {
    throw new Error(`answer formatting is incomplete: ${JSON.stringify(result)}`)
  }

  console.log(JSON.stringify(result, null, 2))
} finally {
  await browser.close()
}
