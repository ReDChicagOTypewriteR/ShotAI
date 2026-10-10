import { chromium } from 'playwright-core'
import { Document, Packer, Paragraph } from 'docx'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

const appUrl = process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

function planForRequest(payload) {
  const system = payload?.messages?.find((message) => message.role === 'system')?.content || ''
  const user = payload?.messages?.findLast((message) => message.role === 'user')?.content || ''
  const editing = system.includes('当前是修改任务')
  const word = system.includes('Word 文件任务规划器')
  if (word && !editing) {
    if (user.includes('依据上传表格输出 Word 预算说明')) {
      if (!user.includes('会议') || !user.includes('300')) throw new Error('Excel reference data was not sent to the document planner')
      return {
        mode: 'create', fileName: '预算说明.docx', summary: '已依据表格生成预算说明',
        blocks: [{ type: 'title', text: '预算说明' }, { type: 'paragraph', text: '会议预算为300。' }],
      }
    }
    return {
      mode: 'create',
      fileName: '项目周报.docx',
      summary: '已生成项目周报',
      blocks: [
        { type: 'title', text: '项目周报' },
        { type: 'heading', level: 1, text: '本周进展' },
        { type: 'paragraph', text: 'Ubuntu 文档能力已经完成。' },
      ],
    }
  }
  if (word) {
    if (!user.includes('原始 Word 内容')) throw new Error('Word source text was not sent')
    return {
      mode: 'edit',
      fileName: '修改后的说明.docx',
      summary: '已修改 Word 内容',
      blocks: [
        { type: 'title', text: '原始说明' },
        { type: 'paragraph', text: '修改后的 Word 内容' },
      ],
    }
  }
  if (!editing) {
    return {
      mode: 'create',
      fileName: '工作清单.pdf',
      summary: '已生成工作清单 PDF',
      blocks: [
        { type: 'title', text: '工作清单' },
        { type: 'bullet', text: '检查模型状态' },
        { type: 'bullet', text: '完成离线测试' },
      ],
    }
  }
  if (!user.includes('Original PDF content')) throw new Error('PDF source text was not sent')
  return {
    mode: 'edit',
    fileName: '修改后的报告.pdf',
    summary: '已修改 PDF 内容',
    blocks: [
      { type: 'title', text: 'Updated report' },
      { type: 'paragraph', text: 'Updated PDF content' },
    ],
  }
}

async function downloadArtifact(page, namePattern) {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: namePattern }).click()
  const download = await event
  const path = await download.path()
  if (!path) throw new Error('download path unavailable')
  return readFile(path)
}

let routeCount = 0

