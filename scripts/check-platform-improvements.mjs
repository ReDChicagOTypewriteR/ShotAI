import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  args: ['--disable-gpu'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  let modelAvailable = true
  let deleteRequests = 0

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    })
    document.execCommand = (command) => command === 'copy'
  })

  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path.endsWith('/version')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"test"}' })
    }
    if (path.endsWith('/tags')) {
      const models = modelAvailable
        ? [{ name: 'local-test:latest', modified_at: '', size: 123456, digest: 'sha256:1234567890', details: { format: 'gguf', family: 'qwen', parameter_size: '1B', quantization_level: 'Q4' } }]
        : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models }) })
    }
    if (path.endsWith('/ps')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[]}' })
    }
    if (path.endsWith('/show')) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not Found"}' })
    }
    if (path.endsWith('/delete') && request.method() === 'DELETE') {
      deleteRequests += 1
      modelAvailable = false
      return route.fulfill({ status: 200, body: '' })
    }
    if (path.endsWith('/chat')) {
      const body = [
        JSON.stringify({ message: { role: 'assistant', content: '## 重点\n**离线运行**，并突出 `关键内容`。' }, done: false }),
        JSON.stringify({ done: true, done_reason: 'length', eval_count: 2048 }),
        '',
      ].join('\n')
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.getByPlaceholder(/输入问题/).fill('请测试回答')
  await page.getByPlaceholder(/输入问题/).press('Enter')
  await page.getByText('这次回答已经到达长度上限。').waitFor()

  if (!(await page.locator('.formatted-answer h3').count())) throw new Error('answer heading was not highlighted')
  if (!(await page.locator('.formatted-answer strong').count())) throw new Error('answer emphasis was not highlighted')
  if (!(await page.locator('.formatted-answer code').count())) throw new Error('inline code was not highlighted')

  await page.getByRole('button', { name: '复制回答' }).click()
  await page.getByText('内容已复制', { exact: true }).waitFor()

  const attachmentInput = page.locator('input[type="file"]').first()
  await attachmentInput.setInputFiles({ name: '旧文件.doc', mimeType: 'application/msword', buffer: Buffer.from('legacy') })
  await page.getByText(/这是旧版 Word 文件/).waitFor()

  await page.getByLabel('打开设置').click()
  await page.getByText('显示回答思路', { exact: true }).waitFor()
  await page.getByText('刷新网页文件', { exact: true }).waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/private/tmp/shotai-settings-improvements.png', fullPage: false })
  await page.keyboard.press('Escape')

  await page.getByLabel('打开设置').click()
  await page.getByRole('button', { name: /模型管理/ }).click()
  await page.getByLabel('删除 local-test:latest').click()
  await page.getByRole('button', { name: '确认删除' }).click()
  await page.getByText('模型已删除', { exact: true }).waitFor()

  const logoLoaded = await page.locator('.brand-mark img').evaluate((image) => image.complete && image.naturalWidth > 0)
  if (!logoLoaded) throw new Error('sidebar logo did not load')
  if (deleteRequests !== 1) throw new Error(`expected one delete request, got ${deleteRequests}`)

  console.log(JSON.stringify({
    detail404DegradedWithoutBlockingChat: true,
    olderModelListCompatible: true,
    insecureClipboardFallback: true,
    legacyWordGuidance: true,
    outputLimitDetected: true,
    answerHighlights: true,
    cleanupControlsVisible: true,
    modelDeleteWorks: true,
    sidebarLogoLoaded: true,
  }, null, 2))
} finally {
  await browser.close()
}
