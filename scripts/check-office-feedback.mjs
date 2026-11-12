import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
let configured = { mode: 'single', parallelPerInstance: 2 }, failSave = false
const active = { ...configured }, saves = []
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(15000)
  await page.addInitScript(() => {
    const original = window.fetch.bind(window)
    window.holdAnalysis = true
    window.fetch = async (input, init) => {
      let body
      try { body = JSON.parse(init?.body) } catch { /* Other requests */ }
      if (String(input).endsWith('/ollama/api/chat') && body?.messages?.[0]?.content?.startsWith('依据下面完整覆盖')) {
        const encoder = new TextEncoder(), timers = []
        return new Response(new ReadableStream({ start(controller) {
          const write = value => controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'))
          write({ message: { content: '会议编号 ORBIT-31，' }, done: false })
          timers.push(setTimeout(() => {
            write({ message: { content: '原文说明会议在周一举行。[依据1]' }, done: false })
            write({ done: true }); controller.close()
          }, window.holdAnalysis ? 30000 : 500))
          init?.signal?.addEventListener('abort', () => { timers.forEach(clearTimeout); controller.error(new DOMException('Aborted', 'AbortError')) }, { once: true })
        } }), { headers: { 'Content-Type': 'application/x-ndjson' } })
      }
      return original(input, init)
    }
  })
  await page.route('**/shotai/**', async route => {
    const url = new URL(route.request().url()).pathname
    if (url === '/shotai/system') return route.fulfill({ json: { version: '1.4.0', canManage: true, isHost: true, platform: 'linux' } })
    if (url === '/shotai/runtime-settings') {
      if (route.request().method() === 'POST') {
        saves.push(route.request().postDataJSON())
        if (failSave) return route.fulfill({ status: 500, json: { error: '运行设置保存或读取失败，原配置保持不变' } })
        configured = route.request().postDataJSON()
      }
      return route.fulfill({ json: { configured, active, gpuCount: 2, supported: true, restartRequired: configured.mode !== active.mode || configured.parallelPerInstance !== active.parallelPerInstance } })
    }
    return route.fulfill({ json: {} })
  })
  await page.route('**/image-runtime/**', route => route.fulfill({ json: {} }))
  await page.route('**/image/v1/models', route => route.fulfill({ json: { data: [] } }))
  await page.route('**/ollama/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const details = { family: 'qwen3.5', parameter_size: '27B', quantization_level: 'Q4_K_M' }
    if (path.endsWith('/version')) return route.fulfill({ json: { version: '0.40.16' } })
    if (path.endsWith('/tags')) return route.fulfill({ json: { models: [{ name: 'qwen-feedback:latest', details, digest: 'feedback', size: 1000 }] } })
    if (path.endsWith('/ps')) return route.fulfill({ json: { models: [] } })
    if (path.endsWith('/show')) return route.fulfill({ json: { details, capabilities: ['completion', 'thinking', 'tools'], model_info: { 'qwen3.5.context_length': 32768 } } })
    if (path.endsWith('/chat')) {
      const body = route.request().postDataJSON()
      if (body.messages[0].content.includes('任务调度器')) return route.fulfill({ json: { message: { content: '{"action":"task"}' }, done: true } })
      const catalog = JSON.parse(body.messages[0].content.split('\n').find(line => line.startsWith('来源目录：')).slice('来源目录：'.length))
      return route.fulfill({ json: { message: { tool_calls: [{ function: { name: 'answer_document', arguments: { sourceId: catalog[0].id } } }] }, done: true } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto(process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5196/')
  await page.getByText('服务在线', { exact: true }).first().waitFor()
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({ name: '会议.txt', mimeType: 'text/plain', buffer: Buffer.from('会议编号 ORBIT-31，会议在周一举行。') })
  await page.locator('.pending-document').filter({ hasText: '会议.txt' }).waitFor()
  const input = page.locator('.composer-textarea')
  await input.fill('请分析这份文档'); await input.press('Enter')
  await page.locator('.task-preview').filter({ hasText: 'ORBIT-31' }).waitFor().catch(async error => {
    console.error(await page.locator('.message-stage').innerText())
    throw error
  })
  assert.equal(await page.locator('.message-file-card.is-output').count(), 0)
  await page.getByRole('button', { name: '停止本次任务', exact: true }).click()
  await page.locator('.task-preview').waitFor({ state: 'hidden' })
  assert.doesNotMatch(await page.locator('.message-content.is-assistant').last().innerText(), /ORBIT-31/)
  await page.evaluate(() => { window.holdAnalysis = false })
  await input.fill('再次分析刚才的文档'); await input.press('Enter')
  await page.locator('.task-preview').waitFor()
  await page.locator('.message-content.is-assistant').last().filter({ hasText: '原文说明会议在周一举行' }).waitFor()
  await page.locator('.task-preview').waitFor({ state: 'hidden' })
  await page.getByLabel('打开设置', { exact: true }).click()
  await page.locator('#runtime-mode').waitFor()
  await page.locator('#runtime-mode').selectOption('per-gpu')
  assert.equal(await page.locator('#runtime-parallel').inputValue(), '1')
  await page.getByRole('button', { name: '保存运行设置', exact: true }).click()
  await page.getByText('设置已保存。从系统托盘完全退出并重启 ShotAI 后生效，当前任务不会被中断。', { exact: true }).waitFor()
  assert.deepEqual(saves[0], { mode: 'per-gpu', parallelPerInstance: 1 })
  await page.locator('#runtime-mode').selectOption('spread')
  failSave = true
  await page.getByRole('button', { name: '保存运行设置', exact: true }).click()
  await page.getByText('运行设置保存或读取失败，原配置保持不变', { exact: true }).waitFor()
  assert.equal(configured.mode, 'per-gpu')
  await page.screenshot({ path: '/private/tmp/shotai-runtime-settings.png' })
  console.log(JSON.stringify({ liveAnalysisPreview: true, cancelClearsDraft: true, laterRequestRecovers: true,
    gpuModeEntry: true, perGpuStartsAtOne: true, explicitRestartNotice: true, failedSavePreservesConfig: true }))
} finally { await browser.close() }