try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/version')) {
      return route.fulfill({ contentType: 'application/json', body: '{"version":"0.33.0-doc-test"}' })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ models: [{
          name: 'qwen3.5-doc-test:latest', model: 'qwen3.5-doc-test:latest',
          modified_at: new Date().toISOString(), size: 8_000_000_000,
          digest: 'sha256:document-skill-test',
          details: { format: 'gguf', family: 'qwen3.5', families: ['qwen3.5'], parameter_size: '9B', quantization_level: 'Q4_K_M' },
        }] }),
      })
    }
    if (pathname.endsWith('/ps')) return route.fulfill({ contentType: 'application/json', body: '{"models":[]}' })
    if (pathname.endsWith('/show')) {
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        details: { format: 'gguf', family: 'qwen3.5', parameter_size: '9B', quantization_level: 'Q4_K_M' },
        capabilities: ['completion'], model_info: { 'qwen3.5.context_length': 32768 },
      }) })
    }
    if (pathname.endsWith('/chat')) {
      const payload = request.postDataJSON()
      const system = payload.messages.find((message) => message.role === 'system')?.content || ''
      if (system.includes('任务调度器')) {
        routeCount += 1
        const sources = JSON.parse(system.split('\n').at(-1))
        const kind = routeCount <= 2 || routeCount === 5 ? 'word' : 'pdf'
        const editing = routeCount === 2 || routeCount === 4
        const name = kind === 'word' ? '原始说明.docx' : '原始报告.pdf'
        const choice = editing
          ? { action: 'edit', kind, sourceId: sources.find((source) => source.name === name)?.id }
          : { action: 'create', kind, ...(routeCount === 5 ? { sourceId: sources.find((source) => source.name === '预算.xlsx')?.id } : {}) }
        return route.fulfill({
          contentType: 'application/x-ndjson',
          body: JSON.stringify({ message: { content: JSON.stringify(choice) }, done: true }) + '\n',
        })
      }
      const plan = planForRequest(payload)
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: `${JSON.stringify({ message: { role: 'assistant', content: JSON.stringify(plan) }, done: true })}\n`,
      })
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
  })

  await page.goto(`${appUrl}/#workbench`, { waitUntil: 'networkidle', timeout: 20_000 })
  await page.waitForFunction(() => Boolean(document.querySelector('.model-select')?.textContent?.trim()))
  const editor = page.locator('.composer-textarea')

  await page.getByLabel('添加文件或使用我的资料').click()
  if (await page.getByRole('menuitem', { name: /Skill/ }).count()) throw new Error('manual Skill entry remains')
  await page.keyboard.press('Escape')
  await editor.fill('生成一份 Word 项目周报')
  await editor.press('Enter')
  await page.getByText('已生成项目周报').waitFor({ timeout: 20_000 })
  const createdWord = await downloadArtifact(page, /项目周报\.docx/)
  const createdWordText = (await mammoth.extractRawText({ buffer: createdWord })).value
  if (!createdWordText.includes('Ubuntu 文档能力已经完成')) throw new Error('Word creation failed')

  const sourceWord = new Document({ sections: [{ children: [
    new Paragraph('原始 Word 内容'), new Paragraph('需要保留的信息'),
  ] }] })
  const sourceWordBuffer = await Packer.toBuffer(sourceWord)
  await page.locator('input[type="file"].visually-hidden-input').setInputFiles({
    name: '原始说明.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: sourceWordBuffer,
  })
  await editor.fill('把正文更新为修改后的 Word 内容')
  await page.getByRole('button', { name: '发送消息', exact: true }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.composer-action-button')?.disabled)
  await editor.press('Enter')
  await page.getByText('已修改 Word 内容').waitFor({ timeout: 20_000 })
  const editedWord = await downloadArtifact(page, /修改后的说明\.docx/)
  const editedWordText = (await mammoth.extractRawText({ buffer: editedWord })).value
  if (!editedWordText.includes('修改后的 Word 内容')) throw new Error('Word edit failed')



  await editor.fill('生成一份工作清单 PDF')
  await editor.press('Enter')
  await page.getByText('已生成工作清单 PDF').waitFor({ timeout: 20_000 })
  const createdPdf = await downloadArtifact(page, /工作清单\.pdf/)
  if ((await PDFDocument.load(createdPdf)).getPageCount() < 1) throw new Error('PDF creation failed')

  const sourcePdf = await PDFDocument.create()
  const sourcePage = sourcePdf.addPage([595, 842])
  const sourceFont = await sourcePdf.embedFont(StandardFonts.Helvetica)
  sourcePage.drawText('Original PDF content', { x: 60, y: 760, font: sourceFont, size: 16 })
  const sourcePdfBytes = await sourcePdf.save()
  await page.locator('input[type="file"].visually-hidden-input').setInputFiles({
    name: '原始报告.pdf', mimeType: 'application/pdf', buffer: Buffer.from(sourcePdfBytes),
  })
  await editor.fill('将报告内容更新为 Updated PDF content')
  await page.waitForFunction(() => !document.querySelector('.composer-action-button')?.disabled)
  await editor.press('Enter')
  await page.getByText('已修改 PDF 内容').waitFor({ timeout: 20_000 }).catch(async (error) => {
    console.error(await page.locator('.message-stage').innerText())
    throw error
  })
  const editedPdf = await downloadArtifact(page, /修改后的报告\.pdf/)
  if ((await PDFDocument.load(editedPdf)).getPageCount() < 1) throw new Error('PDF edit failed')

  const budgetWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(budgetWorkbook, XLSX.utils.aoa_to_sheet([['项目', '金额'], ['会议', 300]]), '预算')
  await page.locator('input[type="file"].visually-hidden-input').setInputFiles({
    name: '预算.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: XLSX.write(budgetWorkbook, { type: 'buffer', bookType: 'xlsx' }),
  })
  await page.waitForFunction(() => !document.querySelector('.composer-action-button')?.disabled)
  await editor.fill('依据上传表格输出 Word 预算说明')
  await editor.press('Enter')
  await page.getByText('已依据表格生成预算说明').waitFor({ timeout: 20_000 })
  const budgetWord = await downloadArtifact(page, /预算说明\.docx/)
  if (!(await mammoth.extractRawText({ buffer: budgetWord })).value.includes('会议预算为300')) {
    throw new Error('cross-format Excel to Word generation failed')
  }

  const visibleDateTimes = await page.locator('.message-footer > span:first-child').allInnerTexts()
  if (!visibleDateTimes.some((value) => /\d{4}\/\d{2}\/\d{2}.*\d{2}:\d{2}/.test(value))) {
    throw new Error(`message date and time missing: ${visibleDateTimes.join(' | ')}`)
  }

  await page.getByLabel('打开设置').click()
  if (await page.getByText('桌面宠物', { exact: true }).count()) throw new Error('Removed pet setting remains')
  await page.keyboard.press('Escape')
  if (await page.locator('.desktop-pet').count()) throw new Error('Removed pet remains on screen')
  await page.screenshot({ path: '/private/tmp/shotai-document-workflow.png', fullPage: false })
  console.log(JSON.stringify({
    manualSkillEntry: false, wordCreate: true, wordEdit: true, pdfCreate: true, pdfEdit: true,
    excelToWord: true,
    messageDateTime: true, desktopPetRemoved: true,
  }, null, 2))
} finally {
  await browser.close()
}
