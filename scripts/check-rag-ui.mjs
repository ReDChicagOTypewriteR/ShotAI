import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)
const fixturePath = path.join(
  projectRoot,
  'test-fixtures',
  '第四步知识库测试.txt',
)
const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

let page
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.goto('http://127.0.0.1:5173/#workbench', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.waitForFunction(
    () => document.body.innerText.includes('OLLAMA CONNECTED'),
    undefined,
    { timeout: 20_000 },
  )

  await page.getByRole('button', { name: /知识 \/ KNOWLEDGE/ }).click()
  await page
    .getByRole('checkbox', { name: '在当前对话中启用' })
    .evaluate((element) => element.click())
  await page.locator('input[name="file"]').setInputFiles(fixturePath)
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('文档已导入，共 1 个检索切片') ||
      document.body.innerText.includes('1 文档 · 1 切片'),
    undefined,
    { timeout: 20_000 },
  )
  await page.getByRole('button', { name: 'Close this dialog' }).click()

  const editor = page.locator('.composer-textarea')
  await editor.fill('天穹计划的验收口令是什么？请根据知识库回答。')
  await editor.press('Enter')
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('ORBIT-4729') &&
      document.body.innerText.includes('本地依据'),
    undefined,
    { timeout: 60_000 },
  )

  await page.screenshot({
    path: '/private/tmp/shotai-rag-check.png',
    fullPage: false,
  })
  const bodyText = await page.locator('body').innerText()
  console.log(
    JSON.stringify(
      {
        ollamaConnected: bodyText.includes('OLLAMA CONNECTED'),
        documentImported: bodyText.includes('1 个知识库 · 1 个切片'),
        answerContainsPasscode: bodyText.includes('ORBIT-4729'),
        citationVisible: bodyText.includes('本地依据'),
      },
      null,
      2,
    ),
  )
} catch (error) {
  if (page) {
    await page.screenshot({
      path: '/private/tmp/shotai-rag-check-failed.png',
      fullPage: false,
    })
    console.error((await page.locator('body').innerText()).slice(-5000))
  }
  throw error
} finally {
  await browser.close()
}
