import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  let abortedChatRequests = 0
  let chatRequestCount = 0

  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: '0.32.4-chat-ux-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: [
            {
              name: 'qwen3-vl:8b-instruct-q4_K_M',
              model: 'qwen3-vl:8b-instruct-q4_K_M',
              modified_at: new Date().toISOString(),
              size: 6_100_000_000,
              digest: 'sha256:chat-ux-test',
              details: {
                format: 'gguf',
                family: 'qwen3vl',
                families: ['qwen3vl'],
                parameter_size: '8B',
                quantization_level: 'Q4_K_M',
              },
            },
          ],
        }),
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
          details: {
            format: 'gguf',
            family: 'qwen3vl',
            parameter_size: '8B',
            quantization_level: 'Q4_K_M',
          },
          capabilities: ['completion', 'vision'],
          model_info: { 'qwen3vl.context_length': 262144 },
        }),
      })
    }
    if (pathname.endsWith('/chat')) {
      chatRequestCount += 1
      if (chatRequestCount === 3) {
        const longAnswer = Array.from(
          { length: 45 },
          (_, index) =>
            `${index + 1}. 这是用于验证消息区域滚动的长回答段落。内容需要保持可读，并且用户能够通过鼠标滚轮到达最后一段。`,
        ).join('\n\n')
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
          body: `${JSON.stringify({
            message: {
              role: 'assistant',
              content: longAnswer,
            },
            done: true,
          })}\n`,
        })
      }
      if (chatRequestCount === 4) {
        await new Promise((resolve) => setTimeout(resolve, 1_200))
        const additionalAnswer = Array.from(
          { length: 12 },
          (_, index) =>
            `新增 ${index + 1}：这段内容用于确认用户手动滚动后，页面不会在生成时抢回底部。`,
        ).join('\n\n')
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
          body: `${JSON.stringify({
            message: {
              role: 'assistant',
              content: additionalAnswer,
            },
            done: true,
          })}\n`,
        })
      }
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      if (request.failure()) abortedChatRequests += 1
      return route
        .fulfill({
          status: 200,
          headers: { 'Content-Type': 'application/x-ndjson' },
          body: `${JSON.stringify({
            message: {
              role: 'assistant',
              content: '这段内容不应在用户停止后出现。',
            },
            done: true,
          })}\n`,
        })
        .catch(() => {
          abortedChatRequests += 1
        })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unhandled test route: ${pathname}` }),
    })
  })

  await page.goto(`${process.env.SHOTAI_TEST_URL || 'http://127.0.0.1:5173/'}#workbench`, {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.waitForFunction(
    () => document.body.innerText.includes('qwen3-vl:8b-instruct'),
    undefined,
    { timeout: 20_000 },
  )
  const focusedLayout = await page.evaluate(() => ({
    hasLegacyNavigation: Boolean(document.querySelector('.primary-nav')),
    hasStatusBanner: Boolean(document.querySelector('.privacy-strip')),
    hasConversationList: Boolean(document.querySelector('.conversation-section')),
    hasComposer: Boolean(document.querySelector('.composer-input')),
  }))
  if (
    focusedLayout.hasLegacyNavigation ||
    focusedLayout.hasStatusBanner ||
    !focusedLayout.hasConversationList ||
    !focusedLayout.hasComposer
  ) {
    throw new Error(`focused chat layout is incomplete: ${JSON.stringify(focusedLayout)}`)
  }

  const editor = page.locator('.composer-textarea')
  const longPrompt = Array.from(
    { length: 260 },
    (_, index) => `第${index + 1}段长上下文测试内容`,
  ).join('，')
  await editor.fill(longPrompt)

  const editorMetrics = await editor.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      className: element.className,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: style.overflowY,
    }
  })
  if (
    editorMetrics.scrollHeight <= editorMetrics.clientHeight ||
    editorMetrics.overflowY !== 'auto'
  ) {
    throw new Error(`long prompt is not scrollable: ${JSON.stringify(editorMetrics)}`)
  }

  await page.locator('.composer-action-button:not(.is-stop)').click()
  await page.waitForTimeout(250)
  if (!(await page.locator('.composer-action-button.is-stop').count())) {
    const diagnostics = await page.evaluate(() => ({
      bodyText: document.body.innerText.slice(-1_000),
      editorText:
        document.querySelector('.composer-textarea')?.value ?? '',
      buttonClass:
        document.querySelector('.composer-action-button')?.className ?? '',
    }))
    throw new Error(`send button did not start generation: ${JSON.stringify(diagnostics)}`)
  }
  const stopButton = page.locator('.composer-action-button.is-stop')
  await stopButton.waitFor({ state: 'visible', timeout: 5_000 })
  await page.screenshot({
    path: '/private/tmp/shotai-chat-ux-generating.png',
    fullPage: false,
  })
  await stopButton.click()
  await page.waitForFunction(
    () => document.body.innerText.includes('已由用户停止'),
    undefined,
    { timeout: 5_000 },
  )
  await page.locator('.composer-action-button:not(.is-stop)').waitFor({
    state: 'visible',
    timeout: 5_000,
  })
  await page.waitForTimeout(1_700)

  if (await page.getByText('这段内容不应在用户停止后出现。').count()) {
    throw new Error('aborted response still changed the conversation')
  }
  const editButton = page.getByRole('button', {
    name: '编辑问题并重新生成',
  })
  if (!(await editButton.count())) {
    throw new Error('user message edit action is missing')
  }
  await editButton.click()
  const editInput = page.locator('.el-message-box textarea')
  await editInput.waitFor({ state: 'visible', timeout: 5_000 })
  await editInput.fill('这是修改后的问题')
  await page.getByRole('button', { name: '保存并重新生成' }).click()
  await page.locator('.composer-action-button.is-stop').waitFor({
    state: 'visible',
    timeout: 5_000,
  })
  await page.locator('.composer-action-button.is-stop').click()
  await page.locator('.composer-action-button:not(.is-stop)').waitFor({
    state: 'visible',
    timeout: 5_000,
  })
  if (!(await page.getByText('这是修改后的问题', { exact: true }).count())) {
    throw new Error('edited user prompt was not saved')
  }

  await editor.fill('请生成用于测试滚动的长回答')
  await editor.press('Enter')
  await page.waitForFunction(
    () => document.body.innerText.includes('这是用于验证消息区域滚动的长回答段落'),
    undefined,
    { timeout: 10_000 },
  )
  const messageScrollMetrics = await page.evaluate(() => {
    const list = document.querySelector('.elx-bubble-list__list')
    if (!list) return null
    const style = getComputedStyle(list)
    const maxScrollTop = list.scrollHeight - list.clientHeight
    const initiallyAtBottom = Math.abs(maxScrollTop - list.scrollTop) < 3
    list.scrollTop = 0
    const canReachTop = list.scrollTop === 0
    list.scrollTop = maxScrollTop
    const canReachBottom = Math.abs(maxScrollTop - list.scrollTop) < 3
    return {
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      overflowY: style.overflowY,
      initiallyAtBottom,
      canReachTop,
      canReachBottom,
    }
  })
  if (
    !messageScrollMetrics ||
    messageScrollMetrics.scrollHeight <= messageScrollMetrics.clientHeight ||
    messageScrollMetrics.overflowY !== 'auto' ||
    !messageScrollMetrics.initiallyAtBottom ||
    !messageScrollMetrics.canReachTop ||
    !messageScrollMetrics.canReachBottom
  ) {
    throw new Error(
      `message list is not scrollable: ${JSON.stringify(messageScrollMetrics)}`,
    )
  }

  await editor.fill('生成期间请允许我查看上面的内容')
  await editor.press('Enter')
  await page.locator('.composer-action-button.is-stop').waitFor({
    state: 'visible',
    timeout: 5_000,
  })
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    const list = document.querySelector('.elx-bubble-list__list')
    if (!(list instanceof HTMLElement)) return
    list.scrollTop = 0
    list.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForFunction(
    () => document.body.innerText.includes('新增 12：'),
    undefined,
    { timeout: 10_000 },
  )
  const streamingScrollMetrics = await page.evaluate(() => {
    const list = document.querySelector('.elx-bubble-list__list')
    if (!(list instanceof HTMLElement)) return null
    return {
      scrollTop: list.scrollTop,
      maxScrollTop: list.scrollHeight - list.clientHeight,
      typingStates: document.querySelectorAll('.typing-state').length,
    }
  })
  if (
    !streamingScrollMetrics ||
    streamingScrollMetrics.maxScrollTop <= 0 ||
    streamingScrollMetrics.scrollTop > 3
  ) {
    throw new Error(
      `streaming response stole manual scroll: ${JSON.stringify(streamingScrollMetrics)}`,
    )
  }
  if (streamingScrollMetrics.typingStates !== 0) {
    throw new Error('finished response still shows the preparing indicator')
  }

  await page.screenshot({
    path: '/private/tmp/shotai-chat-ux-check.png',
    fullPage: false,
  })
  await page.getByRole('button', { name: '打开设置' }).click()
  await page.locator('.theme-setting-row .el-switch').click()
  const lightThemeMetrics = await page.evaluate(() => {
    const drawer = document.querySelector('.el-drawer')
    const settingsText = document.querySelector('.capability-overview strong')
    if (!drawer || !settingsText) return null
    const drawerStyle = getComputedStyle(drawer)
    const textStyle = getComputedStyle(settingsText)
    return {
      rootClass: document.documentElement.className,
      drawerBackground: drawerStyle.backgroundColor,
      drawerColor: drawerStyle.color,
      textColor: textStyle.color,
      themeText: drawerStyle.getPropertyValue('--text').trim(),
      themeSurface: drawerStyle
        .getPropertyValue('--surface-raised')
        .trim(),
    }
  })
  if (
    !lightThemeMetrics ||
    !lightThemeMetrics.rootClass.includes('theme-light') ||
    lightThemeMetrics.themeText !== '#121722' ||
    lightThemeMetrics.drawerColor !== lightThemeMetrics.textColor ||
    !lightThemeMetrics.drawerBackground.includes('1 1 1')
  ) {
    throw new Error(
      `teleported settings did not receive light theme: ${JSON.stringify(lightThemeMetrics)}`,
    )
  }
  await page.getByRole('button', { name: /日常对话/ }).click()
  await page.locator('.vision-model-guide').waitFor({
    state: 'visible',
    timeout: 5_000,
  })
  await page.waitForTimeout(500)
  if (
    !(await page
      .getByText('图片模型 · 快速版', { exact: true })
      .count())
  ) {
    throw new Error('vision model install guidance is missing')
  }
  await page.screenshot({
    path: '/private/tmp/shotai-vision-model-guide.png',
    fullPage: false,
  })
  console.log(
    JSON.stringify(
      {
        longPromptScrollable: true,
        stopButtonVisible: true,
        abortedResponseIgnored: true,
        editActionVisible: true,
        editRegenerates: true,
        messageOutputScrollable: true,
        manualScrollPreservedDuringGeneration: true,
        finishedTypingStateCleared: true,
        lightThemeDrawerReadable: true,
        focusedDesktopLayout: true,
        visionModelGuideVisible: true,
        abortedChatRequests,
        editorMetrics,
        messageScrollMetrics,
        streamingScrollMetrics,
        lightThemeMetrics,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
