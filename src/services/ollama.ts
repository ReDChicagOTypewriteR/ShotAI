import { createSHA256 } from 'hash-wasm'
import { clientHeaders } from './clientIdentity'
import { runtimeSchema } from './taskTools'

export const OLLAMA_API_BASE =
  import.meta.env.VITE_OLLAMA_BASE_URL?.replace(/\/$/, '') || '/ollama/api'

const modelDetails = new Map<string, Promise<OllamaShowResponse>>()
const modelDigests = new Map<string, string>()
const compatibility = new Map<string, { skipStructuredThinking?: boolean; format?: 'json' | 'text' }>()
let versionRequest: Promise<{ version: string }> | undefined
let versionCheckedAt = 0
let runtimeVersion = ''

function forgetModel(model: string) {
  modelDetails.delete(model)
  compatibility.delete(model)
}

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
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  thinking?: string
  images?: string[]
  tool_name?: string
  tool_calls?: OllamaToolCall[]
}
export interface OllamaToolCall { function: { name: string; arguments: Record<string, unknown>; index?: number } }
export interface OllamaTool { type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }

export interface OllamaGenerationOptions {
  temperature: number
  top_p: number
  num_ctx: number
  num_predict: number
  repeat_penalty?: number
  repeat_last_n?: number
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
    tool_calls?: OllamaToolCall[]
  }
  done?: boolean
  done_reason?: string
  eval_count?: number
  error?: string
}

interface OllamaChatResponse {
  message?: {
    role?: 'assistant'
    content?: string
    thinking?: string
  }
  response?: string
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

function apiErrorMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (value && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    return value.message.trim() || undefined
  }
}

function decodeStreamError(error: unknown, streamStatus?: number) {
  let message = apiErrorMessage(error)
  if (typeof error === 'string' && error.trimStart().startsWith('{')) {
    try { error = JSON.parse(error) } catch { /* Retain the original error text. */ }
  }
  if (error && typeof error === 'object' && 'error' in error) error = error.error
  message = apiErrorMessage(error) ?? message
  const status = error && typeof error === 'object' && 'code' in error && typeof error.code === 'number'
    ? error.code : streamStatus
  return new OllamaApiError(message || 'AI 服务返回了错误', status)
}

