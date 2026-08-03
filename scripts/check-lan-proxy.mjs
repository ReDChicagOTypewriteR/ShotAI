import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const upstreamPort = 18134
const imageUpstreamPort = 18135
const lanPort = 18080
let receivedHeaders = null
let receivedImageHeaders = null
let receivedVisionImage = null
let receivedReferenceImage = null

const mockOllama = createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/show') {
    receivedHeaders = request.headers

    if (request.headers.origin) {
      response.writeHead(403, { 'Content-Type': 'text/plain' })
      response.end('Forbidden')
      return
    }

    for await (const _chunk of request) {
      // Drain the body so the proxy can finish cleanly.
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ capabilities: ['completion'] }))
    return
  }

  if (request.method === 'POST' && request.url === '/api/chat') {
    receivedHeaders = request.headers
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    receivedVisionImage = body.messages?.findLast(
      (message) => message.role === 'user',
    )?.images?.[0]
    response.writeHead(200, {
      'Content-Type': 'application/x-ndjson',
    })
    response.end(
      `${JSON.stringify({
        message: { role: 'assistant', content: '图片收到' },
        done: true,
      })}\n`,
    )
    return
  }

  if (request.method === 'GET' && request.url === '/api/version') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ version: 'proxy-test' }))
    return
  }

  response.writeHead(404)
  response.end()
})

mockOllama.listen(upstreamPort, '127.0.0.1')
await once(mockOllama, 'listening')

const mockImageRuntime = createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/v1/models') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'local-image' }] }))
    return
  }

  if (
    request.method === 'POST' &&
    request.url === '/v1/images/generations'
  ) {
    receivedImageHeaders = request.headers
    for await (const _chunk of request) {
      // Drain the body so the proxy can finish cleanly.
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ data: [{ b64_json: 'test-image' }] }))
    return
  }

  if (request.method === 'POST' && request.url === '/sdapi/v1/img2img') {
    receivedImageHeaders = request.headers
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    receivedReferenceImage = body.init_images?.[0]
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ images: ['edited-image'] }))
    return
  }

  response.writeHead(404)
  response.end()
})

mockImageRuntime.listen(imageUpstreamPort, '127.0.0.1')
await once(mockImageRuntime, 'listening')

const lanServer = spawn(
  process.execPath,
  [join(projectDirectory, 'scripts', 'serve-lan.mjs')],
  {
    cwd: projectDirectory,
    env: {
      ...process.env,
      SHOTAI_LAN_HOST: '127.0.0.1',
      SHOTAI_LAN_PORT: String(lanPort),
      SHOTAI_OLLAMA_URL: `http://127.0.0.1:${upstreamPort}`,
      SHOTAI_IMAGE_RUNTIME_URL: `http://127.0.0.1:${imageUpstreamPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let output = ''
lanServer.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
lanServer.stderr.on('data', (chunk) => {
  output += chunk.toString()
})

async function waitForLanServer() {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (output.includes('ShotAI 内网网页版已启动')) return
    if (lanServer.exitCode !== null) {
      throw new Error(`ShotAI LAN 服务提前退出：\n${output}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`等待 ShotAI LAN 服务超时：\n${output}`)
}

try {
  await waitForLanServer()

  const response = await fetch(
    `http://127.0.0.1:${lanPort}/ollama/api/show`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `http://192.168.10.20:${lanPort}`,
        Referer: `http://192.168.10.20:${lanPort}/`,
      },
      body: JSON.stringify({ model: 'proxy-test' }),
    },
  )

  assert.equal(response.status, 200)
  assert.equal(receivedHeaders?.origin, undefined)
  assert.equal(receivedHeaders?.referer, undefined)
  assert.equal(receivedHeaders?.host, `127.0.0.1:${upstreamPort}`)
  assert.equal(receivedHeaders?.['x-shotai-proxy'], 'lan')

  const largeVisionImage = Buffer.alloc(2 * 1024 * 1024, 0x5a).toString(
    'base64',
  )
  const visionResponse = await fetch(
    `http://127.0.0.1:${lanPort}/ollama/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `http://192.168.10.20:${lanPort}`,
        Referer: `http://192.168.10.20:${lanPort}/`,
      },
      body: JSON.stringify({
        model: 'vision-proxy-test',
        messages: [
          {
            role: 'user',
            content: '请识别图片',
            images: [largeVisionImage],
          },
        ],
        stream: true,
      }),
    },
  )
  assert.equal(visionResponse.status, 200)
  assert.equal(receivedVisionImage, largeVisionImage)
  assert.equal(receivedHeaders?.origin, undefined)
  assert.equal(receivedHeaders?.referer, undefined)

  const imageResponse = await fetch(
    `http://127.0.0.1:${lanPort}/image/v1/images/generations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `http://192.168.10.20:${lanPort}`,
        Referer: `http://192.168.10.20:${lanPort}/`,
      },
      body: JSON.stringify({ prompt: 'proxy test' }),
    },
  )
  assert.equal(imageResponse.status, 200)
  assert.equal(receivedImageHeaders?.origin, undefined)
  assert.equal(receivedImageHeaders?.referer, undefined)
  assert.equal(
    receivedImageHeaders?.host,
    `127.0.0.1:${imageUpstreamPort}`,
  )
  assert.equal(receivedImageHeaders?.['x-shotai-proxy'], 'shotai-image')

  const referenceImage = `data:image/jpeg;base64,${largeVisionImage}`
  const imageEditResponse = await fetch(
    `http://127.0.0.1:${lanPort}/image/sdapi/v1/img2img`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: `http://192.168.10.20:${lanPort}`,
        Referer: `http://192.168.10.20:${lanPort}/`,
      },
      body: JSON.stringify({
        prompt: 'edit proxy test',
        init_images: [referenceImage],
        denoising_strength: 0.55,
      }),
    },
  )
  assert.equal(imageEditResponse.status, 200)
  assert.equal(receivedReferenceImage, referenceImage)
  assert.equal(receivedImageHeaders?.origin, undefined)
  assert.equal(receivedImageHeaders?.referer, undefined)

  const imageStatusResponse = await fetch(
    `http://127.0.0.1:${lanPort}/image-runtime/status`,
  )
  const imageStatus = await imageStatusResponse.json()
  assert.equal(imageStatus.serviceOnline, true)

  console.log(
    'LAN proxy check passed: browser Origin/Referer are removed for Ollama, image generation, and image editing.',
  )
} finally {
  lanServer.kill('SIGTERM')
  mockOllama.close()
  mockImageRuntime.close()
  await Promise.allSettled([
    once(lanServer, 'exit'),
    once(mockOllama, 'close'),
    once(mockImageRuntime, 'close'),
  ])
}
