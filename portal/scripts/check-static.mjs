import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const portalDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const portalPackage = JSON.parse(
  await readFile(join(portalDirectory, 'package.json'), 'utf8'),
)
const staticIndexUrl = pathToFileURL(
  join(
    portalDirectory,
    '..',
    'release',
    `ShotAI-${portalPackage.version}-Portal-Static`,
    'index.html',
  ),
).href
const sourceIndexUrl = pathToFileURL(
  join(portalDirectory, 'index.html'),
).href

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

try {
  const failures = []
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  page.on('requestfailed', (request) => {
    failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`)
  })

  await page.goto('http://127.0.0.1:4174/', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.getByText('真正可控的 AI 对话', { exact: true }).waitFor()
  await page
    .getByRole('heading', { name: /能生成，\s*也能照着改。/ })
    .waitFor()

  const desktop = await page.evaluate(() => {
    const preview = document.querySelector('.product-preview-frame img')
    const githubLinks = Array.from(
      document.querySelectorAll(
        'a[href="https://github.com/ReDChicagOTypewriteR/ShotAI"]',
      ),
    )
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      previewLoaded: preview instanceof HTMLImageElement && preview.naturalWidth > 0,
      title: document.title,
      githubLinksValid:
        githubLinks.length === 2 &&
        githubLinks.every(
          (link) =>
            link.getAttribute('target') === '_blank' &&
            link.getAttribute('rel')?.includes('noopener') &&
            link.getAttribute('rel')?.includes('noreferrer'),
        ),
    }
  })
  if (
    desktop.documentWidth > desktop.viewportWidth ||
    !desktop.previewLoaded ||
    !desktop.githubLinksValid
  ) {
    throw new Error(`desktop portal validation failed: ${JSON.stringify(desktop)}`)
  }

  await page.locator('#experience').scrollIntoViewIfNeeded()
  await page.screenshot({
    path: '/private/tmp/shotai-portal-desktop.png',
    fullPage: false,
  })

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  mobile.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  mobile.on('requestfailed', (request) => {
    failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`)
  })
  await mobile.goto('http://127.0.0.1:4174/', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await mobile.getByRole('button', { name: '打开或关闭导航' }).click()
  await mobile.getByRole('link', { name: '图片创作' }).waitFor()
  const mobileMetrics = await mobile.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    menuExpanded:
      document.querySelector('.menu-toggle')?.getAttribute('aria-expanded') ===
      'true',
  }))
  if (
    mobileMetrics.documentWidth > mobileMetrics.viewportWidth ||
    !mobileMetrics.menuExpanded
  ) {
    throw new Error(`mobile portal validation failed: ${JSON.stringify(mobileMetrics)}`)
  }
  await mobile.screenshot({
    path: '/private/tmp/shotai-portal-mobile.png',
    fullPage: false,
  })

  const offline = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  offline.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  offline.on('requestfailed', (request) => {
    failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`)
  })
  await offline.goto(staticIndexUrl, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await offline.getByText('我们仍能对话', { exact: true }).waitFor()
  await offline.getByText('真正可控的 AI 对话', { exact: true }).waitFor()
  const offlineMetrics = await offline.evaluate(() => {
    const preview = document.querySelector('.product-preview-frame img')
    const docsLink = document.querySelector(
      'a[aria-label="打开 ShotAI 使用文档"]',
    )
    return {
      previewLoaded: preview instanceof HTMLImageElement && preview.naturalWidth > 0,
      hasSourceEntry: document.documentElement.innerHTML.includes('/src/main.ts'),
      docsLinkValid: docsLink?.getAttribute('href') === './docs/guide/',
    }
  })
  if (
    !offlineMetrics.previewLoaded ||
    offlineMetrics.hasSourceEntry ||
    !offlineMetrics.docsLinkValid
  ) {
    throw new Error(`offline portal validation failed: ${JSON.stringify(offlineMetrics)}`)
  }

  const docs = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  docs.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  await docs.goto('http://127.0.0.1:4174/docs/guide/', {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await docs.getByText('ShotAI 把本地模型', { exact: false }).waitFor()

  const sourceEntry = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  })
  sourceEntry.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text())
  })
  sourceEntry.on('requestfailed', (request) => {
    failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`)
  })
  await sourceEntry.goto(sourceIndexUrl, {
    waitUntil: 'load',
    timeout: 20_000,
  })
  await sourceEntry.getByText('真正可控的 AI 对话', { exact: true }).waitFor()
  const sourceEntryMetrics = await sourceEntry.evaluate(() => ({
    pathname: window.location.pathname,
    previewLoaded:
      document.querySelector('.product-preview-frame img') instanceof
        HTMLImageElement &&
      document.querySelector('.product-preview-frame img').naturalWidth > 0,
  }))
  if (
    !sourceEntryMetrics.pathname.endsWith('/portal/dist/index.html') ||
    !sourceEntryMetrics.previewLoaded
  ) {
    throw new Error(
      `source entry redirect failed: ${JSON.stringify(sourceEntryMetrics)}`,
    )
  }

  if (failures.length) {
    throw new Error(`portal emitted browser errors:\n${failures.join('\n')}`)
  }

  console.log(
    JSON.stringify(
      {
        desktopNoOverflow: true,
        mobileNoOverflow: true,
        mobileNavigationWorks: true,
        previewImageLoaded: true,
        updatedContentVisible: true,
        directHtmlOpenWorks: true,
        sourceIndexRedirectsToBuiltPortal: true,
        vitepressDocsWorks: true,
        browserErrors: 0,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