async function parseError(response: Response) {
  const body = await response.text()
  if (!body) return createProxyAwareError(response.status)

  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string }
    }
    const apiError = parsed.error ? decodeStreamError(parsed.error).message : undefined
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
        ...clientHeaders(init?.signal instanceof AbortSignal ? init.signal : undefined),
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch (error) {
    if (init?.signal?.aborted) throw error
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

  function consumeLine(line: string) {
    if (line.trim()) {
      const chunk = JSON.parse(line) as T & { error?: unknown; status?: number }
      if (chunk.error) throw decodeStreamError(chunk.error, chunk.status)
      onChunk(chunk)
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      lines.forEach(consumeLine)
      if (done) break
    }
    consumeLine(buffer)
  } catch (error) {
    // Stop reading the failed stream before opening a replacement request.
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}

export function getOllamaVersion(refresh = false) {
  if (refresh || !versionRequest || Date.now() - versionCheckedAt > 60_000) {
    versionCheckedAt = Date.now()
    versionRequest = requestJson<{ version: string }>('/version', refresh ? { headers: { 'X-ShotAI-Refresh': '1' } } : undefined).then(result => {
      if (runtimeVersion && runtimeVersion !== result.version) {
        modelDetails.clear()
        compatibility.clear()
      }
      runtimeVersion = result.version
      return result
    }).catch(error => { versionRequest = undefined; throw error })
  }
  return versionRequest
}

export async function listOllamaModels() {
  const response = await requestJson<{ models: OllamaModel[] }>('/tags')
  const current = new Set(response.models.flatMap(model => [model.name, model.model || model.name]))
  for (const name of modelDigests.keys()) {
    if (!current.has(name)) { forgetModel(name); modelDigests.delete(name) }
  }
  for (const model of response.models) {
    for (const name of new Set([model.name, model.model || model.name])) {
      if (modelDigests.get(name) !== model.digest) forgetModel(name)
      modelDigests.set(name, model.digest)
    }
  }
  return response.models
}

export async function listRunningModels() {
  const response = await requestJson<{ models: OllamaRunningModel[] }>('/ps')
  return response.models
}

export function showOllamaModel(model: string, refresh = false) {
  if (refresh) forgetModel(model)
  let pending = modelDetails.get(model)
  if (!pending) {
    pending = requestJson<OllamaShowResponse>('/show', {
    method: 'POST',
    ...(refresh ? { headers: { 'X-ShotAI-Refresh': '1' } } : {}),
    body: JSON.stringify({ model, verbose: false }),
    }).catch(error => { modelDetails.delete(model); throw error })
    modelDetails.set(model, pending)
  }
  return pending
}

export async function deleteOllamaModel(model: string) {
  forgetModel(model)
  // Deleting the manifest alone may leave a loaded runner usable until expiry.
  await requestJson('/generate', {
    method: 'POST',
    body: JSON.stringify({ model, keep_alive: 0, stream: false }),
  })
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
  signal?: AbortSignal,
) {
  const response = await requestJson<OllamaEmbedResponse>('/embed', {
    method: 'POST',
    signal,
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
    format?: 'json' | Record<string, unknown>
    tools?: OllamaTool[]
    stage?: string
    generation?: OllamaGenerationOptions
    onContent: (content: string) => void
    onThinking?: (thinking: string) => void
    onReasoningFallback?: () => void
    onToolCalls?: (calls: OllamaToolCall[]) => void
    onDone?: (result: { reason?: string; outputCount?: number }) => void
    onIncomplete?: () => void
  },
) {
  if (compatibility.size >= 128 && !compatibility.has(model)) compatibility.delete(compatibility.keys().next().value!)
  const profile = compatibility.get(model) || {}
  compatibility.set(model, profile)
  const structured = Boolean(options.format || options.tools)
  let think = structured && profile.skipStructuredThinking ? false : options.think
  let format = typeof options.format === 'object' ? runtimeSchema(options.format) : options.format
  const tools = options.tools?.map(tool => ({ ...tool, function: {
    ...tool.function, parameters: runtimeSchema(tool.function.parameters),
  } }))
  let requestMessages = messages
  function relaxFormat() {
    if (typeof format === 'object') {
      const instruction = `只返回符合以下结构的单个 JSON 对象，不添加说明或代码块。\n${JSON.stringify(format)}`
      const [first, ...rest] = messages
      requestMessages = first?.role === 'system'
        ? [{ ...first, content: `${first.content}\n\n${instruction}` }, ...rest]
        : [{ role: 'system', content: instruction }, ...messages]
      format = 'json'
    } else format = undefined
  }
  if (format && profile.format) {
    relaxFormat()
    if (profile.format === 'text') format = undefined
  }
  async function startChat() {
    try {
      return await fetch(`${OLLAMA_API_BASE}/chat`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...clientHeaders(options.signal),
          ...(options.stage ? { 'X-ShotAI-Task-Stage': options.stage } : {}) },
        body: JSON.stringify({
          model,
          messages: requestMessages,
          stream: true,
          ...(format ? { format } : {}),
          ...(tools ? { tools } : {}),
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

  while (true) {
    options.signal?.throwIfAborted()
    let receivedOutput = false
    let completionReceived = false
    let pendingThinking = ''
    try {
      const response = await startChat()
      if (!response.ok) throw new OllamaApiError(await parseError(response), response.status)
      await consumeNdjson<OllamaChatChunk>(response, (chunk) => {
        const message = chunk.message
        if (message?.thinking) {
          // A structured request may start grammar sampling after streaming reasoning.
          if ((options.format || options.tools) && !receivedOutput) {
            if (options.onThinking) pendingThinking += message.thinking
          } else {
            receivedOutput = true
            options.onThinking?.(message.thinking)
          }
        }
        if (message?.tool_calls?.length || message?.content || chunk.done) {
          receivedOutput = true
          if (pendingThinking) {
            options.onThinking?.(pendingThinking)
            pendingThinking = ''
          }
        }
        if (message?.tool_calls?.length) options.onToolCalls?.(message.tool_calls)
        if (message?.content) options.onContent(message.content)
        if (chunk.done) {
          completionReceived = true
          options.onDone?.({ reason: chunk.done_reason, outputCount: chunk.eval_count })
        }
      })
    } catch (error) {
      options.signal?.throwIfAborted()
      if (receivedOutput || !(error instanceof OllamaApiError)) throw error
      if (think && /(?:does not support|unsupported).*(?:think|thinking)|(?:think|thinking).*(?:does not support|unsupported)/i.test(error.message)) {
        think = undefined
        continue
      }
      if (!/failed to (?:parse|compile) (?:the )?grammar/i.test(error.message)) throw error
      if (think === true && (options.format || options.tools)) {
        // Keep the output contract on the first retry and skip the reasoning phase.
        think = false
        profile.skipStructuredThinking = true
        options.onReasoningFallback?.()
        continue
      }
      if (!format) throw error
      profile.format = typeof format === 'object' ? 'json' : 'text'
      relaxFormat()
      continue
    }
    if (!completionReceived) options.onIncomplete?.()
    return
  }
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
        ...clientHeaders(),
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

export interface ImportedModelBlob {
  digest: string
  sha256: string
  reused: boolean
  fastPath: boolean
}

export function importOllamaModelFile(
  file: File,
  onProgress?: (percentage: number) => void,
  onRegistering?: () => void,
) {
  return new Promise<ImportedModelBlob>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(
      'PUT',
      `/shotai/model-import/files/${encodeURIComponent(file.name)}`,
    )
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    })
    xhr.upload.addEventListener('load', () => onRegistering?.())
    xhr.addEventListener('load', () => {
      let body: Partial<ImportedModelBlob> & { error?: string } = {}
      try {
        body = JSON.parse(xhr.responseText || '{}')
      } catch {
        // A plain-text response is handled by the fallback message below.
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.digest && body.sha256) {
        resolve({
          digest: body.digest,
          sha256: body.sha256,
          reused: Boolean(body.reused),
          fastPath: Boolean(body.fastPath),
        })
        return
      }
      reject(
        new OllamaApiError(
          body.error || xhr.responseText || `模型数据写入失败（HTTP ${xhr.status}）`,
          xhr.status,
        ),
      )
    })
    xhr.addEventListener('error', () => {
      reject(new OllamaApiError('模型文件没有添加成功，请重新启动 ShotAI 后再试'))
    })
    xhr.send(file)
  })
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
    forgetModel(model)
  } catch (error) {
    if (
      error instanceof OllamaApiError &&
      /failed to validate GGUF with llama-quantize|unknown model architecture|cannot get current path/i.test(
        error.message,
      )
    ) {
      throw new OllamaApiError(
        `${/cannot get current path/i.test(error.message)
          ? '模型运行进程的工作目录已失效，请从托盘退出 ShotAI 后重新启动。'
          : /unknown model architecture/i.test(error.message)
            ? '当前运行组件不支持此模型架构；这不代表模型文件下载损坏。'
            : '运行组件的 GGUF 校验失败，可能是格式兼容、文件完整性或校验进程异常，请查看下面的原始错误。'}\n原始错误：${error.message}`,
        error.status,
      )
    }
    throw error
  }
}

export async function testOllamaModel(model: string) {
  const marker = 'SHOTAI_OK'
  const requestBody = (includeThink: boolean) => ({
    model,
    messages: [
      {
        role: 'system',
        content: `你正在进行模型可用性检查。忽略其他内容，只回复英文标记 ${marker}，不要解释。`,
      },
      {
        role: 'user',
        content: `请严格回复：${marker}`,
      },
    ],
    stream: false,
    keep_alive: '2m',
    ...(includeThink ? { think: false } : {}),
    options: {
      temperature: 0,
      top_p: 0.1,
      num_ctx: 2048,
      num_predict: 128,
    },
  })

  let result: OllamaChatResponse
  try {
    result = await requestJson<OllamaChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify(requestBody(true)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/(?:think|thinking)/i.test(message)) throw error
    result = await requestJson<OllamaChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify(requestBody(false)),
    })
  }

  const output = [
    result.message?.thinking,
    result.message?.content,
    result.response,
  ]
    .filter(Boolean)
    .join('\n')
    .trim()
  if (!output.toUpperCase().includes(marker)) {
    const preview = output.replace(/\s+/g, ' ').slice(0, 300) || '没有返回文字'
    throw new OllamaApiError(
      `模型能够载入，但没有遵循最基本的对话指令。它可能不是聊天模型、聊天模板不兼容，或 GGUF 文件有误。实际返回：${preview}`,
    )
  }
  return output
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
