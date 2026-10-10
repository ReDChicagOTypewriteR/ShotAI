import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseTemplate } from '@vue/compiler-dom'
import { chromium } from 'playwright-core'

const root = new URL('..', import.meta.url)
const read = file => readFileSync(new URL(file, root), 'utf8')
const dictionary = new Map()
const catalog = ts.createSourceFile('en.ts', read('src/locales/en.ts'), ts.ScriptTarget.Latest, true)
function properties(node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name) && ts.isStringLiteral(node.initializer)) {
    assert.ok(!dictionary.has(node.name.text), `Duplicate translation: ${node.name.text}`)
    dictionary.set(node.name.text, node.initializer.text)
    const parameters = value => [...value.matchAll(/\{\d+\}/g)].map(match => match[0]).sort()
    assert.deepEqual(parameters(node.initializer.text), parameters(node.name.text), `Placeholder mismatch: ${node.name.text}`)
  }
  ts.forEachChild(node, properties)
}
properties(catalog)
function checkExpression(expression) {
  const ast = ts.createSourceFile('ui.ts', expression, ts.ScriptTarget.Latest, true)
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 't' && ts.isStringLiteral(node.arguments[0])) {
      assert.ok(dictionary.has(node.arguments[0].text), `Missing English: ${node.arguments[0].text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
}
for (const file of ['src/App.vue', 'src/components/ModelHealthPanel.vue', 'src/components/ImportFailurePanel.vue', 'src/components/PendingDocument.vue']) {
  const descriptor = parseSfc(read(file)).descriptor
  checkExpression(descriptor.scriptSetup.content)
  const visit = node => {
    if (node.type === 2) assert.doesNotMatch(node.content, /[\u3400-\u9fff]/, `Untranslated template text in ${file}`)
    if (node.type === 5) checkExpression(node.content.content)
    for (const prop of node.props || []) {
      if (prop.type === 6 && prop.value) assert.doesNotMatch(prop.value.content, /[\u3400-\u9fff]/, `Untranslated attribute in ${file}`)
      if (prop.type === 7 && prop.exp) checkExpression(prop.exp.content)
    }
    for (const child of node.children || []) visit(child)
  }
  visit(parseTemplate(descriptor.template.content))
}
const require = createRequire(import.meta.url)
const { systemLocale } = require('../desktop/electron/locale.cjs')
assert.equal(systemLocale({ LANG: 'zh_CN.UTF-8' }), 'zh-CN')
assert.equal(systemLocale({ LC_ALL: 'en_US.UTF-8', LANG: 'zh_CN.UTF-8' }), 'en')
assert.equal(systemLocale({ LANG: 'de_DE.UTF-8' }), 'en')
assert.equal(systemLocale({}, 'zh-TW'), 'zh-CN')

const browser = await chromium.launch({ headless: true, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' })
const url = process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5181'
async function mock(page) {
  await page.route('**/shotai/system', route => route.fulfill({ json: { version: '1.3.0', canManage: true, isHost: true, platform: 'linux' } }))
  await page.route('**/image-runtime/status', route => route.fulfill({ json: { available: false, serviceOnline: false, runtimeFound: false, modelConfigured: false, modelLabel: '', modelFiles: [], missingFiles: [], runtimeError: '' } }))
  await page.route('**/image/v1/models', route => route.fulfill({ json: { data: [] } }))
  await page.route('**/shotai/monitor/session', route => route.fulfill({ json: { authenticated: false } }))
  await page.route('**/shotai/monitor/login', route => route.fulfill({ status: 401, json: { error: '账号或密码不正确' } }))
  await page.route('**/ollama/api/**', route => {
    const path = new URL(route.request().url()).pathname
    const details = { family: 'qwen', parameter_size: '0.5B', quantization_level: 'Q4_K_M' }
    if (path.endsWith('/version')) return route.fulfill({ json: { version: '0.33.0' } })
    if (path.endsWith('/tags')) return route.fulfill({ json: { models: [{ name: 'qwen-test:latest', size: 1000, digest: 'test', details }] } })
    if (path.endsWith('/ps')) return route.fulfill({ json: { models: [] } })
    if (path.endsWith('/show')) return route.fulfill({ json: { details, capabilities: ['completion'] } })
    if (path.endsWith('/chat')) {
      const body = route.request().postDataJSON()
      if (body.messages[0]?.content.includes('任务调度器')) return route.fulfill({ json: { message: { content: '{"action":"chat"}' } } })
      return route.fulfill({ contentType: 'application/x-ndjson', body: JSON.stringify({ message: { role: 'assistant', content: '中文回答保持原样' }, done: true }) + '\n' })
    }
    return route.fulfill({ json: {} })
  })
}
try {
  const page = await browser.newPage({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  await mock(page)
  await page.goto(url)
  await page.getByRole('button', { name: 'New chat', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  assert.equal(await page.title(), 'ShotAI · Offline Workspace')
  await page.getByRole('textbox', { name: 'Enter a message', exact: true }).fill('这是用户原始输入')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await page.getByText('中文回答保持原样', { exact: true }).waitFor({ timeout: 10000 }).catch(async error => {
    console.error(await page.locator('body').innerText())
    throw error
  })
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.locator('#shotai-language').selectOption('zh-CN')
  await page.getByRole('heading', { name: '设置', exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
  await page.getByText('本地数据已保存', { exact: true }).first().waitFor()
  await page.reload()
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN')
  await page.getByText('中文回答保持原样', { exact: true }).waitFor()
  await page.getByRole('button', { name: '打开设置', exact: true }).click()
  await page.locator('#shotai-language').selectOption('en')
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/private/tmp/shotai-settings-en.png' })
  await page.locator('#shotai-language').selectOption('auto')
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Open host monitor', exact: true }).click()
  await page.getByRole('textbox', { name: 'Administrator username', exact: true }).fill('admin')
  await page.getByRole('textbox', { name: 'Administrator password', exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in to monitor', exact: true }).click()
  await page.getByText('Incorrect username or password', { exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Open settings', exact: true }).click()
  await page.locator('#shotai-language').waitFor()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
  await page.screenshot({ path: '/private/tmp/shotai-settings-en-mobile.png' })
  const chinese = await browser.newPage({ locale: 'zh-CN' })
  await mock(chinese)
  await chinese.goto(url)
  await chinese.getByRole('button', { name: '新建对话', exact: true }).waitFor()
  assert.equal(await chinese.locator('html').getAttribute('lang'), 'zh-CN')
  const fallback = await browser.newPage({ locale: 'de-DE' })
  await mock(fallback)
  await fallback.goto(url)
  await fallback.getByRole('button', { name: 'New chat', exact: true }).waitFor()
  assert.equal(await fallback.locator('html').getAttribute('lang'), 'en')
  console.log(JSON.stringify({ localization: true, englishKeys: dictionary.size, systemLocale: true, manualSwitch: true, persisted: true, userContentPreserved: true, monitorEnglish: true, mobile: true, reducedMotion: true, chineseDefault: true, englishFallback: true }))
} finally { await browser.close() }
