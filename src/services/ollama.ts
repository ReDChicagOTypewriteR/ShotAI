import { createSHA256 } from 'hash-wasm'

export const OLLAMA_API_BASE =
  import.meta.env.VITE_OLLAMA_BASE_URL?.replace(/\/$/, '') || '/ollama/api'

export interface OllamaModelDetails {
  format: string
  family: string
  families?: string[]
  parameter_size: string
  quantization_level: string
}

export interface OllamaModel {
  name: string
  model?: string
  modified_at: string
  size: number
  digest: string
  details: OllamaModelDetails
}

export interface OllamaRunningModel extends OllamaModel {
  expires_at: string
  size_vram: number
}

export interface OllamaShowResponse {
  parameters?: string
  template?: string
  capabilities?: string[]
  details: OllamaModelDetails
  model_info?: Record<string, unknown>
}

export interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  thinking?: string
  images?: string[]
}

export interface OllamaGenerationOptions {
  temperature: number
  top_p: number
  num_ctx: number
  num_predict: number
}

interface OllamaEmbedResponse {
  model: string
  embeddings: number[][]
  total_duration?: number
  load_duration?: number
  prompt_eval_count?: number
}

interface OllamaChatChunk {
  message?: {
    role: 'assistant'
    content?: string
    thinking?: string
  }
  done?: boolean
  done_reason?: string
  eval_count?: number
  error?: string
}

interface OllamaImageChunk {
  image?: string
  completed?: number
  total?: number
  done?: boolean
  done_reason?: string
  error?: string
}

interface CreateChunk {
  status?: string
  error?: string
}

export class OllamaApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'OllamaApiError'
  }
}

async function parseError(response: Response) {
  const body = await response.text()
  if (!body) return createProxyAwareError(response.status)

  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string }
    }
    const apiError =
      typeof parsed.error === 'string'
        ? parsed.error.trim()
        : parsed.error?.message?.trim()
    if (
      (response.status === 403 || response.status === 404) &&
      (!apiError || /^(?:forbidden|not found|file not found)$/i.test(apiError))
    ) {
      return createProxyAwareError(response.status)
    }
    return apiError || createProxyAwareError(response.status)
  } catch {
    if (response.status === 403 || response.status === 404) {
      return createProxyAwareError(response.status)
    }
    return body
  }
}

function createProxyAwareError(status: number) {
  if (status === 403) {
    return 'AI 服务拒绝了这次请求。请在运行服务的电脑上重新启动 ShotAI；如果仍然失败，请联系维护人员。'
  }
  if (status === 404) {
    return '没有找到 AI 服务。请确认你是通过 ShotAI 提供的网址打开页面，并检查运行服务的电脑是否已经启动。'
  }
  return 'AI 服务暂时无法完成请求，请稍后重试。'
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${OLLAMA_API_BASE}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new OllamaApiError('无法连接 AI 服务，请确认 ShotAI 服务已经启动')
  }

  if (!response.ok) {
    throw new OllamaApiError(await parseError(response), response.status)
  }
  return (await response.json()) as T
}

async function consumeNdjson<T>(
  response: Response,
  onChunk: (chunk: T) => void,
) {
  if (!response.body) {
    throw new OllamaApiError('AI 服务没有返回内容，请重新尝试')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const chunk = JSON.parse(trimmed) as T & { error?: string }
      if (chunk.error) throw new OllamaApiError(chunk.error)
      onChunk(chunk)
    }

    if (done) break
  }

  if (buffer.trim()) {
    const chunk = JSON.parse(buffer) as T & { error?: string }
    if (chunk.error) throw new OllamaApiError(chunk.error)
    onChunk(chunk)
  }
}

export async function getOllamaVersion() {
  return requestJson<{ version: string }>('/version')
}

export async function listOllamaModels() {
  const response = await requestJson<{ models: OllamaModel[] }>('/tags')
  return response.models
}

export async function listRunningModels() {
  const response = await requestJson<{ models: OllamaRunningModel[] }>('/ps')
  return response.models
}

export async function showOllamaModel(model: string) {
  return requestJson<OllamaShowResponse>('/show', {
    method: 'POST',
    body: JSON.stringify({ model, verbose: false }),
  })
}

