import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import * as XLSX from 'xlsx'
import { Document, Paragraph, TextRun, Packer } from 'docx'

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['分类', '金额'], ...Array.from({ length: 1000 }, (_, i) => [i % 2 ? 'B' : 'A', i % 2 ? .2 : .1])]), '明细')
const excel = [...XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })]
const word = [...await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun('原始'), new TextRun('内容')] }), new Paragraph('保留信息')] }] }))]
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const actions = [], seen = []
let native = true, unsupported = false, slow = false, summaries = 0
const action = (tool, args = {}) => ({ tool, arguments: args })
try {
  const page = await browser.newPage({ locale: 'zh-CN' })
  page.setDefaultTimeout(15000)
  await page.route('**/ollama/api/chat', async route => {
    const body = route.request().postDataJSON()
    seen.push(body)
    if (body.messages[0]?.content.includes('总结提供的资料片段')) {
      summaries++
      return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message: { content: `片段摘要${summaries}` }, done: true }) + '\n' })
    }
    if (unsupported && body.tools) return route.fulfill({ status: 400, json: { error: 'tools unsupported' } })
    const next = actions.shift()
    assert.ok(next, 'Unexpected extra model request')
    if (slow) await new Promise(resolve => setTimeout(resolve, 300))
    return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message: native && body.tools
      ? { tool_calls: [{ function: { name: next.tool, arguments: next.arguments } }] }
      : { content: JSON.stringify(next) }, done: true }) + '\n' })
  })
  await page.goto(process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5183/')
  await page.evaluate(() => { window.agentFixtures = {} })
  async function run(sequence, settings = {}) {
    actions.push(...sequence)
    return page.evaluate(async ({ excel, word, settings }) => {
      const { runOfficeAgent } = await import('/src/services/officeAgent.ts')
      const { extractKnowledgeText } = await import('/src/services/knowledge.ts')
      const { TaskWorkspace } = await import('/src/services/taskWorkspace.ts')
      const controller = new AbortController()
      if (settings.cancel) setTimeout(() => controller.abort(), 30)
      const text = settings.longDocument ? Array.from({ length: 30 }, (_, i) => `第${i}段\n${'这是需要完整覆盖的报告内容。'.repeat(100)}\n\n`).join('') : '源文件说明'
      const sources = settings.empty ? [] : settings.longDocument
        ? [{ id: 'd1', name: '长文档.txt', text, load: async () => undefined }]
        : [{ id: 's1', name: '明细.xlsx', load: async () => new File([new Uint8Array(excel)], '明细.xlsx') },
          { id: 'w1', name: '说明.docx', load: async () => new File([new Uint8Array(word)], '说明.docx') }]
      const result = await runOfficeAgent({ model: 'qwen3.5-test', modelLimit: 32768, contextLength: 0, capabilities: settings.json ? ['thinking'] : ['tools', 'thinking'], reasoning: settings.reasoning || 'auto',
        request: '核对资料，计算合计并生成结果', history: [], sources, signal: controller.signal, maxSteps: settings.maxSteps, maxRequests: settings.maxRequests,
        timeoutMs: settings.timeoutMs || 30000 })
      const fileResults = []
      for (const file of result.files) {
        const output = new File([file.blob], file.fileName)
        if (file.fileName.endsWith('.docx')) fileResults.push({ name: file.fileName, text: await extractKnowledgeText(output), checks: file.checks })
        else if (file.fileName.endsWith('.xlsx')) {
          const ws = new TaskWorkspace([{ id: 'out', name: output.name, load: async () => output }], controller.signal)
          await ws.readSheet('out', '结果1')
          fileResults.push({ name: file.fileName, rows: ws.table('data1').rows, checks: file.checks })
        } else if (file.fileName.endsWith('.pdf')) fileResults.push({ name: file.fileName, checks: file.checks, bytes: file.blob.size })
      }
      return { answer: result.answer, files: fileResults, evidence: result.evidence, steps: result.steps, warnings: result.warnings }
    }, { excel, word, settings })
  }

  const result = await run([
    action('list_sources'), action('read_sheet', { sourceId: 's1', sheet: '明细' }),
    action('aggregate_table', { dataId: 'data1', metrics: [{ column: '金额', operation: 'sum', name: '合计' }, { operation: 'count', name: '行数' }] }),
    action('write_file', { kind: 'excel', name: '汇总.xlsx', dataIds: ['data2'], evidenceIds: ['依据1'] }),
    action('write_file', { kind: 'word', name: '报告.docx', blocks: [{ type: 'title', text: '汇总报告' }, { type: 'paragraph', text: '金额合计：{{data2:0:合计}}，数据行数：{{data2:0:行数}}。' }], evidenceIds: ['依据1'], requiredHeadings: ['汇总报告'] }),
    action('finish', { answer: '合计{{data2:0:合计}}，共{{data2:0:行数}}行。', evidenceIds: ['依据1'] }),
  ])
  assert.match(result.answer, /150.*1000/)
  assert.equal(result.files.length, 2)
  assert.deepEqual(result.files[0].rows, [[150, 1000]])
  assert.match(result.files[1].text, /金额合计：150/)
  assert.match(result.files[1].text, /参考来源/)
  assert.match(result.evidence[0].location, /A1:B1001/)
  assert.equal(seen[0].think, false)
  assert.ok(seen.slice(1).every(body => body.think === false))
  assert.ok(seen[0].tools.length > 10)
  assert.doesNotMatch(JSON.stringify(seen[0].tools), /"(?:maxLength|maxItems|minLength|minItems)"/, 'Runtime grammar must not expand collection limits')
  const generated = await run([
    action('create_table', { columns: ['事项', '金额'], rows: [['会议', 100], ['培训', 200]] }),
    action('write_file', { kind: 'excel', name: '新建表.xlsx', dataIds: ['data1'], evidenceIds: [] }),
    action('aggregate_table', { dataId: 'data1', metrics: [{ column: '金额', operation: 'sum', name: '合计' }] }),
    action('write_file', { kind: 'word', name: '预算报告.docx', blocks: [{ type: 'paragraph', text: '预算{{data2:0:合计}}' }], evidenceIds: [] }),
    action('finish', { answer: '已生成表格和报告。' }),
  ], { empty: true })
  assert.equal(generated.files.length, 2)
  assert.match(generated.files[1].text, /预算300/)

  const repaired = await run([
    action('read_sheet', { sourceId: 's1', sheet: '明细' }),
    action('aggregate_table', { dataId: 'data1', metrics: [{ column: '不存在的列', operation: 'sum', name: '合计' }] }),
    action('aggregate_table', { dataId: 'data1', metrics: [{ column: '金额', operation: 'sum', name: '合计' }] }),
    action('write_file', { kind: 'word', name: '错误.docx', blocks: [{ type: 'paragraph', text: '合计999' }], claims: [{ dataId: 'data2', row: 0, column: '合计', value: 999 }], evidenceIds: ['依据1'] }),
    action('write_file', { kind: 'word', name: '修正.docx', blocks: [{ type: 'paragraph', text: '合计{{data2:0:合计}}' }], evidenceIds: ['依据1'] }),
    action('finish', { answer: '合计{{data2:0:合计}}。' }),
  ])
  assert.equal(repaired.steps.filter(step => step.status === 'failed').length, 2)
  assert.deepEqual(repaired.files.map(file => file.name), ['修正.docx'])
  assert.ok(seen.some(body => body.messages.some(message => message.role === 'tool' && message.content.includes('数字与计算结果不一致'))))

  const localWord = await run([action('read_document', { sourceId: 'w1' }),
    action('replace_word', { sourceId: 'w1', name: '局部修改.docx', replacements: [{ find: '原始内容', replace: '修改后内容' }] }), action('finish', { answer: '已完成局部修改。' })])
  assert.match(localWord.files[0].text, /修改后内容/)
  assert.match(localWord.files[0].text, /保留信息/)
  assert.doesNotMatch(localWord.files[0].text, /原始内容/)

  // Repeated requests retain the same browser's compatibility state. Model
  // answers are controlled; generated files and local validation are real.
  for (const kind of ['excel', 'word', 'pdf']) {
    for (let round = 0; round < 10; round++) {
      const start = seen.length
      const sequence = kind === 'excel'
        ? [action('create_table', { columns: ['项目', '金额'], rows: [['会议', round]] }),
          action('write_file', { kind, name: '连续生成.xlsx', dataIds: ['data1'], evidenceIds: [] })]
        : [action('write_file', { kind, name: kind === 'word' ? '连续生成.docx' : '连续生成.pdf',
          blocks: [{ type: 'paragraph', text: '连续生成内容' }], evidenceIds: [] })]
      const output = await run([...sequence, action('finish', { answer: '文件已经生成。' })], { empty: true, reasoning: round % 2 ? 'off' : 'auto' })
      assert.equal(output.files.length, 1)
      assert.ok(output.files[0].checks.length)
      assert.equal(seen[start].think, false)
    }
  }
  console.log(JSON.stringify({ consecutiveOfficeGeneration: { excel: 10, word: 10, pdf: 10 }, autoAndOffReasoning: true, realFileValidation: true }))

  native = false; unsupported = true
  const fallbackStart = seen.length
  const fallback = await run([action('read_document', { sourceId: 'w1' }), action('finish', { answer: '读取完成。' })])
  assert.equal(fallback.evidence.length, 1)
  assert.ok(seen.some(body => body.format?.oneOf))
  assert.ok(seen.slice(fallbackStart + 1).every(body => body.think === false))
  unsupported = false

  const completeSummary = await run([action('summarize_document', { sourceId: 'd1' }), action('finish', { answer: '已覆盖全部片段。' })], { longDocument: true, json: true, maxRequests: 32 })
  assert.ok(summaries > 5)
  assert.equal(completeSummary.evidence.length, summaries)
  assert.equal(completeSummary.warnings.length, 0)
  await assert.rejects(run([action('summarize_document', { sourceId: 'd1' }), action('summarize_document', { sourceId: 'd1' }), action('summarize_document', { sourceId: 'd1' })], { longDocument: true, json: true, maxRequests: 3 }))
  actions.length = 0

  slow = true
  await assert.rejects(run([action('list_sources')], { json: true, cancel: true }))
  await new Promise(resolve => setTimeout(resolve, 350))
  actions.length = 0; slow = false
  await assert.rejects(run([action('list_sources')], { json: true, maxSteps: 1 }))
  actions.length = 0

  const numerical = await page.evaluate(async () => {
    const t = await import('/src/services/tabularTools.ts')
    const table = { columns: ['产品', '金额'], rows: [['A', .1], ['B', .2], ['A', .1]], origins: ['依据1'], warnings: [] }
    const filtered = t.filterTable(table, [{ column: '金额', operator: 'gt', value: .15 }])
    const grouped = t.aggregateTable(table, ['产品'], [{ column: '金额', operation: 'sum', name: '合计' }])
    const unique = t.deduplicateTable(table, ['产品', '金额'])
    const left = { ...table, rows: [['A', 100], ['B', 200]] }, right = { ...table, rows: [['A', 90], ['B', 250], ['C', 1]] }
    const compared = t.compareTables(left, right, '产品', '金额')
    const joined = t.joinTables(left, right, '产品', '产品', 'full')
    let duplicatesRejected = false
    try { t.joinTables(left, table, '产品', '产品') } catch { duplicatesRejected = true }
    const { TaskWorkspace } = await import('/src/services/taskWorkspace.ts')
    const text = '开头\n' + '前段内容。'.repeat(5000) + '\n中间关键标记：ORBIT-MIDDLE\n' + '后段内容。'.repeat(5000)
    const ws = new TaskWorkspace([{ id: 'long', name: '长文.txt', text, load: async () => undefined }], new AbortController().signal)
    const match = await ws.searchDocument('long', 'ORBIT-MIDDLE')
    return { sum: t.preciseSum([.1, .2]), filtered, grouped, unique, compared, joined, duplicatesRejected, match }
  })
  assert.equal(numerical.sum, .3)
  assert.equal(numerical.filtered.rows.length, 1)
  assert.equal(numerical.unique.rows.length, 2)
  assert.deepEqual(numerical.grouped.rows, [['A', .2], ['B', .2]])
  assert.deepEqual(numerical.compared.rows.map(row => row[3]), [-10, 50, null])
  assert.equal(numerical.joined.rows.length, 3)
  assert.ok(numerical.duplicatesRejected)
  assert.ok(numerical.match.results.some(item => item.text.includes('ORBIT-MIDDLE') && item.index > 1))
  const contextAndChecks = await page.evaluate(async ({ excel }) => {
    const { fitTaskHistory, taskBudget, shouldThink } = await import('/src/services/taskContext.ts')
    const { executeExcelSkillPlan, parseExcelSkillPlan } = await import('/src/services/excelSkill.ts')
    const { validateExcelFile } = await import('/src/services/fileValidation.ts')
    const { validateTool, runtimeSchema, officeFilePlanSchema } = await import('/src/services/taskTools.ts')
    const { parseDocumentSkillPlan } = await import('/src/services/documentSkill.ts')
    const original = new File([new Uint8Array(excel)], '原始.xlsx')
    const plan = parseExcelSkillPlan(JSON.stringify({ mode: 'edit', operations: [
      { type: 'set_cell', sheet: '明细', cell: 'B901', value: 5 },
      { type: 'set_cell', sheet: '明细', cell: 'B901', value: 6 },
      { type: 'set_range', sheet: '明细', startCell: 'A1000', values: [['保留', null]] },
      { type: 'append_rows', sheet: '明细', rows: [['新增', 7]] },
      { type: 'rename_sheet', sheet: '明细', newName: '更新' },
      { type: 'add_sheet', sheet: '备注', rows: [['说明'], ['测试']] },
    ] }), 'edit')
    const output = await executeExcelSkillPlan(plan, original)
    const checks = await validateExcelFile(output, plan, original)
    let corruptionRejected = false
    const corrupt = await executeExcelSkillPlan({ mode: 'edit', operations: [{ type: 'set_cell', sheet: '明细', cell: 'B2', value: 999 }] }, original)
    try { await validateExcelFile(corrupt, { mode: 'edit', operations: [{ type: 'set_cell', sheet: '明细', cell: 'B901', value: 5 }] }, original) } catch { corruptionRejected = true }
    let schemaRejected = false
    try { validateTool('read_sheet', { sourceId: 's1', sheet: '明细', toString: 'injected' }) } catch { schemaRejected = true }
    let oversizedToolRejected = false, oversizedDocumentRejected = false
    try { validateTool('write_file', { kind: 'word', name: 'test', evidenceIds: [], blocks: [{ type: 'paragraph', text: 'x'.repeat(16001) }] }) } catch { oversizedToolRejected = true }
    try { parseDocumentSkillPlan(JSON.stringify({ mode: 'create', blocks: [{ type: 'paragraph', text: 'x'.repeat(16001) }] }), 'create') } catch { oversizedDocumentRejected = true }
    const runtimePlan = runtimeSchema(officeFilePlanSchema('word', 'create'))
    const history = [{ role: 'system', content: '规则' }, { role: 'user', content: '保持原表头，不要修改产品名称。' },
      { role: 'assistant', content: '不重要的旧回答'.repeat(2000), thinking: '不应回传的推理内容' }, { role: 'user', content: '现在计算金额合计。' }]
    const fitted = fitTaskHistory(history, 2000)
    return { checks, corruptionRejected, schemaRejected, oversizedToolRejected, oversizedDocumentRejected, runtimePlan,
      stableContexts: [taskBudget(32768, 0, 100, false).context, taskBudget(32768, 0, 10000, true).context, taskBudget(32768, 0, 200, true).context],
      retained: JSON.stringify(fitted), capped: taskBudget(4096, 32768, 20000, true),
      autoThinking: shouldThink('auto', true, true), fastChat: shouldThink('auto', true, false), off: shouldThink('off', true, true) }
  }, { excel })
  assert.ok(contextAndChecks.corruptionRejected)
  assert.ok(contextAndChecks.schemaRejected)
  assert.ok(contextAndChecks.oversizedToolRejected)
  assert.ok(contextAndChecks.oversizedDocumentRejected)
  assert.deepEqual(contextAndChecks.stableContexts, [32768, 32768, 32768])
  assert.doesNotMatch(JSON.stringify(contextAndChecks.runtimePlan), /"(?:maxLength|maxItems|minLength|minItems)"/)
  assert.match(contextAndChecks.retained, /保持原表头/)
  assert.doesNotMatch(contextAndChecks.retained, /不应回传/)
  assert.equal(contextAndChecks.capped.context, 4096)
  assert.equal(contextAndChecks.autoThinking, true)
  assert.equal(contextAndChecks.fastChat, false)
  assert.equal(contextAndChecks.off, false)
  console.log(JSON.stringify({ nativeTools: true, structuredFallback: true, full1000Rows: true, preciseDecimal: true, multiFileDelivery: true, numericClaimsChecked: true, repairLoop: true, wordLocalEdits: true, fullDocumentSummary: true, middleSectionSearch: true, sourceLocations: true, cancellation: true, budgets: true, filterGroupDedupeJoinCompare: true }))
} finally { await browser.close() }
