import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'
import { readFile } from 'node:fs/promises'

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['产品', '金额'], ...Array.from({ length: 900 }, (_, i) => [`产品${i + 1}`, 1])]), '明细')
const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
let stage = 0, paused = false, grammarInjected = false
const toolRequests = []
const reply = (route, message) => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message, done: true }) + '\n' })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  page.setDefaultTimeout(15000)
  await page.route('**/shotai/**', route => route.fulfill({ json: {} }))
  await page.route('**/image-runtime/**', route => route.fulfill({ json: { available: false, serviceOnline: false } }))
  await page.route('**/image/v1/models', route => route.fulfill({ json: { data: [] } }))
  await page.route('**/ollama/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const details = { family: 'qwen3.5', parameter_size: '9B', quantization_level: 'Q4_K_M' }
    if (path.endsWith('/version')) return route.fulfill({ json: { version: '0.33.0-test' } })
    if (path.endsWith('/tags')) return route.fulfill({ json: { models: [{ name: 'qwen3.5-test', size: 1000, digest: 'test', details }] } })
    if (path.endsWith('/ps')) return route.fulfill({ json: { models: [] } })
    if (path.endsWith('/show')) return route.fulfill({ json: { details, capabilities: ['completion', 'thinking', 'tools'], model_info: { 'qwen3.5.context_length': 32768 } } })
    if (!path.endsWith('/chat')) return route.fulfill({ json: {} })
    const body = route.request().postDataJSON()
    if (body.messages[0]?.content.includes('任务调度器')) {
      stage = 0
      assert.ok(body.format?.properties?.action?.enum.includes('task'))
      return reply(route, { content: '{"action":"task"}' })
    }
    toolRequests.push(body)
    if (stage === 0 && body.think && !grammarInjected) {
      grammarInjected = true
      return route.fulfill({
        contentType: 'application/x-ndjson',
        body: [
          { message: { thinking: '正在分析资料。' }, done: false },
          { error: 'Failed to initialize samplers: failed to parse grammar', status: 400 },
        ].map(chunk => JSON.stringify(chunk) + '\n').join(''),
      })
    }
    const current = stage++
    if (paused) { await new Promise(resolve => setTimeout(resolve, 400)); return reply(route, { content: '已取消的迟到回答' }).catch(() => {}) }
    const catalog = JSON.parse(body.messages[0].content.split('\n').find(line => line.startsWith('来源目录：')).slice('来源目录：'.length))
    const source = catalog.find(source => source.name === '数据.xlsx')
    const calls = [
      ['read_sheet', { sourceId: source.id, sheet: '明细' }],
      ['aggregate_table', { dataId: 'data1', metrics: [{ column: '金额', operation: 'sum', name: '合计' }] }],
      ['write_file', { kind: 'word', name: '汇总报告.docx', blocks: [{ type: 'title', text: '汇总报告' }, { type: 'paragraph', text: '合计：{{data2:0:合计}}。' }], evidenceIds: ['依据1'] }],
      ['write_file', { kind: 'excel', name: '汇总表.xlsx', dataIds: ['data2'], evidenceIds: ['依据1'] }],
    ]
    if (current >= calls.length) return reply(route, { content: '总金额为900，报告和表格已生成。[依据1]' })
    return reply(route, { ...(body.think ? { thinking: '正在核验资料和计算结果。' } : {}), tool_calls: [{ function: { name: calls[current][0], arguments: calls[current][1] } }] })
  })
  await page.goto(process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5183/')
  await page.getByText('服务在线', { exact: true }).first().waitFor()
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({ name: '数据.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: bytes })
  await page.locator('.pending-document').filter({ hasText: '数据.xlsx' }).waitFor()
  await page.locator('.composer-textarea').fill('汇总金额，给我一份 Word 报告和 Excel 汇总表。')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByText('总金额为900，报告和表格已生成。[依据1]', { exact: true }).waitFor()
  assert.equal(await page.locator('.message-artifact-list .message-file-card').count(), 2)
  assert.equal(await page.locator('.reasoning-disclosure').count(), 0)
  assert.ok(toolRequests.length >= 5 && toolRequests.every(body => body.think === false))
  assert.deepEqual(toolRequests[1].tools, toolRequests[0].tools)
  await page.getByText('查看处理步骤与检查结果', { exact: true }).click()
  assert.ok(await page.getByText('文档内容回读一致', { exact: false }).isVisible())
  assert.match(await page.locator('.task-evidence').innerText(), /明细!A1:B901/)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: /汇总报告.docx/ }).click()
  const downloaded = await event
  const word = (await mammoth.extractRawText({ buffer: await readFile(await downloaded.path()) })).value
  assert.match(word, /合计：900/)
  assert.match(word, /参考来源/)
  await page.screenshot({ path: '/private/tmp/shotai-office-workflow.png' })

  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.locator('.parameter-row').filter({ has: page.getByText('模型推理', { exact: true }) }).locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: '关闭推理', exact: true }).click()
  await page.locator('.parameter-row').filter({ has: page.getByText('显示回答思路', { exact: true }) }).locator('.el-switch').click()
  await page.keyboard.press('Escape')
  const before = toolRequests.length
  await page.locator('.composer-textarea').fill('重新汇总，生成报告和表格。')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor()
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden' })
  assert.ok(toolRequests.slice(before).every(body => body.think === false))

  paused = true
  const artifacts = await page.locator('.message-artifact-list .message-file-card').count()
  await page.locator('.composer-textarea').fill('再执行一次汇总')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await page.getByRole('button', { name: '停止本次任务', exact: true }).click()
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden' })
  await new Promise(resolve => setTimeout(resolve, 500))
  assert.equal(await page.locator('.message-artifact-list .message-file-card').count(), artifacts)
  assert.equal(await page.getByText('已取消的迟到回答', { exact: true }).count(), 0)
  console.log(JSON.stringify({ chatIntegratedAgent: true, completeWorksheet: true, multiArtifactDownload: true, sourceLocations: true, validationVisible: true,
    reasoningIndependentFromDisplay: true, reasoningOffApplied: true, cancellationDoesNotPublish: true }))
} finally { await browser.close() }
