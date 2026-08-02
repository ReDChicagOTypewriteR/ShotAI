import { createServer } from 'node:http'

const model = {
  name: 'shotai-test:latest',
  model: 'shotai-test:latest',
  modified_at: new Date().toISOString(),
  size: 536870912,
  digest: 'sha256:9f4b9c0f5628ef4580f8a0a0dfe16bb89d213ad94ce613c977da2fa2c775e96b',
  details: {
    format: 'gguf',
    family: 'qwen3',
    families: ['qwen3'],
    parameter_size: '0.6B',
    quantization_level: 'Q4_K_M',
  },
}

const blobs = new Set()

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' })
  response.end(JSON.stringify(body))
}

function ndjson(response, chunks) {
  response.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
  let index = 0
  const timer = setInterval(() => {
    response.write(`${JSON.stringify(chunks[index])}\n`)
    index += 1
    if (index >= chunks.length) {
      clearInterval(timer)
      response.end()
    }
  }, 20)
}

async function body(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return Buffer.concat(chunks)
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:11434')

  if (request.method === 'GET' && url.pathname === '/api/version') {
    return json(response, 200, { version: '0.30.8-mock' })
  }
  if (request.method === 'GET' && url.pathname === '/api/tags') {
    return json(response, 200, { models: [model] })
  }
  if (request.method === 'GET' && url.pathname === '/api/ps') {
    return json(response, 200, { models: [] })
  }
  if (request.method === 'POST' && url.pathname === '/api/show') {
    return json(response, 200, {
      details: model.details,
      capabilities: ['completion'],
      model_info: { 'qwen3.context_length': 32768 },
    })
  }
  if (request.method === 'POST' && url.pathname === '/api/chat') {
    const payload = JSON.parse((await body(request)).toString() || '{}')
    if (payload.think) {
      return json(response, 400, {
        error: `"${payload.model}" does not support thinking`,
      })
    }
    if (payload.stream === false) {
      return json(response, 200, {
        model: payload.model,
        message: { role: 'assistant', content: 'OK' },
        done: true,
      })
    }
    return ndjson(response, [
      {
        model: payload.model,
        message: { role: 'assistant', content: '这是来自 Ollama API 的' },
        done: false,
      },
      {
        model: payload.model,
        message: { role: 'assistant', content: '真实流式响应。' },
        done: true,
      },
    ])
  }
  if (url.pathname.startsWith('/api/blobs/')) {
    const digest = decodeURIComponent(url.pathname.slice('/api/blobs/'.length))
    if (request.method === 'HEAD') {
      response.writeHead(blobs.has(digest) ? 200 : 404)
      return response.end()
    }
    if (request.method === 'POST') {
      await body(request)
      blobs.add(digest)
      response.writeHead(201)
      return response.end()
    }
  }
  if (request.method === 'POST' && url.pathname === '/api/create') {
    await body(request)
    return ndjson(response, [
      { status: 'parsing GGUF' },
      { status: 'writing manifest' },
      { status: 'success' },
    ])
  }

  return json(response, 404, { error: `mock endpoint not found: ${url.pathname}` })
})

server.listen(11434, '127.0.0.1', () => {
  console.log('ShotAI Ollama contract mock: http://127.0.0.1:11434')
})