export async function deleteOllamaModel(model: string) {
  let response: Response
  try {
    response = await fetch(`${OLLAMA_API_BASE}/delete`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model }),
    })
  } catch {
    throw new OllamaApiError('无法连接 AI 服务，请确认 ShotAI 服务已经启动')
  }
  if (!response.ok) {
    throw new OllamaApiError(await parseError(response), response.status)
  }
}

export async function embedWithOllama(
  model: string,
  input: string | string[],
) {
  const response = await requestJson<OllamaEmbedResponse>('/embed', {
    method: 'POST',
    body: JSON.stringify({
      model,
      input,
      truncate: true,
      keep_alive: '5m',
    }),
  })
  return response.embeddings
}

export async function chatWithOllama(
  model: string,
  messages: OllamaChatMessage[],
  options: {
    signal?: AbortSignal
    think?: boolean
    generation?: OllamaGenerationOptions
    onContent: (content: string) => void
    onThinking?: (thinking: string) => void
    onDone?: (result: { reason?: string; outputCount?: number }) => void
    onIncomplete?: () => void
  },
) {
  async function startChat(think?: boolean) {
    try {
      return await fetch(`${OLLAMA_API_BASE}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          ...(typeof think === 'boolean' ? { think } : {}),
          keep_alive: '5m',
          options: options.generation,
        }),
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new OllamaApiError('无法连接 AI 服务，请确认 ShotAI 服务已经启动')
    }
  }

  let response = await startChat(options.think)
  if (!response.ok) {
    const message = await parseError(response)
    const thinkingUnsupported =
      options.think &&
      /(?:does not support|unsupported).*(?:think|thinking)|(?:think|thinking).*(?:does not support|unsupported)/i.test(
        message,
      )

    if (!thinkingUnsupported) {
      throw new OllamaApiError(message, response.status)
    }

    response = await startChat()
    if (!response.ok) {
      throw new OllamaApiError(await parseError(response), response.status)
    }
  }

  let completionReceived = false
  await consumeNdjson<OllamaChatChunk>(response, (chunk) => {
    if (chunk.message?.thinking) options.onThinking?.(chunk.message.thinking)
    if (chunk.message?.content) options.onContent(chunk.message.content)
    if (chunk.done) {
      completionReceived = true
      options.onDone?.({
        reason: chunk.done_reason,
        outputCount: chunk.eval_count,
      })
    }
  })
  if (!completionReceived) options.onIncomplete?.()
}

export async function generateImageWithOllama(
  model: string,
  prompt: string,
  options: {
    signal?: AbortSignal
    width: number
    height: number
    onProgress?: (completed: number, total: number) => void
  },
) {
  let response: Response
  try {
    response = await fetch(`${OLLAMA_API_BASE}/generate`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/x-ndjson, application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        prompt,
        width: options.width,
        height: options.height,
        stream: true,
      }),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new OllamaApiError('无法连接图片创作服务，请确认 ShotAI 服务已经启动')
  }

  if (!response.ok) {
    throw new OllamaApiError(await parseError(response), response.status)
  }

  let image = ''
  let doneReason: string | undefined
  await consumeNdjson<OllamaImageChunk>(response, (chunk) => {
    if (
      typeof chunk.completed === 'number' &&
      typeof chunk.total === 'number'
    ) {
      options.onProgress?.(chunk.completed, chunk.total)
    }
    if (chunk.image) image = chunk.image
    if (chunk.done) doneReason = chunk.done_reason
  })

  if (!image) {
    throw new OllamaApiError('没有收到生成的图片，请确认所选模型可以创作图片')
  }

  return {
    dataUrl: image.startsWith('data:')
      ? image
      : `data:image/png;base64,${image}`,
    reason: doneReason,
  }
}

export async function calculateFileSha256(
  file: File,
  onProgress?: (percentage: number) => void,
) {
  const hasher = await createSHA256()
  const chunkSize = 8 * 1024 * 1024
  let offset = 0

  hasher.init()
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(file.size, offset + chunkSize))
    hasher.update(new Uint8Array(await chunk.arrayBuffer()))
    offset += chunk.size
    onProgress?.(Math.round((offset / file.size) * 100))
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  }

  return hasher.digest('hex')
}

export async function verifyGgufFile(
  file: File,
  options: { allowMissingMetadata?: boolean } = {},
) {
  if (!file.name.toLowerCase().endsWith('.gguf')) {
    throw new OllamaApiError('请选择以 .gguf 结尾的模型文件')
  }
  if (file.size < 24) throw new OllamaApiError('模型文件不完整或已损坏')

  const headerBuffer = await file.slice(0, 24).arrayBuffer()
  const header = new Uint8Array(headerBuffer)
  const isGguf =
    header[0] === 0x47 &&
    header[1] === 0x47 &&
    header[2] === 0x55 &&
    header[3] === 0x46
  if (!isGguf) throw new OllamaApiError('这个文件不是可用的模型文件，请重新下载')

  const view = new DataView(headerBuffer)
  const version = view.getUint32(4, true)
  const readUint64 = (offset: number) =>
    view.getUint32(offset, true) + view.getUint32(offset + 4, true) * 2 ** 32
  const tensorCount = readUint64(8)
  const metadataCount = readUint64(16)

  if (version < 2 || version > 3) {
    throw new OllamaApiError(
      `这个模型文件使用了当前不支持的 GGUF 版本（${version}），请下载 GGUF V3 版本`,
    )
  }
  if (!Number.isSafeInteger(tensorCount) || tensorCount <= 0) {
    throw new OllamaApiError('这个模型文件没有可用的模型数据，请重新下载')
  }
  if (
    (!Number.isSafeInteger(metadataCount) || metadataCount <= 0) &&
    !options.allowMissingMetadata
  ) {
    throw new OllamaApiError(
      '这个 GGUF 文件缺少模型说明信息，无法作为聊天或图片识别模型导入。如果它是图片生成模型，请把同一下载页中的图片主模型和配套文件一起选择。',
    )
  }
}

function uploadBlobWithProgress(
  file: File,
  digest: string,
  onProgress?: (percentage: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${OLLAMA_API_BASE}/blobs/${digest}`)
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else {
        let message = xhr.responseText
        try {
          message =
            (JSON.parse(xhr.responseText) as { error?: string }).error ||
            xhr.responseText
        } catch {
          // Keep the plain-text Ollama response.
        }
        reject(
          new OllamaApiError(
            message || `模型数据写入失败（HTTP ${xhr.status}）`,
            xhr.status,
          ),
        )
      }
    })
    xhr.addEventListener('error', () => {
      reject(new OllamaApiError('模型文件没有添加成功，请重新启动 AI 服务后再试'))
    })
    xhr.send(file)
  })
}

