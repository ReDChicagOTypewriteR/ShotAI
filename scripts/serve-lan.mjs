import {
  appendFileSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  statfsSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import {
  cpus,
  freemem,
  hostname,
  networkInterfaces,
  platform as operatingSystemPlatform,
  release as operatingSystemRelease,
  totalmem,
  uptime,
} from 'node:os'
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { InferenceScheduler } from './inference-scheduler.mjs'
import { saveImportDiagnostic } from './import-diagnostics.mjs'
import { ModelMaintenance, writeTaskEvent } from './model-maintenance.mjs'
import { inspectModel, loadedModelStatus, runtimeJson } from './model-health.mjs'
import { normalizeRemoteAddress, constantTimeEqual, parseCookies } from './request-permissions.mjs'
import { TaskRegistry } from './task-registry.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory =
  scriptDirectory.endsWith(`${process.platform === 'win32' ? '\\' : '/'}scripts`)
    ? dirname(scriptDirectory)
    : scriptDirectory
const dataDirectory = process.env.SHOTAI_DATA_ROOT
  ? resolve(process.env.SHOTAI_DATA_ROOT)
  : projectDirectory

const webDirectoryCandidates = [
  process.env.SHOTAI_WEB_ROOT
    ? resolve(process.env.SHOTAI_WEB_ROOT)
    : '',
  join(scriptDirectory, 'web'),
  join(projectDirectory, 'dist'),
].filter(Boolean)
const webDirectory = webDirectoryCandidates.find((candidate) =>
  existsSync(join(candidate, 'index.html')),
)

if (!webDirectory) {
  console.error('未找到网页构建产物。请先执行 npm run build。')
  process.exit(1)
}

const configCandidates = [
  process.env.SHOTAI_CONFIG_PATH
    ? resolve(process.env.SHOTAI_CONFIG_PATH)
    : '',
  join(scriptDirectory, 'lan.config.json'),
  join(projectDirectory, 'lan.config.json'),
].filter(Boolean)
const configPath = configCandidates.find((candidate) => existsSync(candidate))
const fileConfig = configPath
  ? JSON.parse(readFileSync(configPath, 'utf8'))
  : {}

const host = process.env.SHOTAI_LAN_HOST || fileConfig.host || '0.0.0.0'
const port = Number(process.env.SHOTAI_LAN_PORT || fileConfig.port || 9090)
const ollamaUrl = new URL(
  process.env.SHOTAI_OLLAMA_URL ||
    fileConfig.ollamaUrl ||
    'http://127.0.0.1:11434',
)
const imageRuntimeConfig = fileConfig.imageRuntime || {}
const imageRuntimeUrl = new URL(
  process.env.SHOTAI_IMAGE_RUNTIME_URL ||
    imageRuntimeConfig.url ||
    'http://127.0.0.1:1234',
)
const imageModelDirectory = process.env.SHOTAI_IMAGE_MODEL_DIRECTORY
  ? resolve(process.env.SHOTAI_IMAGE_MODEL_DIRECTORY)
  : join(dataDirectory, 'models', 'image')
const imageRuntimeDirectory = process.env.SHOTAI_IMAGE_RUNTIME_DIRECTORY
  ? resolve(process.env.SHOTAI_IMAGE_RUNTIME_DIRECTORY)
  : join(dataDirectory, 'runtime', 'image')
const ollamaModelDirectory = join(dataDirectory, 'models', 'ollama')
const ollamaRuntimeSource = process.env.SHOTAI_OLLAMA_SOURCE || 'external'
const ollamaRuntimePid = Number(process.env.SHOTAI_OLLAMA_PID || 0)
const ollamaRuntimeModelDirectory =
  process.env.SHOTAI_OLLAMA_MODEL_DIRECTORY || ollamaModelDirectory
const ollamaRuntimeIsolated = process.env.SHOTAI_OLLAMA_ISOLATED === '1'
const systemOllamaDetected = process.env.SHOTAI_SYSTEM_OLLAMA_DETECTED === '1'
const ollamaRuntimeComputeLibrary =
  process.env.SHOTAI_OLLAMA_COMPUTE_LIBRARY || ''
const ollamaRuntimeOffline = process.env.SHOTAI_OLLAMA_OFFLINE === '1'
const ollamaRuntimeLogPath = process.env.SHOTAI_OLLAMA_LOG_PATH
  ? resolve(process.env.SHOTAI_OLLAMA_LOG_PATH)
  : ''
const modelImportLogPath = process.env.SHOTAI_MODEL_IMPORT_LOG_PATH
  ? resolve(process.env.SHOTAI_MODEL_IMPORT_LOG_PATH)
  : join(dataDirectory, 'logs', 'ShotAI-model-import.log')
const installModelImportLogPath = process.env.SHOTAI_INSTALL_MODEL_IMPORT_LOG_PATH
  ? resolve(process.env.SHOTAI_INSTALL_MODEL_IMPORT_LOG_PATH)
  : ''
const runtimeLogDirectory = process.env.SHOTAI_LOG_DIRECTORY
  ? resolve(process.env.SHOTAI_LOG_DIRECTORY)
  : join(dataDirectory, 'logs')
const releaseVersion = process.env.SHOTAI_VERSION || fileConfig.version || '1.0.0'
const allowLanAdministration = fileConfig.allowLanAdministration === true
const monitorConfig = fileConfig.monitoring || {}
const concurrencyConfig = fileConfig.concurrency || {}
const maximumActiveUsers = Math.max(
  1,
  Math.min(5, Number(process.env.SHOTAI_MAX_ACTIVE_USERS || concurrencyConfig.maxActiveUsers || 5) || 5),
)
const maximumParallelInferences = Math.max(
  1,
  Math.min(
    maximumActiveUsers,
    Number(process.env.SHOTAI_MAX_PARALLEL_INFERENCES || concurrencyConfig.maxParallelInferences || 5) || 5,
  ),
)
const monitorUsername = String(
  process.env.SHOTAI_MONITOR_USERNAME || monitorConfig.username || 'admin',
)
const monitorPassword = String(
  process.env.SHOTAI_MONITOR_PASSWORD || monitorConfig.password || 'alexjoker443477',
)
const monitorSessions = new Map()
const monitorLoginFailures = new Map()
const connectedClients = new Map()
const MONITOR_SESSION_COOKIE = 'shotai_monitor_session'
const MONITOR_SESSION_TTL_MS = 8 * 60 * 60 * 1000
const CLIENT_ONLINE_TTL_MS = 70 * 1000
let serverStartedAt = Date.now()
let requestCount = 0
let previousCpuSnapshot = null
let gpuSnapshot = { checkedAt: 0, value: null }
const modelOperationState = {
  activeCount: 0,
  stage: 'idle',
  status: '',
  startedAt: 0,
  completedAt: 0,
  transferredBytes: 0,
  totalBytes: 0,
}
globalThis.__shotaiModelOperationState = modelOperationState
let schedulingResources = { checkedAt: 0, value: null }
let resourceRefresh = null
const scheduler = new InferenceScheduler({ maxClients: maximumActiveUsers, ceiling: maximumParallelInferences,
  resourceProvider: async () => {
    if (Date.now() - schedulingResources.checkedAt < 2000) return schedulingResources.value
    if (resourceRefresh) return resourceRefresh
    resourceRefresh = (async () => {
      const [gpu, tags, ps] = await Promise.all([
        readGpuUsage(), runtimeJson(ollamaUrl, '/api/tags').catch(() => ({ models: [] })),
        runtimeJson(ollamaUrl, '/api/ps').catch(() => ({ models: [] })),
      ])
      const loaded = ps.models || []
      const card = gpu?.devices?.reduce((best, device) => !best || device.memoryTotalBytes - device.memoryUsedBytes > best.memoryTotalBytes - best.memoryUsedBytes ? device : best, null)
      const value = { gpuTotal: card?.memoryTotalBytes || 0, gpuFree: card ? card.memoryTotalBytes - card.memoryUsedBytes : 0,
        ramTotal: totalmem(), ramFree: freemem(), loadedVram: loaded.reduce((sum, model) => sum + Number(model.size_vram || 0), 0),
        loadedRam: loaded.reduce((sum, model) => sum + Math.max(0, Number(model.size || 0) - Number(model.size_vram || 0)), 0), models: tags.models || [], loadedModels: loaded.map(loadedModelStatus) }
      schedulingResources = { checkedAt: Date.now(), value }; return value
    })().finally(() => { resourceRefresh = null })
    return resourceRefresh
  },
})
const localAddresses = new Set(
  Object.values(networkInterfaces())
    .flat()
    .filter(Boolean)
    .map((item) => item.address),
)
localAddresses.add('127.0.0.1')
localAddresses.add('::1')

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`无效端口：${port}`)
  process.exit(1)
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

