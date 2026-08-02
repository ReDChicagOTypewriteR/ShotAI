import { createHash } from 'node:crypto'

const base = 'http://127.0.0.1:5173/ollama/api'

async function expectOk(response, label) {
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`)
  return response
}

const version = await (
  await expectOk(await fetch(`${base}/version`), 'version')
).json()
const tags = await (
  await expectOk(await fetch(`${base}/tags`), 'tags')
).json()

const chatResponse = await expectOk(
  await fetch(`${base}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: tags.models[0].model,
      messages: [{ role: 'user', content: '测试' }],
      stream: true,
    }),
  }),
  'chat',
)
const chatText = await chatResponse.text()
if (!chatText.includes('真实流式响应')) throw new Error('chat: missing stream')

const gguf = Buffer.from('GGUF-shotai-contract-test')
const digest = `sha256:${createHash('sha256').update(gguf).digest('hex')}`
await expectOk(
  await fetch(`${base}/blobs/${digest}`, { method: 'POST', body: gguf }),
  'blob upload',
)
await expectOk(
  await fetch(`${base}/blobs/${digest}`, { method: 'HEAD' }),
  'blob head',
)

const createResponse = await expectOk(
  await fetch(`${base}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'shotai-import-test',
      files: { 'test.gguf': digest },
      stream: true,
    }),
  }),
  'create',
)
const createText = await createResponse.text()
if (!createText.includes('"status":"success"')) {
  throw new Error('create: missing success status')
}

console.log(
  JSON.stringify(
    {
      version: version.version,
      models: tags.models.length,
      chatStream: 'ok',
      blobUpload: 'ok',
      modelCreate: 'ok',
    },
    null,
    2,
  ),
)
