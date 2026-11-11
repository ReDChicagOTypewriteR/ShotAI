import assert from 'node:assert/strict'
import { chromium } from 'playwright-core'
import { Document, Packer, Paragraph } from 'docx'

// Uses the user's existing local runtime. No mocked endpoints or downloads.
const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  page.setDefaultTimeout(15000)
  const requests = []
  page.on('request', request => { if (request.url().endsWith('/api/chat')) requests.push(request.postDataJSON()) })
  await page.goto(process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5183/')
  await page.getByText('服务在线', { exact: true }).first().waitFor({ timeout: 15000 })
  if (process.argv.includes('--preview-model')) {
    await page.locator('.model-select .el-select__wrapper').click()
    await page.getByRole('option').filter({ hasText: /preview/i }).click()
  }
  const docx = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('会议编号：ORBIT-31。会议时间：周五下午三点。')] }] }))
  await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({ name: '本机验收.docx', mimeType: 'application/zip', buffer: docx })
  await page.locator('.pending-document').filter({ hasText: '本机验收.docx' }).waitFor()
  await page.locator('.composer-textarea').fill('根据附件，会议编号是什么？只输出编号。')
  const startedAt = Date.now()
  await page.locator('.composer-textarea').press('Enter')
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor()
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden', timeout: 120000 })
  const answer = await page.locator('.message-content.is-assistant').last().innerText()
  console.log(JSON.stringify({ actualModel: requests.at(-1)?.model, answer }))
  assert.equal(await page.locator('.task-error').count(), 0, answer)
  assert.ok(requests.at(-1)?.messages.some(message => message.content.includes('ORBIT-31')))
  assert.match(answer, /ORBIT-31/i)
  await page.screenshot({ path: '/private/tmp/shotai-real-model-preview.png' })
  console.log(JSON.stringify({ realModel: requests.at(-1)?.model, docxZipMime: true, answer, elapsedMs: Date.now() - startedAt }))
} finally { await browser.close() }