function respondJson(response, statusCode, body, extraHeaders = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-ShotAI-Version': releaseVersion,
    'X-ShotAI-API-Version': '2',
    ...extraHeaders,
  })
  response.end(JSON.stringify(body))
}

function respondMethodNotAllowed(response, allowed) {
  respondJson(
    response,
    405,
    {
      error: `不支持当前操作（收到的方法与此接口不匹配，应使用 ${allowed}）`,
      expectedMethod: allowed,
    },
    { Allow: allowed },
  )
}

function inferenceLoadSnapshot() {
  return scheduler.snapshot()
}

function canManageRequest(request) {
  if (allowLanAdministration) return true
  return isHostRequest(request)
}

function isHostRequest(request) {
  const remoteAddress = normalizeRemoteAddress(request.socket.remoteAddress)
  return localAddresses.has(remoteAddress)
}

function monitorSession(request) {
  const token = parseCookies(request)[MONITOR_SESSION_COOKIE]
  const expiresAt = token ? monitorSessions.get(token) : 0
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    if (token) monitorSessions.delete(token)
    return ''
  }
  monitorSessions.set(token, Date.now() + MONITOR_SESSION_TTL_MS)
  return token
}

function requireMonitorAccess(request, response) {
  if (!monitorSession(request)) {
    respondJson(response, 401, { error: '请先登录监控平台' })
    return false
  }
  return true
}

function markClientOnline(request, requestUrl) {
  if (requestUrl.pathname.startsWith('/shotai/monitor')) return
  const address = normalizeRemoteAddress(request.socket.remoteAddress)
  if (!address) return
  const existing = connectedClients.get(address) || {}
  connectedClients.set(address, {
    address,
    firstSeen: existing.firstSeen || Date.now(),
    lastSeen: Date.now(),
    userAgent: String(request.headers['user-agent'] || '').slice(0, 220),
    host: localAddresses.has(address),
  })
}

function pruneRuntimeState() {
  const now = Date.now()
  for (const [address, client] of connectedClients) {
    if (now - client.lastSeen > CLIENT_ONLINE_TTL_MS) connectedClients.delete(address)
  }
  for (const [token, expiresAt] of monitorSessions) {
    if (expiresAt <= now) monitorSessions.delete(token)
  }
  for (const [address, failure] of monitorLoginFailures) {
    if (now - failure.lastAttempt > 15 * 60 * 1000) monitorLoginFailures.delete(address)
  }
}

function cpuSnapshot() {
  return cpus().reduce(
    (summary, cpu) => {
      const values = Object.values(cpu.times)
      summary.idle += cpu.times.idle
      summary.total += values.reduce((sum, value) => sum + value, 0)
      return summary
    },
    { idle: 0, total: 0 },
  )
}

function currentCpuUsage() {
  const current = cpuSnapshot()
  if (!previousCpuSnapshot) {
    previousCpuSnapshot = current
    return 0
  }
  const totalDelta = current.total - previousCpuSnapshot.total
  const idleDelta = current.idle - previousCpuSnapshot.idle
  previousCpuSnapshot = current
  if (totalDelta <= 0) return 0
  return Math.max(0, Math.min(100, ((totalDelta - idleDelta) / totalDelta) * 100))
}

function readGpuUsage() {
  if (Date.now() - gpuSnapshot.checkedAt < 4_000) {
    return Promise.resolve(gpuSnapshot.value)
  }
  return new Promise((resolveGpu) => {
    execFile(
      process.platform === 'win32' ? 'nvidia-smi.exe' : 'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu',
        '--format=csv,noheader,nounits',
      ],
      { windowsHide: true, timeout: 2_500 },
      (error, stdout) => {
        let value = null
        if (!error && stdout.trim()) {
          const devices = stdout
            .trim()
            .split('\n')
            .map((line, index) => {
              const [name, usage, memoryUsed, memoryTotal, temperature] = line
                .split(',')
                .map((item) => item.trim())
              return {
                index,
                name,
                usagePercent: Number(usage) || 0,
                memoryUsedBytes: (Number(memoryUsed) || 0) * 1024 * 1024,
                memoryTotalBytes: (Number(memoryTotal) || 0) * 1024 * 1024,
                temperatureCelsius: Number(temperature) || 0,
              }
            })
          const names = [...new Set(devices.map((device) => device.name))]
          value = {
            name:
              names.length === 1 && devices.length > 1
                ? `${names[0]} × ${devices.length}`
                : names.join(' + '),
            deviceCount: devices.length,
            usagePercent: Math.max(...devices.map((device) => device.usagePercent)),
            memoryUsedBytes: devices.reduce(
              (sum, device) => sum + device.memoryUsedBytes,
              0,
            ),
            memoryTotalBytes: devices.reduce(
              (sum, device) => sum + device.memoryTotalBytes,
              0,
            ),
            temperatureCelsius: Math.max(
              ...devices.map((device) => device.temperatureCelsius),
            ),
            devices,
          }
        }
        gpuSnapshot = { checkedAt: Date.now(), value }
        resolveGpu(value)
      },
    )
  })
}

function tailText(path, maximumBytes = 512 * 1024) {
  if (!path || !existsSync(path)) return ''
  let descriptor
  try {
    const size = statSync(path).size
    const length = Math.min(size, maximumBytes)
    const buffer = Buffer.alloc(length)
    descriptor = openSync(path, 'r')
    readSync(descriptor, buffer, 0, length, size - length)
    return buffer.toString('utf8')
  } catch {
    return ''
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor)
      } catch {
        // The diagnostic log is optional.
      }
    }
  }
}

function latestGpuOffload() {
  const log = tailText(ollamaRuntimeLogPath)
  let result = null
  for (const match of log.matchAll(/offloaded\s+(\d+)\s*\/\s*(\d+)\s+layers?\s+to GPU/gi)) {
    result = {
      gpuLayers: Number(match[1]),
      totalLayers: Number(match[2]),
    }
  }
  return result
}

