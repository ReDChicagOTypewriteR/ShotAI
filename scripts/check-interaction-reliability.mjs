import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { Document, Packer, Paragraph } from 'docx'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const url = process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5183'
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('验收编号 ORBIT-31，会议在周五下午三点举行。')] }] }))
const zip = await new JSZip().file('notes.txt', 'ordinary archive').generateAsync({ type: 'nodebuffer' })
let mode = 'invalid-route', planningAttempts = 0, directChats = 0, captured
const contexts = []
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const ndjson = (route, value) => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message: { role: 'assistant', content: typeof value === 'string' ? value : JSON.stringify(value) }, done: true }) + '\n' })

async function newPage(locale = 'zh-CN') {
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  contexts.push(context)
  const page = await context.newPage()
  await page.route('**/shotai/**', route => route.fulfill({ json: {} }))
  await page.route('**/image-runtime/**', route => route.fulfill({ json: { available: false, serviceOnline: false } }))
  await page.route('**/image/v1/models', route => route.fulfill({ json: { data: [] } }))
  await page.route('**/ollama/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const details = { format: 'gguf', family: 'qwen3.5', parameter_size: '9B', quantization_level: 'Q4_K_M' }
    if (path.endsWith('/version')) return route.fulfill({ json: { version: '0.33.0-test' } })
    if (path.endsWith('/tags')) return route.fulfill({ json: { models: [{ name: 'qwen3.5-test:latest', size: 1000, digest: 'test', details }] } })
    if (path.endsWith('/show')) return route.fulfill({ json: { details, capabilities: ['completion', 'thinking'], model_info: { 'qwen3.5.context_length': 32768 } } })
    if (path.endsWith('/ps')) return route.fulfill({ json: { models: [] } })
    if (!path.endsWith('/chat')) return route.fulfill({ json: {} })
    const payload = route.request().postDataJSON()
    const system = payload.messages.find(message => message.role === 'system')?.content || ''
    if (system.includes('任务调度器')) {
      if (mode === 'route-http') return route.fulfill({ status: 400, json: { error: 'format unsupported' } })
      if (mode === 'stop-route') { await delay(2500); return ndjson(route, { action: 'chat' }) }
      if (mode === 'plan-repair' || mode === 'plan-failure' || mode === 'stop-plan') return ndjson(route, { action: 'create', kind: 'word' })
      if (mode === 'clarify') return ndjson(route, { action: 'edit', kind: 'word', sourceId: 'missing-source' })
      return ndjson(route, '我不确定该返回什么')
    }
    if (system.includes('文件任务规划器')) {
      planningAttempts++
      if (mode === 'stop-plan') { await delay(2500); return ndjson(route, 'not-json') }
      if (mode === 'plan-failure' || planningAttempts === 1) return ndjson(route, '{"mode":')
      return ndjson(route, { mode: 'create', fileName: '验收报告.docx', summary: '已生成验收报告', blocks: [{ type: 'title', text: '验收报告' }, { type: 'paragraph', text: '验收编号 ORBIT-31' }] })
    }
    if (mode === 'plan-failure' && system.includes('写作者')) {
      return route.fulfill({ status: 503, json: { error: '模拟正文生成服务失败' } })
    }
    directChats++
    captured = payload
    return ndjson(route, `正常回答 ${directChats}：已读取资料，可以继续提问。`)
  })
  await page.goto(url)
  await page.getByRole('combobox', { name: locale === 'en-US' ? 'Select current model' : '选择当前模型' }).waitFor()
  await page.waitForFunction(() => !document.body.innerText.includes('正在查找可用模型'))
  return page
}
const input = page => page.locator('input[type="file"][accept*=".txt"]')
const submit = async (page, text) => { await page.locator('.composer-textarea').fill(text); await page.locator('.composer-textarea').press('Enter') }
const complete = async page => { await page.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden', timeout: 15000 }) }

try {
  const page = await newPage()
  // Real DOCX bytes, misleading MIME and filename. Also verify the shared reader.
  await input(page).setInputFiles({ name: '会议资料.docx', mimeType: 'application/zip', buffer: docx })
  await page.locator('.pending-document').filter({ hasText: '会议资料.docx' }).waitFor()
  assert.ok((await page.locator('.pending-document').innerText()).includes('DOCX'))
  await submit(page, '请分析附件中的会议安排')
  await page.getByText('正常回答 1：已读取资料，可以继续提问。', { exact: true }).waitFor()
  assert.ok(captured.messages.some(message => message.content.includes('ORBIT-31')))
  assert.ok(!(await page.locator('body').innerText()).includes('模型未能判断'))
  await input(page).setInputFiles({ name: '错误扩展名.zip', mimeType: 'application/zip', buffer: docx })
  await page.locator('.pending-document').filter({ hasText: '错误扩展名.docx' }).waitFor()
  await input(page).setInputFiles({ name: '普通压缩包.zip', mimeType: 'application/zip', buffer: zip })
  await page.locator('.attachment-failure').filter({ hasText: '这是普通 ZIP 压缩包' }).waitFor()
  await input(page).setInputFiles({ name: '损坏.docx', mimeType: 'application/zip', buffer: Buffer.from('PK-corrupt') })
  await page.locator('.attachment-failure').filter({ hasText: '文档压缩结构已损坏' }).waitFor()
  await input(page).setInputFiles({ name: '加密.docx', mimeType: 'application/octet-stream', buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) })
  await page.locator('.attachment-failure').filter({ hasText: '文件可能已加密' }).waitFor()
  await page.locator('.attachment-failure').filter({ hasText: '损坏.docx' }).getByRole('button', { name: '重试', exact: true }).click()
  await page.locator('.attachment-failure').filter({ hasText: '损坏.docx' }).waitFor()
  assert.equal(await page.locator('.attachment-failure').filter({ hasText: '损坏.docx' }).count(), 1)
  await page.screenshot({ path: '/private/tmp/shotai-upload-feedback.png' })
  const recognized = await page.evaluate(async bytes => {
    const { recognizeDocumentFile } = await import('/src/services/fileRecognition.ts')
    const { extractKnowledgeText } = await import('/src/services/knowledge.ts')
    const file = new File([new Uint8Array(bytes)], '真实文档.ZIP', { type: 'application/octet-stream' })
    const resolved = await recognizeDocumentFile(file)
    return { name: resolved.name, text: await extractKnowledgeText(file), mime: resolved.type }
  }, [...docx])
  assert.equal(recognized.name, '真实文档.docx')
  assert.match(recognized.text, /ORBIT-31/)
  assert.match(recognized.mime, /wordprocessingml/)
  await page.route('**/ollama/api/embed', async route => {
    await delay(300)
    await route.fulfill({ json: { embeddings: [[1, 0]] } })
  })
  const cancelledEmbedding = await page.evaluate(async () => {
    const { embedWithOllama } = await import('/src/services/ollama.ts')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 50)
    try {
      await embedWithOllama('embedding-test', '参考资料', controller.signal)
      return 'completed'
    } catch (error) {
      return error.name
    } finally { clearTimeout(timer) }
  })
  assert.equal(cancelledEmbedding, 'AbortError', 'Stopping knowledge retrieval must abort its embedding request')
  const pdf = await PDFDocument.create()
  const pdfPage = pdf.addPage()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  pdfPage.drawText('ORBIT-31 PDF reference', { x: 40, y: 700, font, size: 16 })
  await input(page).setInputFiles({ name: '来源.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await page.locator('.pending-document').filter({ hasText: '来源.pdf' }).waitFor({ timeout: 15000 }).catch(async error => { console.error(await page.locator('.composer-shell').innerText()); throw error })

  mode = 'route-http'
  const fallback = await newPage()
  await submit(fallback, '你好，请正常回答')
  await fallback.getByText('正常回答 2：已读取资料，可以继续提问。', { exact: true }).waitFor()

  mode = 'clarify'
  await submit(fallback, '把那个文档修改一下')
  await fallback.getByText('你希望使用哪份文件？请指定文件名称，或重新上传原文件。', { exact: true }).waitFor()

  mode = 'plan-repair'
  planningAttempts = 0
  const planner = await newPage()
  await submit(planner, '给我生成一份 Word 验收报告')
  const artifact = planner.getByRole('button', { name: /验收报告.docx/ })
  await artifact.waitFor({ timeout: 15000 })
  assert.equal(planningAttempts, 2)
  const downloadEvent = planner.waitForEvent('download')
  await artifact.click()
  const download = await downloadEvent
  const result = await mammoth.extractRawText({ buffer: await readFile(await download.path()) })
  assert.match(result.value, /ORBIT-31/)
  await planner.screenshot({ path: '/private/tmp/shotai-interaction-dark.png' })

  mode = 'plan-failure'
  await submit(planner, '给我生成另一份 Word')
  await planner.locator('.task-error').waitFor()
  assert.ok((await planner.locator('.message-content.is-user').last().innerText()).includes('另一份'))
  mode = 'plan-repair'; planningAttempts = 1
  await planner.getByRole('button', { name: '重试本次请求', exact: true }).click()
  await planner.locator('.task-error').waitFor({ state: 'hidden' })
  await complete(planner)

  mode = 'stop-route'
  const stopped = await newPage()
  await submit(stopped, '你好')
  await stopped.locator('.task-status').waitFor()
  await stopped.screenshot({ path: '/private/tmp/shotai-task-status.png' })
  await stopped.getByRole('button', { name: '停止本次任务', exact: true }).click()
  await complete(stopped)
  const previousChats = directChats
  await delay(2700)
  assert.equal(directChats, previousChats, 'A cancelled router must not start a chat request')
  mode = 'invalid-route'
  await submit(stopped, '继续正常提问')
  await stopped.getByText(`正常回答 ${previousChats + 1}：已读取资料，可以继续提问。`, { exact: true }).waitFor()

  mode = 'stop-plan'
  await submit(stopped, '生成 Word 文档')
  await stopped.getByText('正在规划文件内容', { exact: true }).first().waitFor()
  await stopped.getByRole('button', { name: '停止生成', exact: true }).click()
  await complete(stopped)
  await delay(2700)
  assert.equal(await stopped.locator('.message-artifact-list').count(), 0)

  for (const width of [1440, 768, 375]) {
    await planner.setViewportSize({ width, height: 900 })
    await planner.emulateMedia({ reducedMotion: 'reduce' })
    assert.ok(await planner.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow at ${width}`)
    const composer = await planner.locator('.composer-input').boundingBox()
    assert.ok(composer && composer.x >= 0 && composer.x + composer.width <= width + 1)
  }
  await planner.screenshot({ path: '/private/tmp/shotai-interaction-mobile.png' })
  await planner.setViewportSize({ width: 1440, height: 960 })
  await planner.evaluate(() => { const app = document.querySelector('.shot-app'); app.classList.add('theme-light'); app.classList.remove('dark'); document.documentElement.classList.add('theme-light') })
  await planner.screenshot({ path: '/private/tmp/shotai-interaction-light.png' })
  console.log(JSON.stringify({ docxZipMime: true, renamedZip: true, sharedReader: true, damagedAndEncryptedFiles: true, inlineRetry: true, invalidRouteFallback: true, unsupportedFormatFallback: true, clarification: true, planRepair: true, fileDownloadVerified: true, failureRetry: true, cancelRouting: true, cancelPlanning: true, cancelEmbedding: true, responsive: true }))
} finally {
  await Promise.all(contexts.map(context => context.close()))
  await browser.close()
}
