import assert from 'node:assert/strict'
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
const followupFormats = []
const followupThinking = []
const grammarError = {
  error: { code: 400, message: 'Failed to initialize samplers: failed to parse grammar', type: 'invalid_request_error' },
}

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
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
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
          capabilities: ['completion', 'thinking'],
          model_info: { 'qwen3.5.context_length': 32768 },
        }),
      })
    }
    if (pathname.endsWith('/chat')) {
      const payload = request.postDataJSON()
      const system = payload.messages.find((message) => message.role === 'system')?.content || ''
      if (system.includes('任务调度器')) {
        routeCount += 1
        const sources = JSON.parse(system.split('\n').find(line => line.startsWith('[{') || line === '[]') || '[]')
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
      if (routeCount === 4) {
        followupThinking.push(payload.think)
        const user = payload.messages.findLast((message) => message.role === 'user')?.content || ''
        if (!user.includes('B2="999"')) throw new Error('follow-up did not read the previous generated workbook')
        if (typeof payload.format === 'object') {
          followupFormats.push('schema')
          return route.fulfill({
            contentType: 'application/x-ndjson',
            body: [
              ...(payload.think ? [JSON.stringify({ message: { role: 'assistant', thinking: '正在规划表格' }, done: false })] : []),
              JSON.stringify({ error: JSON.stringify(grammarError) }),
              '',
            ].join('\n'),
          })
        }
        if (payload.format === 'json') {
          followupFormats.push('json')
          return route.fulfill({ status: 400, json: grammarError })
        }
        followupFormats.push('prompt')
        assert.match(system, /只返回符合以下结构的单个 JSON 对象/)
      } else {
        assert.equal(payload.think, false, 'Automatic mode should skip reasoning on single-file plans')
      }
      chatCount += 1
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
  await page.locator('.pending-document').filter({ hasText: '库存.xlsx' }).waitFor()
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

  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.locator('.parameter-row').filter({ has: page.getByText('模型推理', { exact: true }) }).locator('.el-select__wrapper').click()
  await page.getByRole('option', { name: '开启推理', exact: true }).click()
  await page.locator('.el-drawer:visible .el-drawer__close-btn').click()
  await page.locator('.el-drawer:visible').waitFor({ state: 'hidden' })
  await editor.fill('再把刚才输出文件里的库存调整为1000')
  await editor.press('Enter')
  await page.getByText('已再次调整库存').waitFor({ timeout: 20_000 })
  const [followupDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /再次修改库存\.xlsx/ }).click({ timeout: 10000 }),
  ])
  const followupPath = await followupDownload.path()
  if (!followupPath) throw new Error('follow-up download unavailable')
  const followupWorkbook = XLSX.read(await readFile(followupPath))
  if (followupWorkbook.Sheets.Sheet1?.B2?.v !== 1000 || followupWorkbook.Sheets.Sheet1?.A2?.v !== '键盘') {
    throw new Error('follow-up failed to modify the generated workbook')
  }
  assert.deepEqual(followupFormats, ['schema', 'schema', 'json', 'prompt'])
  assert.deepEqual(followupThinking, [true, false, false, false])
  assert.equal(await page.locator('.task-error').count(), 0)
  await editor.fill('请再处理一下')
  await editor.press('Enter')
  await page.getByText('需要修改哪个文件，以及哪些内容？').waitFor({ timeout: 20_000 })
  if (await page.locator('.message-file-card.is-output').count() !== 3) throw new Error('clarification unexpectedly created a file')

  await editor.fill('生成一个99乘法表的excel')
  await editor.press('Enter')
  const multiplicationCard = page.getByRole('button', { name: /九九乘法表\.xlsx/ })
  await multiplicationCard.waitFor()
  const multiplicationDownloadPromise = page.waitForEvent('download')
  await multiplicationCard.click()
  const multiplicationDownload = await multiplicationDownloadPromise
  const multiplicationWorkbook = XLSX.read(await readFile(await multiplicationDownload.path()))
  const multiplicationSheet = multiplicationWorkbook.Sheets['九九乘法表']
  assert.equal(multiplicationSheet['!ref'], 'A1:I9')
  assert.equal(Object.keys(multiplicationSheet).filter(key => !key.startsWith('!')).length, 45)
  assert.equal(multiplicationSheet.A1.v, '1×1=1')
  assert.equal(multiplicationSheet.E7.v, '5×7=35')
  assert.equal(multiplicationSheet.I9.v, '9×9=81')
  assert.equal(routeCount, 5)
  assert.equal(chatCount, 3)
  assert.equal(await page.locator('.task-error').count(), 0)

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
        grammarErrorRecovered: true,
        multiplicationWorkbookGeneratedLocally: true,
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