async function readOllamaInference() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch(createOllamaTarget('/api/ps'), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) throw new Error(`Ollama ps HTTP ${response.status}`)
    const body = await response.json()
    const loaded = Array.isArray(body.models) ? body.models[0] : null
    if (!loaded) {
      return {
        state: modelOperationState.activeCount > 0 ? 'importing' : 'idle',
        backend: 'idle',
        model: '',
        modelBytes: 0,
        vramBytes: 0,
        contextLength: 0,
        gpuLayers: 0,
        totalLayers: 0,
        computeLibrary: ollamaRuntimeComputeLibrary,
        offline: ollamaRuntimeOffline,
      }
    }
    const modelBytes = Number(loaded.size || 0)
    const vramBytes = Number(loaded.size_vram || 0)
    return {
      state: 'running',
      backend: loadedModelStatus(loaded).backend,
      evidence: 'ollama-api-ps',
      loadedModels: body.models.map(loadedModelStatus),
      model: loaded.name || loaded.model || '',
      modelBytes,
      vramBytes,
      contextLength: Number(loaded.context_length || 0),
      // Historical runner logs cannot be attributed to the currently loaded model.
      gpuLayers: 0,
      totalLayers: 0,
      computeLibrary: ollamaRuntimeComputeLibrary,
      offline: ollamaRuntimeOffline,
    }
  } catch {
    return {
      state: modelOperationState.activeCount > 0 ? 'importing' : 'unavailable',
      backend: 'unknown',
      model: '',
      modelBytes: 0,
      vramBytes: 0,
      contextLength: 0,
      gpuLayers: 0,
      totalLayers: 0,
      computeLibrary: ollamaRuntimeComputeLibrary,
      offline: ollamaRuntimeOffline,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function getMonitorSnapshot() {
  pruneRuntimeState()
  const memoryTotal = totalmem()
  const memoryUsed = memoryTotal - freemem()
  let disk = null
  try {
    const stats = statfsSync(existsSync(dataDirectory) ? dataDirectory : projectDirectory)
    const totalBytes = stats.blocks * stats.bsize
    const freeBytes = stats.bavail * stats.bsize
    disk = {
      totalBytes,
      usedBytes: totalBytes - freeBytes,
      usagePercent: totalBytes ? ((totalBytes - freeBytes) / totalBytes) * 100 : 0,
    }
  } catch {
    // Older Node runtimes can still show CPU, memory and GPU information.
  }
  const clients = [...connectedClients.values()]
    .sort((left, right) => right.lastSeen - left.lastSeen)
    .map((client) => ({
      ip: client.address,
      host: client.host,
      firstSeen: client.firstSeen,
      lastSeen: client.lastSeen,
      userAgent: client.userAgent,
    }))
  const [gpu, inference] = await Promise.all([
    readGpuUsage(),
    readOllamaInference(),
  ])
  return {
    generatedAt: Date.now(),
    onlineCount: clients.length,
    clients,
    host: {
      name: hostname(),
      platform: operatingSystemPlatform(),
      release: operatingSystemRelease(),
      uptimeSeconds: uptime(),
      serverUptimeSeconds: Math.floor((Date.now() - serverStartedAt) / 1000),
    },
    performance: {
      cpu: { usagePercent: currentCpuUsage(), cores: cpus().length },
      memory: {
        usedBytes: memoryUsed,
        totalBytes: memoryTotal,
        usagePercent: memoryTotal ? (memoryUsed / memoryTotal) * 100 : 0,
      },
      disk,
      gpu,
      inference,
      modelOperation: {
        active: modelOperationState.activeCount > 0,
        stage: modelOperationState.stage,
        status: modelOperationState.status,
        startedAt: modelOperationState.startedAt,
        transferredBytes: modelOperationState.transferredBytes,
        totalBytes: modelOperationState.totalBytes,
      },
      concurrency: inferenceLoadSnapshot(),
      process: {
        memoryBytes: process.memoryUsage().rss,
        requestCount,
      },
    },
  }
}

function isProtectedOllamaRequest(request, requestUrl) {
  if (request.method === 'DELETE') return true
  return /^\/ollama\/api\/(?:create|pull|push|copy|blobs)(?:\/|$)/.test(
    requestUrl.pathname,
  )
}

function getImageModelName(requestUrl) {
  const prefix = '/image-runtime/models/'
  if (!requestUrl.pathname.startsWith(prefix)) return ''
  const decoded = decodeURIComponent(requestUrl.pathname.slice(prefix.length))
  const fileName = basename(decoded)
  return /\.(?:gguf|safetensors|sft|ckpt)$/i.test(fileName) ? fileName : ''
}

function normalizeSha256(value = '') {
  const normalized = String(value).trim().toLowerCase().replace(/^sha256[:-]/, '')
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : ''
}

function ollamaBlobPath(sha256) {
  return join(ollamaModelDirectory, 'blobs', `sha256-${sha256}`)
}

function ensureSharedOllamaBlob(source, sha256) {
  if (!sha256 || !source.toLowerCase().endsWith('.gguf')) return false
  const destination = ollamaBlobPath(sha256)
  if (existsSync(destination)) return true
  mkdirSync(dirname(destination), { recursive: true })
  try {
    linkSync(source, destination)
    return true
  } catch {
    return false
  }
}

function saveImageModel(request, response, requestUrl) {
  const fileName = getImageModelName(requestUrl)
  if (!fileName) {
    respondJson(response, 400, { error: '请选择有效的图片模型文件' })
    return
  }
  const contentLength = Number(request.headers['content-length'] || 0)
  if (!contentLength || contentLength > 30 * 1024 * 1024 * 1024) {
    respondJson(response, 413, { error: '模型文件大小无效或超过 30 GB' })
    return
  }

  mkdirSync(imageModelDirectory, { recursive: true })
  const destination = join(imageModelDirectory, fileName)
  const temporary = `${destination}.uploading`
  const output = createWriteStream(temporary, { flags: 'w' })
  const expectedSha256 = normalizeSha256(request.headers['x-shotai-sha256'])
  const hasher = createHash('sha256')
  let received = 0

  request.on('data', (chunk) => {
    received += chunk.length
    hasher.update(chunk)
  })
  request.on('aborted', () => output.destroy(new Error('上传已取消')))
  output.on('error', (error) => {
    if (existsSync(temporary)) unlinkSync(temporary)
    if (!response.headersSent) {
      respondJson(response, 500, { error: `保存失败：${error.message}` })
    }
  })
  output.on('finish', () => {
    if (received !== contentLength) {
      if (existsSync(temporary)) unlinkSync(temporary)
      respondJson(response, 400, { error: '文件上传不完整，请重新选择' })
      return
    }
    const sha256 = hasher.digest('hex')
    if (expectedSha256 && sha256 !== expectedSha256) {
      if (existsSync(temporary)) unlinkSync(temporary)
      respondJson(response, 400, { error: '文件校验没有通过，请重新选择原文件' })
      return
    }
    if (existsSync(destination)) unlinkSync(destination)
    renameSync(temporary, destination)
    respondJson(response, 201, {
      fileName,
      size: received,
      sha256,
      sharedWithChat: ensureSharedOllamaBlob(destination, sha256),
    })
  })
  request.pipe(output)
}

function getChatImportFileName(requestUrl) {
  const prefix = '/shotai/model-import/files/'
  if (!requestUrl.pathname.startsWith(prefix)) return ''
  let decoded = ''
  try {
    decoded = decodeURIComponent(requestUrl.pathname.slice(prefix.length))
  } catch {
    return ''
  }
  const fileName = basename(decoded)
  return fileName.toLowerCase().endsWith('.gguf') ? fileName : ''
}

function verifySavedGguf(path) {
  const descriptor = openSync(path, 'r')
  try {
    const header = Buffer.alloc(24)
    if (readSync(descriptor, header, 0, header.length, 0) !== header.length) {
      throw new Error('模型文件不完整')
    }
    if (header.toString('ascii', 0, 4) !== 'GGUF') {
      throw new Error('文件不是有效的 GGUF 模型')
    }
    const version = header.readUInt32LE(4)
    if (version < 2 || version > 3) {
      throw new Error(`不支持 GGUF V${version}，请使用 GGUF V3 模型`)
    }
  } finally {
    closeSync(descriptor)
  }
}

function ollamaBlobRequest(method, digest, bodyPath = '', size = 0) {
  return new Promise((resolveRequest, rejectRequest) => {
    const target = createOllamaTarget(`/api/blobs/${digest}`)
    const transport = target.protocol === 'https:' ? httpsRequest : httpRequest
    const internalRequest = transport(
      target,
      {
        method,
        headers: bodyPath
          ? {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(size),
            }
          : {},
      },
      (internalResponse) => {
        const chunks = []
        let total = 0
        internalResponse.on('data', (chunk) => {
          if (total < 16 * 1024) chunks.push(chunk)
          total += chunk.length
        })
        internalResponse.on('end', () => {
          const status = internalResponse.statusCode || 500
          if (status >= 200 && status < 300) {
            resolveRequest({ status, exists: true })
            return
          }
          if (method === 'HEAD' && status === 404) {
            resolveRequest({ status, exists: false })
            return
          }
          let message = Buffer.concat(chunks).toString('utf8').trim()
          try {
            message = JSON.parse(message).error || message
          } catch {
            // Keep the service's plain-text error.
          }
          rejectRequest(new Error(message || `Ollama 写入失败（HTTP ${status}）`))
        })
      },
    )
    internalRequest.on('error', rejectRequest)
    if (bodyPath) {
      const input = createReadStream(bodyPath)
      input.on('error', rejectRequest)
      input.pipe(internalRequest)
    } else {
      internalRequest.end()
    }
  })
}

async function registerChatModelBlob(temporary, sha256, size) {
  const digest = `sha256:${sha256}`
  if (ollamaRuntimeIsolated) {
    const destination = join(
      resolve(ollamaRuntimeModelDirectory),
      'blobs',
      `sha256-${sha256}`,
    )
    mkdirSync(dirname(destination), { recursive: true })
    if (existsSync(destination) && statSync(destination).size === size) {
      unlinkSync(temporary)
      return { digest, reused: true, fastPath: true }
    }
    if (existsSync(destination)) unlinkSync(destination)
    renameSync(temporary, destination)
    return { digest, reused: false, fastPath: true }
  }

  const existing = await ollamaBlobRequest('HEAD', digest)
  if (existing.exists) {
    unlinkSync(temporary)
    return { digest, reused: true, fastPath: false }
  }
  await ollamaBlobRequest('POST', digest, temporary, size)
  unlinkSync(temporary)
  return { digest, reused: false, fastPath: false }
}

function saveChatModelFile(request, response, requestUrl) {
  const fileName = getChatImportFileName(requestUrl)
  if (!fileName) {
    respondJson(response, 400, { error: '请选择有效的 GGUF 聊天模型文件' })
    return
  }
  const contentLength = Number(request.headers['content-length'] || 0)
  if (!contentLength || contentLength > 80 * 1024 * 1024 * 1024) {
    respondJson(response, 413, { error: '模型文件大小无效或超过 80 GB' })
    return
  }

  const stagingDirectory = join(dataDirectory, 'models', 'imports')
  mkdirSync(stagingDirectory, { recursive: true })
  const temporary = join(
    stagingDirectory,
    `${Date.now()}-${randomBytes(8).toString('hex')}.uploading`,
  )
  const output = createWriteStream(temporary, { flags: 'wx' })
  const hasher = createHash('sha256')
  const operation = beginModelOperation(request, requestUrl)
  let received = 0
  let failed = false

  const fail = (status, error) => {
    if (failed) return
    failed = true
    if (existsSync(temporary)) unlinkSync(temporary)
    finishModelOperation(operation, false, error.message)
    if (!response.headersSent) respondJson(response, status, { error: error.message })
  }

  request.on('data', (chunk) => {
    received += chunk.length
    hasher.update(chunk)
  })
  request.on('aborted', () => {
    output.destroy()
    fail(499, new Error('模型导入已取消'))
  })
  output.on('error', (error) => fail(500, new Error(`保存失败：${error.message}`)))
  output.on('finish', async () => {
    if (failed) return
    try {
      if (received !== contentLength) throw new Error('文件上传不完整，请重新选择')
      verifySavedGguf(temporary)
      const sha256 = hasher.digest('hex')
      modelOperationState.stage = 'register'
      modelOperationState.status = ollamaRuntimeIsolated
        ? '正在登记模型文件'
        : '正在写入外部 Ollama'
      const registered = await registerChatModelBlob(temporary, sha256, received)
      finishModelOperation(operation, true)
      respondJson(response, 201, {
        fileName,
        size: received,
        sha256,
        ...registered,
      })
    } catch (error) {
      fail(500, error instanceof Error ? error : new Error(String(error)))
    }
  })
  request.pipe(output)
}

function readJsonRequest(request, maximumBytes = 64 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = []
    let total = 0
    request.on('data', (chunk) => {
      total += chunk.length
      if (total > maximumBytes) {
        rejectBody(new Error('请求内容过大'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        rejectBody(new Error('请求内容无法识别'))
      }
    })
    request.on('error', rejectBody)
  })
}

function safeLogText(value, maximumLength = 4_000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, maximumLength)
}

async function appendModelImportFailure(body) {
  const [ollama, gpu] = await Promise.all([checkOllama(), readGpuUsage()])
  const files = Array.isArray(body.files) ? body.files.slice(0, 32) : []
  const lines = [
    '',
    '============================================================',
    `Time: ${new Date().toISOString()}`,
    `ShotAI: ${releaseVersion}`,
    `Host: ${hostname()} | ${operatingSystemPlatform()} ${operatingSystemRelease()}`,
    `Ollama: ${safeLogText(ollama.version || ollama.error || 'unknown')}`,
    `Ollama source: ${safeLogText(ollamaRuntimeSource)} | ${safeLogText(ollamaUrl.origin)}`,
    `Ollama models: ${safeLogText(ollamaRuntimeModelDirectory)}`,
    `GPU: ${gpu ? `${safeLogText(gpu.name)} | VRAM ${Math.round(gpu.memoryUsedBytes / 1024 / 1024)} / ${Math.round(gpu.memoryTotalBytes / 1024 / 1024)} MiB` : 'not detected'}`,
    `Mode: ${safeLogText(body.mode || 'unknown', 80)}`,
    `Stage: ${safeLogText(body.stage || 'unknown', 120)}`,
    `Model name: ${safeLogText(body.modelName || '', 240)}`,
    'Files:',
    ...files.map((file) => {
      const name = safeLogText(file?.name || 'unknown', 500)
      const size = Number(file?.size) || 0
      return `  - ${name} (${size} bytes)`
    }),
    `Error: ${safeLogText(body.error || 'unknown error')}`,
    '============================================================',
    '',
  ]
  mkdirSync(dirname(modelImportLogPath), { recursive: true })
  const content = `${lines.join('\n')}\n`
  appendFileSync(modelImportLogPath, content, 'utf8')
  if (
    installModelImportLogPath &&
    installModelImportLogPath !== modelImportLogPath
  ) {
    mkdirSync(dirname(installModelImportLogPath), { recursive: true })
    appendFileSync(installModelImportLogPath, content, 'utf8')
  }
  const diagnostic = saveImportDiagnostic(runtimeLogDirectory, content,
    globalThis.__shotaiOllamaDiagnostic || { pid: ollamaRuntimePid, executable: '外部服务：未知', workingDirectory: '外部服务：未知' },
    { Ollama: ollamaRuntimeLogPath, ShotAI: join(runtimeLogDirectory, 'desktop.log') })
  return { ...diagnostic, downloadUrl: `/shotai/model-import-diagnostic/${diagnostic.filename}` }
}

async function reuseOllamaModelForImages(request, response) {
  try {
    const body = await readJsonRequest(request)
    const fileName = basename(String(body.fileName || ''))
    const sha256 = normalizeSha256(body.sha256)
    if (!fileName.toLowerCase().endsWith('.gguf') || !sha256) {
      respondJson(response, 400, { error: '模型文件信息不完整' })
      return
    }
    const source = ollamaBlobPath(sha256)
    if (!existsSync(source)) {
      respondJson(response, 404, { error: '没有找到可以复用的模型文件' })
      return
    }
    mkdirSync(imageModelDirectory, { recursive: true })
    const destination = join(imageModelDirectory, fileName)
    if (existsSync(destination)) unlinkSync(destination)
    linkSync(source, destination)
    respondJson(response, 200, { reused: true, fileName, sha256 })
  } catch (error) {
    respondJson(response, 500, { error: `复用失败：${error.message}` })
  }
}

function deleteImageModel(response, requestUrl) {
  const fileName = getImageModelName(requestUrl)
  if (!fileName) {
    respondJson(response, 400, { error: '没有找到要删除的模型文件' })
    return
  }
  const destination = join(imageModelDirectory, fileName)
  if (!existsSync(destination)) {
    respondJson(response, 404, { error: '模型文件已经不存在' })
    return
  }
  unlinkSync(destination)
  respondJson(response, 200, { fileName, deleted: true })
}

function createOllamaTarget(pathname, search = '') {
  const targetUrl = new URL(ollamaUrl)
  targetUrl.pathname = `${ollamaUrl.pathname.replace(/\/$/, '')}${pathname}`
  targetUrl.search = search
  return targetUrl
}

function createServiceTarget(baseUrl, pathname, search = '') {
  const targetUrl = new URL(baseUrl)
  targetUrl.pathname = `${baseUrl.pathname.replace(/\/$/, '')}${pathname}`
  targetUrl.search = search
  return targetUrl
}

async function checkOllama() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  const startedAt = Date.now()

  try {
    const response = await fetch(createOllamaTarget('/api/version'), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const body = response.ok ? await response.json() : {}
    return {
      ok: response.ok,
      status: response.status,
      version: body.version || 'unknown',
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        error instanceof Error && error.name === 'AbortError'
          ? 'Ollama 检测超时'
          : error.message,
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    clearTimeout(timeout)
  }
}

function beginModelOperation(request, requestUrl) {
  const isBlob =
    /^\/ollama\/api\/blobs\//.test(requestUrl.pathname) ||
    requestUrl.pathname.startsWith('/shotai/model-import/files/')
  const token = { finished: false, statusBuffer: '' }
  modelOperationState.activeCount += 1
  modelOperationState.stage = isBlob ? 'upload' : 'create'
  modelOperationState.status = isBlob
    ? '正在写入模型文件'
    : '正在校验并安装模型，请勿退出 ShotAI'
  modelOperationState.startedAt ||= Date.now()
  modelOperationState.completedAt = 0
  modelOperationState.transferredBytes = 0
  modelOperationState.totalBytes = Number(request.headers['content-length'] || 0)
  if (isBlob) {
    request.on('data', (chunk) => {
      modelOperationState.transferredBytes += chunk.length
    })
  }
  return token
}

function updateModelOperationStatus(token, chunk) {
  token.statusBuffer += chunk.toString('utf8')
  const lines = token.statusBuffer.split('\n')
  token.statusBuffer = lines.pop() || ''
  for (const line of lines) {
    try {
      const body = JSON.parse(line)
      if (body.status) modelOperationState.status = String(body.status)
      if (body.error) modelOperationState.status = `模型安装失败：${body.error}`
    } catch {
      // Ollama create normally streams NDJSON; ignore non-JSON diagnostics.
    }
  }
}

function finishModelOperation(token, succeeded, message = '') {
  if (!token || token.finished) return
  token.finished = true
  modelOperationState.activeCount = Math.max(0, modelOperationState.activeCount - 1)
  if (message) modelOperationState.status = message
  else if (succeeded) modelOperationState.status = '模型文件处理完成'
  if (modelOperationState.activeCount === 0) {
    modelOperationState.stage = succeeded ? 'complete' : 'failed'
    modelOperationState.completedAt = Date.now()
    modelOperationState.startedAt = 0
  }
}

function proxyLocalService(
  request,
  response,
  requestUrl,
  options,
) {
  const targetPath =
    requestUrl.pathname.replace(options.publicPrefix, '') || '/'
  const targetUrl = createServiceTarget(
    options.targetUrl,
    targetPath,
    requestUrl.search,
  )
  const proxyHeaders = { ...request.headers }
  const operation = options.operation || null
  let upstreamResponse = null
  let upstreamEnded = false
  let completed = false
  const complete = () => {
    if (completed) return
    completed = true
    options.onComplete?.(upstreamEnded)
  }
  const cancelUpstream = () => {
    if (completed) return
    finishModelOperation(operation, false, '模型导入连接已中断')
    if (upstreamResponse && !upstreamResponse.destroyed) {
      upstreamResponse.destroy()
    }
    if (!proxyRequest.destroyed) proxyRequest.destroy()
  }

  // The browser sends the public ShotAI address as Origin on POST requests.
  // Ollama only trusts loopback origins by default, so forwarding that header
  // makes LAN requests fail with 403 even though both services are on one host.
  // Ollama is intentionally kept behind this same-origin proxy.
  for (const header of [
    'host',
    'origin',
    'referer',
    'connection',
    'proxy-connection',
    'transfer-encoding',
    'upgrade',
  ]) {
    delete proxyHeaders[header]
  }
  proxyHeaders.host = targetUrl.host
  proxyHeaders['x-shotai-proxy'] = options.proxyName

  const proxyRequest = (targetUrl.protocol === 'https:' ? httpsRequest : httpRequest)(
    targetUrl,
    {
      method: request.method,
      headers: proxyHeaders,
    },
    (proxyResponse) => {
      upstreamResponse = proxyResponse
      proxyResponse.once('end', () => { upstreamEnded = true })
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
      if (operation) {
        proxyResponse.on('data', (chunk) => {
          if (options.captureStatus) updateModelOperationStatus(operation, chunk)
        })
        proxyResponse.once('end', () => {
          const status = proxyResponse.statusCode || 500
          finishModelOperation(
            operation,
            status >= 200 && status < 300,
            status >= 200 && status < 300
              ? ''
              : `模型文件处理失败（HTTP ${status}）`,
          )
          complete()
        })
      } else {
        proxyResponse.once('end', complete)
      }
      proxyResponse.pipe(response)
    },
  )

  proxyRequest.on('error', (error) => {
    finishModelOperation(operation, false, `AI 服务连接中断：${error.message}`)
    complete()
    if (response.destroyed) return
    if (response.headersSent) {
      response.destroy(error)
      return
    }
    respondJson(response, 502, {
      error: `无法连接主机上的${options.serviceLabel}：${error.message}`,
    })
  })
  proxyRequest.once('close', complete)

  request.on('aborted', () => {
    cancelUpstream()
  })
  response.on('close', () => {
    // Once a POST body has arrived, aborting fetch() normally closes the
    // downstream response rather than emitting `aborted` on IncomingMessage.
    // Propagate that disconnect to Ollama/sd-server so the GPU task and its
    // concurrency slot do not survive a stopped or closed conversation.
    if (!response.writableEnded) cancelUpstream()
  })
  if (options.body) {
    proxyRequest.end(options.body)
  } else request.pipe(proxyRequest)
  return cancelUpstream
}

function proxyOllamaDirect(request, response, requestUrl, onComplete, body) {
  const trackedOperation =
    request.method === 'POST' &&
    /^\/ollama\/api\/(?:create|blobs\/)/.test(requestUrl.pathname)
      ? beginModelOperation(request, requestUrl)
      : null
  return proxyLocalService(request, response, requestUrl, {
    publicPrefix: /^\/ollama/,
    targetUrl: ollamaUrl,
    proxyName: 'lan',
    serviceLabel: 'AI 服务',
    operation: trackedOperation,
    captureStatus: requestUrl.pathname === '/ollama/api/create',
    onComplete,
    body,
  })
}

function isScheduledInference(request, requestUrl) {
  return request.method === 'POST' &&
    /^\/ollama\/api\/(?:chat|generate|embed|embeddings)$/.test(requestUrl.pathname)
}

function proxyOllama(request, response, requestUrl) {
  if (!isScheduledInference(request, requestUrl)) {
    proxyOllamaDirect(request, response, requestUrl)
    return
  }

  scheduleRequest(request, response, requestUrl, 'text')
}

function proxyImageDirect(request, response, requestUrl, onComplete, body) {
  return proxyLocalService(request, response, requestUrl, {
    publicPrefix: /^\/image/,
    targetUrl: imageRuntimeUrl,
    proxyName: 'shotai-image',
    serviceLabel: '图片创作服务',
    onComplete, body,
  })
}

function proxyImageRuntime(request, response, requestUrl) {
  if (request.method === 'POST' && /^\/image\/(?:v1\/images\/(generations|edits)|sdapi\/v1\/(img2img|txt2img))$/.test(requestUrl.pathname)) {
    scheduleRequest(request, response, requestUrl, 'image')
  } else proxyImageDirect(request, response, requestUrl)
}

function clientIdentity(request) {
  const id = String(request.headers['x-shotai-client-id'] || '')
  return /^[a-zA-Z0-9_-]{8,80}$/.test(id) ? id : normalizeRemoteAddress(request.socket.remoteAddress)
}

async function scheduleRequest(request, response, requestUrl, kind) {
  const id = randomBytes(16).toString('hex')
  response.setHeader('X-ShotAI-Task-Id', id)
  const task = inferenceTasks.create({ id, client: clientIdentity(request), kind })
  const updateTask = state => inferenceTasks.update(id, state)
  const job = { client: clientIdentity(request), kind, ready: false, modelBytes: 0, context: 4096,
    start(done) {
      updateTask('running')
      let finished = false
      const finish = (upstreamEnded = false) => {
        if (finished) return
        finished = true
        updateTask(task.state === 'cancel-requested' ? 'connection-closed' : upstreamEnded && response.statusCode < 400 ? 'completed' : 'failed')
        done()
      }
      const controller = new AbortController()
      job.abort = () => controller.abort()
      void (async () => {
        if (kind === 'image') {
          // The image barrier owns the slot; release idle LLM residency before diffusion.
          const ps = await runtimeJson(ollamaUrl, '/api/ps', { signal: controller.signal }).catch(() => ({ models: [] }))
          for (const model of ps.models || []) {
            await runtimeJson(ollamaUrl, '/api/generate', { body: { model: model.name || model.model, keep_alive: 0, stream: false }, signal: controller.signal, timeout: 30000 })
          }
          schedulingResources.checkedAt = 0
        }
        if (controller.signal.aborted || response.destroyed) { finish(); return }
        job.abort = (kind === 'image' ? proxyImageDirect : proxyOllamaDirect)(request, response, requestUrl, finish, job.body)
      })().catch((error) => {
        if (!response.destroyed) respondJson(response, 502, { code: 'GPU_TASK_PREPARE_FAILED', error: error.message })
        finish()
      })
    } }
  if (!scheduler.enqueue(job)) {
    updateTask('rejected')
    respondJson(response, 429, { code: 'INFERENCE_QUEUE_FULL', error: '当前用户额度或客户端等待额度已满，请稍后重试', concurrency: scheduler.snapshot() }, { 'Retry-After': '5' })
    return
  }
  const cancel = () => {
    if (job.state === 'done') return
    updateTask(job.state === 'queued' ? 'cancelled-before-start' : 'cancel-requested')
    scheduler.cancel(job)
  }
  request.once('aborted', cancel)
  response.once('close', () => { if (!response.writableEnded) cancel() })
  try {
    const chunks = []; let bytes = 0
    for await (const chunk of request) {
      bytes += chunk.length
      if (bytes > 64 * 1024 * 1024) {
        scheduler.cancel(job); respondJson(response, 413, { code: 'INFERENCE_BODY_TOO_LARGE', error: '推理请求超过 64 MiB，请缩小图片或上下文' }); return
      }
      chunks.push(chunk)
    }
    if (job.state === 'done' || response.destroyed) return
    job.body = Buffer.concat(chunks)
    let body = {}
    if (/application\/json/i.test(request.headers['content-type'] || '')) {
      try { body = JSON.parse(job.body.toString('utf8')) } catch {
        scheduler.cancel(job); respondJson(response, 400, { code: 'INVALID_JSON', error: '请求格式无效' }); return
      }
    }
    job.model = String(body.model || '')
    if (kind === 'text' && requestUrl.pathname.endsWith('/generate') && Number(body.width) > 0 && Number(body.height) > 0) job.kind = 'image'
    job.context = Math.max(2048, Math.min(131072, Number(body.options?.num_ctx) || 4096))
    // Metadata lookup never loads a model and is bounded; cancelled requests cannot resurrect.
    const resources = await scheduler.resourceProvider()
    const normalizeName = (name) => name.includes(':') ? name : `${name}:latest`
    const model = resources?.models.find((model) => normalizeName(model.name || model.model || '') === normalizeName(job.model))
    job.modelBytes = Number(model?.size || 0)
    if (job.state === 'done' || response.destroyed) return
    job.ready = true
    scheduler.drain()
  } catch (error) {
    scheduler.cancel(job)
    if (!response.destroyed && !response.headersSent) respondJson(response, 502, { code: 'INFERENCE_PREPARE_FAILED', error: error.message })
  }
}

function listImageModelFiles() {
  if (!existsSync(imageModelDirectory)) return []
  return readdirSync(imageModelDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && /\.(?:gguf|safetensors|sft|ckpt)$/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort()
}

function selectImageModelFiles(modelFiles) {
  const isComponent = (name) => /qwen|text.?encoder|full.?encoder.?small.?decoder|clip|t5|vae|(?:^|[-_.])ae(?:[-_.]|$)/i.test(name)
  const diffusion = modelFiles.find(
    (name) =>
      /flux.?2.*klein|z.?image.*turbo/i.test(name) && !isComponent(name),
  )
  if (diffusion) {
    const wantsEightB = /9b/i.test(diffusion)
    const encoders = modelFiles.filter(
      (name) => name.toLowerCase().endsWith('.gguf') && /qwen|text.?encoder/i.test(name),
    )
    const textEncoder =
      encoders.find((name) => wantsEightB ? /8b/i.test(name) : /4b/i.test(name)) ||
      encoders[0]
    const vae = modelFiles.find(
      (name) =>
        /full.?encoder.?small.?decoder|flux.?2.*vae|(?:^|[-_.])vae(?:[-_.]|$)|(?:^|[-_.])ae(?:[-_.]|$)/i.test(name) ||
        name.toLowerCase() === 'diffusion_pytorch_model.safetensors',
    )
    const missingFiles = []
    if (!textEncoder) missingFiles.push(wantsEightB ? 'Qwen3-8B 文字理解文件' : 'Qwen3-4B 文字理解文件')
    if (!vae) missingFiles.push('FLUX.2 图片处理文件')
    return {
      kind: 'pipeline',
      configured: missingFiles.length === 0,
      diffusion,
      textEncoder: textEncoder || '',
      vae: vae || '',
      missingFiles,
    }
  }

  const single = modelFiles.find(
    (name) =>
      /stable.?diffusion|sdxl|sd.?3|juggernaut|dreamshaper/i.test(name) &&
      !isComponent(name),
  )
  if (single) {
    return {
      kind: 'single',
      configured: true,
      single,
      missingFiles: [],
    }
  }
  return {
    kind: 'unknown',
    configured: false,
    missingFiles: modelFiles.length ? ['可识别的图片主模型文件'] : ['图片模型文件'],
  }
}

async function checkImageRuntime() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 2_000)
  try {
    const response = await fetch(
      createServiceTarget(imageRuntimeUrl, '/v1/models'),
      { signal: controller.signal },
    )
    return { online: response.ok, status: response.status }
  } catch {
    return { online: false, status: 0 }
  } finally {
    clearTimeout(timeout)
  }
}

async function getImageRuntimeStatus() {
  const modelFiles = listImageModelFiles()
  const selection = selectImageModelFiles(modelFiles)
  const service = await checkImageRuntime()
  const runtimeFound =
    existsSync(join(imageRuntimeDirectory, 'sd-server.exe')) ||
    existsSync(join(imageRuntimeDirectory, 'sd-server'))
  const detectedModelLabel = modelFiles.some((name) => /z.?image.*turbo/i.test(name))
    ? 'Z-Image Turbo'
    : modelFiles.some((name) => /flux.?2.*klein.*9b/i.test(name))
      ? 'FLUX.2 Klein 9B'
      : modelFiles.some((name) => /flux.?2.*klein/i.test(name))
        ? 'FLUX.2 Klein 4B'
        : imageRuntimeConfig.modelLabel || '本地图片模型'
  return {
    available: service.online,
    serviceOnline: service.online,
    serviceStatus: service.status,
    runtimeFound,
    modelConfigured: selection.configured,
    modelLabel: detectedModelLabel,
    modelFiles,
    modelKind: selection.kind,
    missingFiles: selection.missingFiles,
    runtimeError: service.online
      ? ''
      : globalThis.__shotaiImageRuntimeState?.error || '',
    modelDirectory: 'models/image',
    runtimeDirectory: 'runtime/image',
  }
}

function walkFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function collectReferencedOllamaDigests() {
  const referenced = new Set()
  const manifestDirectory = join(ollamaModelDirectory, 'manifests')
  for (const path of walkFiles(manifestDirectory)) {
    try {
      const manifest = JSON.parse(readFileSync(path, 'utf8'))
      const digests = [manifest.config?.digest, ...(manifest.layers || []).map((layer) => layer.digest)]
      for (const digest of digests) {
        const normalized = normalizeSha256(digest)
        if (normalized) referenced.add(normalized)
      }
    } catch {
      // Ignore files that are not valid Ollama manifests.
    }
  }
  return referenced
}

function cleanupModelCache() {
  const removable = []
  for (const path of walkFiles(join(dataDirectory, 'models'))) {
    if (/\.(?:uploading|partial|tmp)$/i.test(path)) removable.push(path)
  }

  const referenced = collectReferencedOllamaDigests()
  const blobDirectory = join(ollamaModelDirectory, 'blobs')
  for (const path of walkFiles(blobDirectory)) {
    const fileName = basename(path)
    if (/^COPY\d+$/i.test(fileName)) {
      removable.push(path)
      continue
    }
    const match = fileName.match(/^sha256-([a-f0-9]{64})$/i)
    if (match && !referenced.has(match[1].toLowerCase())) removable.push(path)
  }

  let removedFiles = 0
  let removedBytes = 0
  for (const path of [...new Set(removable)]) {
    try {
      removedBytes += statSync(path).size
      unlinkSync(path)
      removedFiles += 1
    } catch {
      // A file may still be in use; leave it for the next cleanup.
    }
  }
  return { removedFiles, removedBytes }
}

const inferenceTasks = new TaskRegistry({ record: event => writeTaskEvent(runtimeLogDirectory, event) })
const maintenance = new ModelMaintenance({ directory: join(dataDirectory, 'maintenance'),
  list: async () => (await runtimeJson(ollamaUrl, '/api/tags')).models?.map(model => model.name || model.model).filter(Boolean) || [],
  unload: model => runtimeJson(ollamaUrl, '/api/generate', { body: { model, keep_alive: 0, stream: false }, timeout: 30000 }),
  remove: model => runtimeJson(ollamaUrl, '/api/delete', { method: 'DELETE', body: { model }, timeout: 30000 }),
  cleanup: () => cleanupModelCache(),
})

function resolveStaticFile(pathname, acceptsHtml) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    return null
  }

  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath
  const candidate = resolve(webDirectory, `.${normalize(requestedPath)}`)
  const relativePath = relative(webDirectory, candidate)

  if (relativePath.startsWith('..') || relativePath.includes(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    return null
  }

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  if (acceptsHtml && !extname(requestedPath)) return join(webDirectory, 'index.html')
  return null
}

