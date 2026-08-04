import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  headless: true,
  executablePath:
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
})
let created = false
let createPayload
const uploadedDigests = new Set()

function createFakeGguf(label) {
  const header = Buffer.alloc(24)
  header.write('GGUF', 0, 'ascii')
  header.writeUInt32LE(3, 4)
  header.writeBigUInt64LE(1n, 8)
  header.writeBigUInt64LE(1n, 16)
  return Buffer.concat([header, Buffer.from(label)])
}

function createMetadataFreeGguf() {
  const header = Buffer.alloc(24)
  header.write('GGUF', 0, 'ascii')
  header.writeUInt32LE(3, 4)
  header.writeBigUInt64LE(453n, 8)
  header.writeBigUInt64LE(0n, 16)
  return header
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } })
  await page.route('**/ollama/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const pathname = url.pathname

    if (pathname.endsWith('/version')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ version: '0.30.8-vision-import-test' }),
      })
    }
    if (pathname.endsWith('/tags')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          models: created
            ? [
                {
                  name: 'shotai-vision-test:latest',
                  model: 'shotai-vision-test:latest',
                  modified_at: new Date().toISOString(),
                  size: 32,
                  digest: 'sha256:created-vision-model',
                  details: {
                    format: 'gguf',
                    family: 'qwen3_5',
                    families: ['qwen3_5'],
                    parameter_size: '9B',
                    quantization_level: 'Q4_K_M',
                  },
                },
              ]
            : [],
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
            family: 'qwen3_5',
            parameter_size: '9B',
            quantization_level: 'Q4_K_M',
          },
          capabilities: ['completion', 'vision'],
          model_info: { 'qwen35.context_length': 32768 },
        }),
      })
    }
    if (pathname.includes('/blobs/')) {
      const digest = pathname.split('/blobs/')[1]
      if (request.method() === 'HEAD') {
        return route.fulfill({ status: uploadedDigests.has(digest) ? 200 : 404 })
      }
      uploadedDigests.add(digest)
      return route.fulfill({ status: 201 })
    }
    if (pathname.endsWith('/create')) {
      createPayload = request.postDataJSON()
      created = true
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson' },
        body: `${JSON.stringify({ status: 'success' })}\n`,
      })
    }
    if (pathname.endsWith('/chat')) {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          model: 'shotai-vision-test',
          message: { role: 'assistant', content: 'OK' },
          done: true,
        }),
      })
    }
    return route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unhandled test route: ${pathname}` }),
    })
  })

  await page.goto('http://127.0.0.1:5173/#workbench', {
    waitUntil: 'networkidle',
    timeout: 20_000,
  })
  await page.locator('.composer-tool-button').click()
  await page.getByText('管理 AI 模型', { exact: true }).click()
  await page
    .getByLabel('模型管理')
    .getByRole('button', { name: '添加模型', exact: true })
    .click()

  await page.locator('.model-uploader input[type="file"]').setInputFiles({
    name: 'old-vision-model.gguf',
    mimeType: 'application/octet-stream',
    buffer: createMetadataFreeGguf(),
  })
  await page.getByRole('button', { name: '下一步' }).click()
  const validationMessage = page.locator('.el-message--error').last()
  await validationMessage.waitFor({ state: 'visible', timeout: 10_000 })
  const validationText = await validationMessage.innerText()
  if (!validationText.includes('缺少模型说明信息')) {
    throw new Error(`unexpected GGUF validation message: ${validationText}`)
  }
  await page.getByRole('button', { name: '取消' }).click()
  await page.locator('.composer-tool-button').click()
  await page.getByText('管理 AI 模型', { exact: true }).click()
  await page
    .getByLabel('模型管理')
    .getByRole('button', { name: '添加模型', exact: true })
    .click()

  await page.locator('.model-uploader input[type="file"]').setInputFiles([
    {
      name: 'Qwen3.5-9B-Q4_K_M.gguf',
      mimeType: 'application/octet-stream',
      buffer: createFakeGguf('shotai-vision-import-test'),
    },
    {
      name: 'mmproj-Qwen3.5-9B-F16.gguf',
      mimeType: 'application/octet-stream',
      buffer: createFakeGguf('projector'),
    },
  ])

  await page.getByRole('button', { name: '下一步' }).click()
  await page.waitForFunction(
    () => document.body.innerText.includes('图片识别配套文件'),
    undefined,
    { timeout: 20_000 },
  )
  await page.getByLabel('显示名称').fill('shotai-vision-test')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '开始导入' }).click()
  await page.waitForFunction(
    () => document.body.innerText.includes('模型导入成功'),
    undefined,
    { timeout: 20_000 },
  )

  const files = createPayload?.files ?? {}
  if (Object.keys(files).length !== 2) {
    throw new Error(
      `expected two GGUF files in one create request, received ${JSON.stringify(files)}`,
    )
  }
  if (
    !files['Qwen3.5-9B-Q4_K_M.gguf'] ||
    !files['mmproj-Qwen3.5-9B-F16.gguf']
  ) {
    throw new Error(`create request lost a vision model component: ${JSON.stringify(files)}`)
  }
  if (createPayload.model !== 'shotai-vision-test') {
    throw new Error(`unexpected model name: ${createPayload.model}`)
  }

  console.log(
    JSON.stringify(
      {
        pairedFiles: Object.keys(files),
        oneCreateRequest: true,
        metadataFreeGgufRejected: true,
        visionCapabilityVerified: true,
        createdModel: createPayload.model,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
