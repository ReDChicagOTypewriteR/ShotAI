import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  await page.route('**/shotai/system', (route) => route.fulfill({ json: { canManage: true, isHost: true, version: '1.2.0' } }))
  await page.route('**/image-runtime/status', (route) => route.fulfill({ json: { available: false, modelFiles: [] } }))
  await page.route('**/ollama/api/**', (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/tags') ? { models: [{ name: 'qwen3.5:9b', model: 'qwen3.5:9b', size: 6e9, digest: 'a'.repeat(64), details: { family: 'qwen3', parameter_size: '9B', quantization_level: 'Q4_K_M' } }] }
      : path.endsWith('/show') ? { capabilities: ['completion'], details: { family: 'qwen3' } }
      : path.endsWith('/version') ? { version: 'test' } : { models: [] } })
  })
  let requests = 0
  await page.route('**/shotai/models/health', (route) => {
    requests++
    const body = route.request().postDataJSON()
    assert.equal(body.model, 'qwen3.5:9b')
    assert.ok(route.request().headers()['x-shotai-client-id'])
    return route.fulfill({ json: body.probe ? { status: 'warning', loading: { loaded: true, backend: 'cpu', vramBytes: 0 }, warnings: ['当前为 CPU 加载'] }
      : { status: 'warning', loading: { loaded: false, backend: 'not-loaded' }, warnings: ['模型未驻留'] } })
  })
  await page.goto(process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5173/#workbench', { waitUntil: 'networkidle' })
  await page.getByLabel('打开模型管理').click()
  const panel = page.getByLabel('模型体检', { exact: true })
  await panel.locator('.el-select').click()
  await page.getByRole('option', { name: 'qwen3.5:9b' }).click()
  await panel.getByRole('button', { name: '检测加载', exact: true }).click()
  await panel.getByText('模型未驻留', { exact: true }).waitFor()
  await panel.getByRole('button', { name: '运行体检', exact: true }).click()
  await panel.getByText('当前为 CPU 加载', { exact: true }).waitFor()
  assert.equal(requests, 2)
  await page.screenshot({ path: '/private/tmp/shotai-model-health.png' })
  console.log(JSON.stringify({ modelHealthUI: true, installedNotLoaded: true, cpuWarningVisible: true, clientIdentity: true }))
} finally { await browser.close() }