function serveStatic(request, response, requestUrl) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    respondJson(response, 405, { error: 'Method Not Allowed' })
    return
  }

  const filePath = resolveStaticFile(
    requestUrl.pathname,
    request.headers.accept?.includes('text/html') ?? false,
  )

  if (!filePath) {
    respondJson(response, 404, { error: 'Not Found' })
    return
  }

  const extension = extname(filePath).toLowerCase()
  const cacheControl =
    extension === '.html'
      ? 'no-store'
      : filePath.includes(`${process.platform === 'win32' ? '\\' : '/'}assets${process.platform === 'win32' ? '\\' : '/'}`)
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600'

  response.writeHead(200, {
    'Content-Type': contentTypes.get(extension) || 'application/octet-stream',
    'Content-Length': statSync(filePath).size,
    'Cache-Control': cacheControl,
  })

  if (request.method === 'HEAD') {
    response.end()
    return
  }
  createReadStream(filePath).pipe(response)
}

async function handleModelHealth(request, response) {
  if (request.method !== 'POST') { respondMethodNotAllowed(response, 'POST'); return }
  if (!canManageRequest(request)) { respondJson(response, 403, { code: 'ADMIN_REQUIRED', error: '请在主机上进行模型体检' }); return }
  const controller = new AbortController()
  let job
  response.once('close', () => {
    if (!response.writableEnded) { controller.abort(); if (job) scheduler.cancel(job) }
  })
  try {
    const chunks = []; let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > 8192) { respondJson(response, 413, { error: '体检参数过大' }); return }
      chunks.push(chunk)
    }
    const body = JSON.parse(Buffer.concat(chunks).toString())
    if (typeof body.model !== 'string' || !body.model.trim() || body.model.length > 200) {
      respondJson(response, 400, { code: 'INVALID_MODEL', error: '请指定有效模型名称' }); return
    }
    const run = async () => {
      const report = await inspectModel(ollamaUrl, body.model, { probe: body.probe === true, signal: controller.signal })
      try {
        mkdirSync(runtimeLogDirectory, { recursive: true })
        appendFileSync(join(runtimeLogDirectory, 'model-health.jsonl'), `${JSON.stringify(report)}\n`)
      } catch { /* A read-only installation must not prevent the diagnostic response. */ }
      if (!response.destroyed) respondJson(response, 200, report)
    }
    if (body.probe !== true) { await run(); return }
    job = { client: clientIdentity(request), kind: 'text', model: body.model, modelBytes: 0, context: 2048, ready: false,
      abort: () => controller.abort(), start(done) { void run().catch((error) => {
        if (!response.destroyed) respondJson(response, 502, { error: error.message })
      }).finally(done) } }
    if (controller.signal.aborted) return
    if (!scheduler.enqueue(job)) { respondJson(response, 429, { code: 'INFERENCE_QUEUE_FULL', error: '任务额度已满，请稍后体检' }); return }
    const resources = await scheduler.resourceProvider()
    const normalizeName = (name) => name.includes(':') ? name : `${name}:latest`
    job.modelBytes = Number(resources?.models.find((model) => normalizeName(model.name || model.model || '') === normalizeName(body.model))?.size || 0)
    if (job.state === 'done' || controller.signal.aborted) return
    job.ready = true; scheduler.drain()
  } catch (error) {
    if (job) scheduler.cancel(job)
    if (!response.destroyed) respondJson(response, 400, { code: 'MODEL_HEALTH_REQUEST_FAILED', error: error.message })
  }
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
  if (requestUrl.pathname.startsWith('/shotai/tasks/')) {
    if (request.method !== 'GET') { respondMethodNotAllowed(response, 'GET'); return }
    const task = inferenceTasks.get(requestUrl.pathname.slice('/shotai/tasks/'.length))
    if (!task || (task.client !== clientIdentity(request) && !canManageRequest(request))) { respondJson(response, 404, { code: 'TASK_NOT_FOUND', error: '任务不存在' }); return }
    respondJson(response, 200, { task }); return
  }
  if (requestUrl.pathname === '/shotai/model-maintenance') {
    if (!canManageRequest(request)) { respondJson(response, 403, { code: 'ADMIN_REQUIRED', error: '模型清理仅供主机管理员使用' }); return }
    if (request.method === 'GET') { respondJson(response, 200, { job: maintenance.snapshot() }); return }
    if (request.method !== 'POST') { respondMethodNotAllowed(response, 'POST'); return }
    if (!ollamaRuntimeIsolated) { respondJson(response, 403, { code: 'RUNTIME_NOT_ISOLATED', error: '不能清理外部或非隔离 Ollama' }); return }
    try {
      const body = await readJsonRequest(request, 1024)
      if (body.confirm !== '清理模型') { respondJson(response, 400, { code: 'CONFIRM_REQUIRED', error: '缺少清理确认' }); return }
      const load = inferenceLoadSnapshot()
      if (maintenance.active || modelOperationState.activeCount || load.running || load.queued) { respondJson(response, 409, { code: 'MODEL_BUSY', error: '当前仍有任务，请结束后再清理' }); return }
      const job = maintenance.start()
      writeTaskEvent(runtimeLogDirectory, { id: job.id, kind: 'maintenance', state: 'running' })
      void maintenance.done.then(() => writeTaskEvent(runtimeLogDirectory, { id: job.id, kind: 'maintenance', state: maintenance.snapshot().state }))
        .catch(error => console.error(`清理任务记录失败：${error.message}`))
      respondJson(response, 202, { job })
    } catch (error) { respondJson(response, 500, { code: 'MAINTENANCE_FAILED', error: error.message }) }
    return
  }
  if (maintenance.active && request.method !== 'GET' && /^\/(ollama|image|image-runtime|shotai\/model-import\/files|shotai\/model-cache|shotai\/models\/health)/.test(requestUrl.pathname)) {
    respondJson(response, 409, { code: 'MODEL_MAINTENANCE_ACTIVE', error: '模型清理正在后台执行，请稍后重试', taskId: maintenance.snapshot().id }); return
  }
  requestCount += 1
  markClientOnline(request, requestUrl)

  if (requestUrl.pathname === '/shotai/monitor/session') {
    if (request.method !== 'GET') {
      respondMethodNotAllowed(response, 'GET')
      return
    }
    respondJson(response, 200, {
      authenticated: Boolean(monitorSession(request)),
      username: monitorUsername,
    })
    return
  }

  if (requestUrl.pathname === '/shotai/monitor/login') {
    if (request.method !== 'POST') {
      respondMethodNotAllowed(response, 'POST')
      return
    }
    const remoteAddress = normalizeRemoteAddress(request.socket.remoteAddress)
    const failure = monitorLoginFailures.get(remoteAddress) || {
      attempts: 0,
      lockedUntil: 0,
      lastAttempt: 0,
    }
    if (failure.lockedUntil > Date.now()) {
      respondJson(response, 429, { error: '尝试次数过多，请稍后再试' })
      return
    }
    try {
      const body = await readJsonRequest(request, 8 * 1024)
      const valid =
        constantTimeEqual(body.username, monitorUsername) &&
        constantTimeEqual(body.password, monitorPassword)
      if (!valid) {
        failure.attempts += 1
        failure.lastAttempt = Date.now()
        if (failure.attempts >= 5) {
          failure.lockedUntil = Date.now() + 60 * 1000
          failure.attempts = 0
        }
        monitorLoginFailures.set(remoteAddress, failure)
        respondJson(response, 401, { error: '用户名或密码不正确' })
        return
      }
      monitorLoginFailures.delete(remoteAddress)
      const token = randomBytes(32).toString('hex')
      monitorSessions.set(token, Date.now() + MONITOR_SESSION_TTL_MS)
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `${MONITOR_SESSION_COOKIE}=${token}; Path=/shotai/monitor; HttpOnly; SameSite=Strict; Max-Age=${MONITOR_SESSION_TTL_MS / 1000}`,
        'X-Content-Type-Options': 'nosniff',
        'X-ShotAI-Version': releaseVersion,
        'X-ShotAI-API-Version': '2',
      })
      response.end(JSON.stringify({ authenticated: true, username: monitorUsername }))
    } catch (error) {
      respondJson(response, 400, { error: error.message || '登录信息无法识别' })
    }
    return
  }

  if (requestUrl.pathname === '/shotai/monitor/logout') {
    if (request.method !== 'POST') {
      respondMethodNotAllowed(response, 'POST')
      return
    }
    const token = monitorSession(request)
    if (token) monitorSessions.delete(token)
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': `${MONITOR_SESSION_COOKIE}=; Path=/shotai/monitor; HttpOnly; SameSite=Strict; Max-Age=0`,
      'X-Content-Type-Options': 'nosniff',
      'X-ShotAI-Version': releaseVersion,
      'X-ShotAI-API-Version': '2',
    })
    response.end(JSON.stringify({ authenticated: false }))
    return
  }

  if (requestUrl.pathname === '/shotai/monitor/snapshot') {
    if (!requireMonitorAccess(request, response)) return
    if (request.method !== 'GET') {
      respondMethodNotAllowed(response, 'GET')
      return
    }
    respondJson(response, 200, await getMonitorSnapshot())
    return
  }

  if (requestUrl.pathname === '/shotai/system') {
    if (request.method !== 'GET') {
      respondMethodNotAllowed(response, 'GET')
      return
    }
    const canManage = canManageRequest(request)
    const hostRequest = isHostRequest(request)
    respondJson(response, 200, {
      version: releaseVersion,
      apiVersion: 2,
      platform: process.platform,
      isHost: hostRequest,
      canManage,
      port,
      ollama: {
        source: ollamaRuntimeSource,
        endpoint: ollamaUrl.origin,
        modelDirectory: hostRequest
          ? ollamaRuntimeModelDirectory
          : '由主机统一管理',
        pid: hostRequest && ollamaRuntimePid > 0 ? ollamaRuntimePid : undefined,
        isolated: ollamaRuntimeIsolated,
        systemOllamaDetected,
        computeLibrary: ollamaRuntimeComputeLibrary,
        offline: ollamaRuntimeOffline,
      },
      logs: {
        directory: hostRequest ? runtimeLogDirectory : '由主机统一管理',
      },
      concurrency: inferenceLoadSnapshot(),
    })
    return
  }

  if (requestUrl.pathname === '/shotai/models/health') {
    await handleModelHealth(request, response)
    return
  }
  if (requestUrl.pathname === '/shotai/models/loaded') {
    if (request.method !== 'GET') { respondMethodNotAllowed(response, 'GET'); return }
    try {
      const ps = await runtimeJson(ollamaUrl, '/api/ps')
      respondJson(response, 200, { checkedAt: new Date().toISOString(), models: (ps.models || []).map(loadedModelStatus), concurrency: scheduler.snapshot() })
    } catch (error) { respondJson(response, 503, { code: 'MODEL_STATUS_UNAVAILABLE', error: error.message }) }
    return
  }

  if (requestUrl.pathname === '/shotai/model-import-log') {
    if (!canManageRequest(request)) {
      respondJson(response, 403, { error: '请在运行 ShotAI 的主机上记录模型导入日志' })
      return
    }
    if (request.method !== 'POST') {
      respondJson(response, 405, { error: '不支持这项操作' })
      return
    }
    try {
      const body = await readJsonRequest(request, 48 * 1024)
      const diagnostic = await appendModelImportFailure(body)
      respondJson(response, 201, { saved: true, ...diagnostic })
    } catch (error) {
      respondJson(response, 500, { error: `导入日志写入失败：${error.message}` })
    }
    return
  }

  if (requestUrl.pathname.startsWith('/shotai/model-import-diagnostic/')) {
    if (!canManageRequest(request)) { respondJson(response, 403, { error: '诊断文件仅供主机管理员查看' }); return }
    if (request.method !== 'GET') { respondMethodNotAllowed(response, 'GET'); return }
    const name = requestUrl.pathname.slice('/shotai/model-import-diagnostic/'.length)
    if (!/^model-import-diagnostic-\d+-[a-f0-9-]+\.log$/.test(name)) { respondJson(response, 400, { error: '无效诊断文件' }); return }
    const path = join(runtimeLogDirectory, name)
    if (!existsSync(path)) { respondJson(response, 404, { error: '诊断文件不存在' }); return }
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    createReadStream(path).pipe(response)
    return
  }

  if (requestUrl.pathname === '/shotai/open-log-directory') {
    if (!isHostRequest(request)) { respondJson(response, 403, { error: '请在主机上打开日志目录' }); return }
    if (request.method !== 'POST') { respondMethodNotAllowed(response, 'POST'); return }
    if (typeof globalThis.__shotaiOpenLogDirectory !== 'function') { respondJson(response, 409, { error: `请手动打开 ${runtimeLogDirectory}` }); return }
    try {
      const error = await globalThis.__shotaiOpenLogDirectory()
      if (error) throw new Error(error)
      respondJson(response, 200, { opened: true })
    } catch (error) { respondJson(response, 500, { error: error.message }) }
    return
  }

  if (requestUrl.pathname.startsWith('/shotai/model-import/files/')) {
    if (!canManageRequest(request)) {
      respondJson(response, 403, { error: '请在运行 ShotAI 的主机上导入模型' })
      return
    }
    if (request.method !== 'PUT') {
      respondMethodNotAllowed(response, 'PUT')
      return
    }
    saveChatModelFile(request, response, requestUrl)
    return
  }

  if (requestUrl.pathname === '/healthz') {
    const [ollama, imageRuntime] = await Promise.all([
      checkOllama(),
      getImageRuntimeStatus(),
    ])
    respondJson(response, ollama.ok ? 200 : 503, {
      status: ollama.ok ? 'ok' : 'degraded',
      service: 'ShotAI LAN',
      web: { ok: true },
      proxy: { ok: true, stripsBrowserOrigin: true },
      ollama,
      imageRuntime,
    })
    return
  }

  if (requestUrl.pathname === '/image-runtime/status') {
    respondJson(response, 200, await getImageRuntimeStatus())
    return
  }

  if (requestUrl.pathname === '/image-runtime/models/reuse') {
    if (!canManageRequest(request)) {
      respondJson(response, 403, { error: '请在运行 ShotAI 的主机上管理模型' })
      return
    }
    if (request.method !== 'POST') {
      respondJson(response, 405, { error: '不支持这项操作' })
      return
    }
    await reuseOllamaModelForImages(request, response)
    return
  }

  if (requestUrl.pathname.startsWith('/image-runtime/models/')) {
    if (!canManageRequest(request)) {
      respondJson(response, 403, { error: '请在运行 ShotAI 的主机上管理图片模型' })
      return
    }
    if (request.method === 'PUT') {
      saveImageModel(request, response, requestUrl)
      return
    }
    if (request.method === 'DELETE') {
      deleteImageModel(response, requestUrl)
      return
    }
    respondJson(response, 405, { error: '不支持这项操作' })
    return
  }

  if (requestUrl.pathname === '/image-runtime/restart') {
    if (!canManageRequest(request)) {
      respondJson(response, 403, { error: '请在运行 ShotAI 的主机上重新载入图片模型' })
      return
    }
    const desktopRestart = globalThis.__shotaiRestartImageRuntime
    const managedByDesktop =
      typeof desktopRestart === 'function' || typeof process.send === 'function'
    if (typeof desktopRestart === 'function') {
      Promise.resolve(desktopRestart()).catch((error) => {
        console.error(`图片服务重新载入失败：${error.message}`)
      })
    }
    else if (typeof process.send === 'function') {
      process.send({ type: 'restart-image-runtime' })
    }
    respondJson(response, 202, {
      accepted: true,
      restartRequired: !managedByDesktop,
      message: managedByDesktop
        ? '图片服务正在重新载入'
        : '请重新启动 ShotAI 以载入图片模型',
    })
    return
  }

  if (requestUrl.pathname === '/shotai/model-cache') {
    if (!canManageRequest(request)) {
      respondJson(response, 403, { error: '请在运行 ShotAI 的主机上清理模型临时文件' })
      return
    }
    if (request.method !== 'DELETE') {
      respondJson(response, 405, { error: '不支持这项操作' })
      return
    }
    const load = inferenceLoadSnapshot()
    if (modelOperationState.activeCount > 0 || load.running > 0 || load.queued > 0) {
      respondJson(response, 409, { error: '当前仍有模型导入或推理任务，请等待所有任务结束后再清理' })
      return
    }
    respondJson(response, 200, cleanupModelCache())
    return
  }

  if (requestUrl.pathname === '/ollama' || requestUrl.pathname.startsWith('/ollama/')) {
    if (request.method === 'DELETE') {
      const load = inferenceLoadSnapshot()
      if (modelOperationState.activeCount > 0 || load.running > 0 || load.queued > 0) {
        respondJson(response, 409, { error: '模型仍有导入或推理任务，请等待所有任务结束后再删除' })
        return
      }
    }
    if (isProtectedOllamaRequest(request, requestUrl) && !canManageRequest(request)) {
      respondJson(response, 403, { error: '模型由主机管理员统一管理' })
      return
    }
    proxyOllama(request, response, requestUrl)
    return
  }

  if (requestUrl.pathname === '/image' || requestUrl.pathname.startsWith('/image/')) {
    proxyImageRuntime(request, response, requestUrl)
    return
  }

  serveStatic(request, response, requestUrl)
})