export async function ensureOllamaBlob(
  file: File,
  sha256: string,
  onProgress?: (percentage: number) => void,
) {
  const digest = `sha256:${sha256}`
  let exists = false

  try {
    const response = await fetch(`${OLLAMA_API_BASE}/blobs/${digest}`, {
      method: 'HEAD',
    })
    exists = response.ok
  } catch {
    throw new OllamaApiError('无法连接 AI 服务，请确认 ShotAI 服务已经启动')
  }

  if (!exists) await uploadBlobWithProgress(file, digest, onProgress)
  else onProgress?.(100)
  return digest
}

export async function createOllamaModel(
  model: string,
  files: Record<string, string>,
  onStatus?: (status: string) => void,
) {
  const response = await fetch(`${OLLAMA_API_BASE}/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      files,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new OllamaApiError(await parseError(response), response.status)
  }

  try {
    await consumeNdjson<CreateChunk>(response, (chunk) => {
      if (chunk.status) onStatus?.(chunk.status)
    })
  } catch (error) {
    if (
      error instanceof OllamaApiError &&
      /failed to validate GGUF with llama-quantize|unknown model architecture/i.test(
        error.message,
      )
    ) {
      throw new OllamaApiError(
        '这个 GGUF 文件没有通过完整检查。请确认文件下载完整；如果是图片模型，请同时选择同一下载页、同一版本的主模型和 mmproj 配套文件。',
        error.status,
      )
    }
    throw error
  }
}

export async function testOllamaModel(model: string) {
  await requestJson('/chat', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: '请仅回复：OK' }],
      stream: false,
      keep_alive: '2m',
      options: { num_predict: 8 },
    }),
  })
}

export function normalizeOllamaModelName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._/-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-/.]+|[-/.]+$/g, '')
  return normalized || `shotai-model-${Date.now()}`
}

export function formatModelSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知'
  const gb = bytes / 1024 / 1024 / 1024
  return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

export function formatDigest(digest: string) {
  const value = digest.replace(/^sha256:/, '')
  return value.length > 20 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value
}
