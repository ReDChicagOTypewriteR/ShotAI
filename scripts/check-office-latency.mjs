import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import * as XLSX from 'xlsx'
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const queue = [], requests = [], events = []
let truncateSummary = false, failThinking = false
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['项目', '金额'], ['会议', 100]]), '明细')
const bytes = [...XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })]
const action = (tool, args = {}) => ({ tool, arguments: args })
try {
  const page = await browser.newPage({ locale: 'zh-CN' })
  await page.route('**/shotai/**', route => {
    if (route.request().url().endsWith('/task-events')) events.push(route.request().postDataJSON())
    return route.fulfill({ json: {} })
  })
  await page.route('**/ollama/api/**', async route => {
    if (!route.request().url().endsWith('/chat')) return route.fulfill({ json: { models: [] } })
    const body = route.request().postDataJSON(); requests.push(body)
    const answer = message => route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message, done: true }) + '\n' })
    if (failThinking && body.think && body.tools) { failThinking = false; return route.fulfill({ status: 400, json: { error: 'failed to parse grammar' } }) }
    if (body.tools || body.format) {
      const next = queue.shift(); assert.ok(next, 'Unexpected extra model decision')
      return answer(body.tools ? { tool_calls: [{ function: { name: next.tool, arguments: next.arguments } }] } : { content: JSON.stringify(next) })
    }
    const summary = body.messages[0].content.startsWith('总结提供的资料片段')
    if (summary) {
      assert.equal(body.think, false)
      assert.ok(body.options.num_predict <= 768)
      if (truncateSummary) {
        truncateSummary = false
        return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message: { content: 'incomplete' }, done: true, done_reason: 'length' }) + '\n' })
      }
    }
    return answer({ content: summary ? '保留来源中的关键事实。' : '会议编号为 ORBIT-31。[依据1]' })
  })
  await page.goto(process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5196/')
  async function run(actions, settings = {}) {
    queue.push(...actions)
    return page.evaluate(async ({ settings, bytes }) => {
      const { runOfficeAgent } = await import('/src/services/officeAgent.ts')
      const text = settings.long ? 'ORBIT-31\n' + '这是需要保留的信息。'.repeat(800) : '会议编号为 ORBIT-31，会议在周一举行。'
      const previews = []
      const sources = settings.empty ? [] : settings.workbook
        ? [{ id: 's1', name: '明细.xlsx', load: async () => new File([new Uint8Array(bytes)], '明细.xlsx') }]
        : [{ id: 's1', name: '会议.txt', text, truncated: false, load: async () => undefined }]
      const result = await runOfficeAgent({ model: 'qwen-latency', capabilities: ['thinking', 'tools'], modelLimit: 32768, contextLength: 0,
        request: '分析这份资料', history: [], sources, reasoning: settings.reasoning || 'auto', signal: new AbortController().signal,
        onPreview: text => previews.push(text) })
      return { answer: result.answer, files: result.files.length, steps: result.steps, evidence: result.evidence.length, previews }
    }, { settings, bytes })
  }
  const before = requests.length
  const direct = await run([action('answer_document', { sourceId: 's1' })])
  assert.match(direct.answer, /ORBIT-31/)
  assert.equal(requests.length - before, 2, 'Short document analysis needs one decision and one answer')
  assert.equal(direct.evidence, 1)
  assert.ok(direct.previews.length)
  assert.equal(requests[before].think, false)
  assert.equal(requests[before + 1].think, false)
  assert.ok(requests[before].options.num_predict <= 1536)
  assert.ok(requests[before + 1].messages[0].content.includes('会议在周一举行'))
  const summaryStart = requests.length
  truncateSummary = true
  const summarized = await run([action('summarize_document', { sourceId: 's1' }), action('finish', { answer: '已分析全部片段。' })], { long: true })
  assert.ok(summarized.evidence >= 2)
  const summaries = requests.slice(summaryStart).filter(body => body.messages[0].content.startsWith('总结提供的资料片段'))
  assert.equal(summaries.length, summarized.evidence + 1, 'Only one bounded retry for a truncated summary')
  assert.ok(summaries.every(body => body.think === false && body.options.num_predict <= 768))
  const repeated = await run([action('read_sheet', { sourceId: 's1', sheet: '明细' }), action('read_sheet', { sheet: '明细', sourceId: 's1' }), action('finish', { answer: '已读取完整表格。' })], { workbook: true })
  assert.ok(repeated.steps.some(step => step.detail.includes('"reused":true')))
  const write = action('write_file', { kind: 'excel', name: '结果.xlsx', dataIds: ['data1'], evidenceIds: [] })
  const duplicate = await run([action('create_table', { columns: ['事项'], rows: [['会议']] }), write, write, action('finish', { answer: '已生成文件。' })], { empty: true })
  assert.equal(duplicate.files, 1, 'Repeated file writes must not create duplicate artifacts')
  await assert.rejects(run(Array.from({ length: 4 }, () => action('read_sheet', { sourceId: 's1', sheet: '明细' })), { workbook: true }), /反复请求相同操作/)
  queue.length = 0
  failThinking = true
  const forced = await run([action('answer_document', { sourceId: 's1' })], { reasoning: 'on' })
  assert.match(forced.answer, /ORBIT-31/)
  assert.ok(events.some(event => event.cached === true))
  console.log(JSON.stringify({ shortDocumentTwoCalls: true, progressiveDraft: true, conciseInternalSummary: true,
    boundedTruncationRetry: true, repeatedReadsReused: true, duplicateWritesReused: true, loopStopped: true, explicitThinkingGrammarRecovery: true, toolTelemetry: true }))
} finally { await browser.close() }