const embeddedInDesktop = process.env.SHOTAI_EMBEDDED === '1'
globalThis.__shotaiLanServer = server

server.on('error', (error) => {
  globalThis.__shotaiLanServerError = error
  if (typeof process.send === 'function') {
    process.send({ type: 'server-error', message: error.message, code: error.code })
  }
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${port} 已被占用，请修改 lan.config.json 中的 port。`)
  } else {
    console.error(error)
  }
  if (!embeddedInDesktop) process.exit(1)
})

server.listen(port, host, () => {
  console.log('')
  console.log('ShotAI 内网网页版已启动')
  console.log(`本机访问：http://127.0.0.1:${port}`)

  if (host === '0.0.0.0' || host === '::') {
    const addresses = Object.values(networkInterfaces())
      .flat()
      .filter(
        (item) =>
          item &&
          item.family === 'IPv4' &&
          !item.internal,
      )
      .map((item) => item.address)

    for (const address of [...new Set(addresses)]) {
      console.log(`内网访问：http://${address}:${port}`)
    }
  } else {
    console.log(`监听地址：http://${host}:${port}`)
  }

  console.log(`Ollama 代理：${ollamaUrl.origin}`)
  console.log('按 Ctrl+C 停止服务')
  console.log('')
  if (typeof process.send === 'function') {
    process.send({ type: 'server-ready', port, host })
  }
  globalThis.__shotaiLanServerReady = true
})

function shutdown() {
  server.close(() => process.exit(0))
}

if (!embeddedInDesktop) {
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
