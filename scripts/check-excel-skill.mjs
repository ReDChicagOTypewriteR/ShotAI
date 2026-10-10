import { chromium } from 'playwright-core'
import * as XLSX from 'xlsx'
import { readFile } from 'node:fs/promises'

const appUrl = process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

let chatCount = 0
let routeCount = 0

function modelList() {
  return {
    models: [
      {
        name: 'qwen3.5-excel-test:latest',
        model: 'qwen3.5-excel-test:latest',
        modified_at: new Date().toISOString(),
        size: 8_000_000_000,
        digest: 'sha256:excel-skill-test',
        details: {
          format: 'gguf',
          family: 'qwen3.5',
          families: ['qwen3.5'],
          parameter_size: '9B',
          quantization_level: 'Q4_K_M',
        },
      },
    ],
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: '0.33.0-excel-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(modelList()),
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
          details: modelList().models[0].details,
          capabilities: ['completion'],
          model_info: { 'qwen3.5.context_length': 32768 },
        }),
      })
    }
    if (pathname.endsWith('/chat')) {
      const payload = request.postDataJSON()
      const system = payload.messages.find((message) => message.role === 'system')?.content || ''
      if (system.includes('任务调度器')) {
        routeCount += 1
        const sources = JSON.parse(system.split('\n').at(-1))
        const choice = routeCount === 1
          ? { action: 'create', kind: 'excel' }
          : routeCount === 2
            ? { action: 'chat' }
            : routeCount === 5
              ? { action: 'clarify', question: '需要修改哪个文件，以及哪些内容？' }
              : { action: 'edit', kind: 'excel', sourceId: sources.find((source) => source.name === (routeCount === 4 ? '修改后的库存.xlsx' : '库存.xlsx'))?.id }
        return route.fulfill({
          contentType: 'application/x-ndjson',
          body: JSON.stringify({ message: { content: JSON.stringify(choice) }, done: true }) + '\n',
        })
      }
      if (!system.includes('文件任务规划器')) {
        return route.fulfill({
          contentType: 'application/x-ndjson',
          body: JSON.stringify({ message: { content: '表格包含键盘库存，当前库存为20。' }, done: true }) + '\n',
        })
      }
      chatCount += 1
      if (chatCount === 3) {
        const user = payload.messages.findLast((message) => message.role === 'user')?.content || ''
        if (!user.includes('B2="999"')) throw new Error('follow-up did not read the previous generated workbook')
      }
      const plan =
        chatCount === 1
          ? {
              mode: 'create',
              fileName: '月度销售统计.xlsx',
              summary: '已生成月度销售统计表',
              sheets: [
                {
                  name: '销售统计',
                  rows: [
                    ['月份', '销售额'],
                    ['1月', 120000],
                    ['2月', 135000],
                  ],
                },
              ],
            }
          : {
              mode: 'edit',
              fileName: chatCount === 3 ? '再次修改库存.xlsx' : '修改后的库存.xlsx',
              summary: chatCount === 3 ? '已再次调整库存' : '已更新 Sheet1 的 B2',
              operations: [
                { type: 'set_cell', sheet: 'Sheet1', cell: 'B2', value: chatCount === 3 ? 1000 : 999 },
              ],
            }
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: `${JSON.stringify({
          message: { role: 'assistant', content: JSON.stringify(plan) },
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

  await page.goto(`${appUrl}/#workbench`, {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.waitForFunction(
    () => Boolean(document.querySelector('.model-select')?.textContent?.trim()),
    undefined,
    { timeout: 20_000 },
  )

  await page.getByLabel('添加文件或使用我的资料').click()
  if (await page.getByRole('menuitem', { name: /Skill/ }).count()) throw new Error('manual Skill entry remains')
  await page.keyboard.press('Escape')

  const editor = page.locator('.composer-textarea')
  await editor.fill('生成一份包含一月和二月销售额的 Excel 文件')
  await editor.press('Enter')
  await page.getByText('已生成月度销售统计表').waitFor({ timeout: 20_000 })

  const createDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /月度销售统计\.xlsx/ }).click()
  const createDownload = await createDownloadPromise
  const createPath = await createDownload.path()
  if (!createPath) throw new Error('generated workbook download path is unavailable')
  const generatedWorkbook = XLSX.read(await readFile(createPath))
  const generatedSheet = generatedWorkbook.Sheets['销售统计']
  if (generatedSheet?.B3?.v !== 135000) {
    throw new Error('generated workbook content is incorrect')
  }

  const sourceWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    sourceWorkbook,
    XLSX.utils.aoa_to_sheet([
      ['商品', '库存'],
      ['键盘', 20],
    ]),
    'Sheet1',
  )
  const sourceBuffer = XLSX.write(sourceWorkbook, {
    type: 'buffer',
    bookType: 'xlsx',
  })
  await page.locator('input[type="file"].visually-hidden-input').setInputFiles({
    name: '库存.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: sourceBuffer,
  })
  await editor.fill('说明这个表格里有什么')
  await editor.press('Enter')
  await page.getByText('表格包含键盘库存，当前库存为20。').waitFor({ timeout: 20_000 })
  if (await page.locator('.message-file-card.is-output').count() !== 1) throw new Error('analysis unexpectedly generated a file')
  await page.waitForTimeout(1_000)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(document.querySelector('.model-select')?.textContent?.trim()))
  await editor.fill('把 Sheet1 的 B2 改为 999')
  await editor.press('Enter')
  await page.getByText('已更新 Sheet1 的 B2').waitFor({ timeout: 20_000 })

  const editDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /修改后的库存\.xlsx/ }).click()
  const editDownload = await editDownloadPromise
  const editPath = await editDownload.path()
  if (!editPath) throw new Error('edited workbook download path is unavailable')
  const editedWorkbook = XLSX.read(await readFile(editPath))
  if (editedWorkbook.Sheets.Sheet1?.B2?.v !== 999) {
    throw new Error('edited workbook did not preserve the requested cell change')
  }
  if (editedWorkbook.Sheets.Sheet1?.A2?.v !== '键盘') {
    throw new Error('edited workbook did not preserve unrelated source cells')
  }

  await page.waitForTimeout(1_000)
  await page.reload({ waitUntil: 'networkidle' })
  const restoredArtifacts = await page.locator('.message-file-card.is-output').count()
  if (restoredArtifacts !== 2) {
    throw new Error('Excel output cards were not restored from local storage')
  }

  await editor.fill('再把刚才输出文件里的库存调整为1000')
  await editor.press('Enter')
  await page.getByText('已再次调整库存').waitFor({ timeout: 20_000 })
  const followupDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /再次修改库存\.xlsx/ }).click()
  const followupDownload = await followupDownloadPromise
  const followupPath = await followupDownload.path()
  if (!followupPath) throw new Error('follow-up download unavailable')
  const followupWorkbook = XLSX.read(await readFile(followupPath))
  if (followupWorkbook.Sheets.Sheet1?.B2?.v !== 1000 || followupWorkbook.Sheets.Sheet1?.A2?.v !== '键盘') {
    throw new Error('follow-up failed to modify the generated workbook')
  }
  await editor.fill('请再处理一下')
  await editor.press('Enter')
  await page.getByText('需要修改哪个文件，以及哪些内容？').waitFor({ timeout: 20_000 })
  if (await page.locator('.message-file-card.is-output').count() !== 3) throw new Error('clarification unexpectedly created a file')

  await page.screenshot({
    path: '/private/tmp/shotai-excel-skill-check.png',
    fullPage: false,
  })
  console.log(
    JSON.stringify(
      {
        manualSkillEntry: false,
        analysisWithoutFileGeneration: true,
        editSourceRestoredAfterReload: true,
        generatedFileFollowup: true,
        clarificationWithoutMutation: true,
        workbookCreated: true,
        sourceWorkbookEdited: true,
        unrelatedCellsPreserved: true,
        downloadsPersisted: restoredArtifacts === 2,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
