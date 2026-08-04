import {
  createReadStream,
  createWriteStream,
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { networkInterfaces } from 'node:os'
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const releaseVersion = process.env.SHOTAI_VERSION || fileConfig.version || '1.0.0'
const allowLanAdministration = fileConfig.allowLanAdministration === true
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

function respondJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function normalizeRemoteAddress(address = '') {
  return address.replace(/^::ffff:/, '')
}

function canManageRequest(request) {
  if (allowLanAdministration) return true
  const remoteAddress = normalizeRemoteAddress(request.socket.remoteAddress)
  return localAddresses.has(remoteAddress)
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
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
      proxyResponse.pipe(response)
    },
  )

  proxyRequest.on('error', (error) => {
    if (response.headersSent) {
      response.destroy(error)
      return
    }
    respondJson(response, 502, {
      error: `无法连接主机上的${options.serviceLabel}：${error.message}`,
    })
  })

  request.on('aborted', () => proxyRequest.destroy())
  request.pipe(proxyRequest)
}

function proxyOllama(request, response, requestUrl) {
  proxyLocalService(request, response, requestUrl, {
    publicPrefix: /^\/ollama/,
    targetUrl: ollamaUrl,
    proxyName: 'lan',
    serviceLabel: 'AI 服务',
  })
}

function proxyImageRuntime(request, response, requestUrl) {
  proxyLocalService(request, response, requestUrl, {
    publicPrefix: /^\/image/,
    targetUrl: imageRuntimeUrl,
    proxyName: 'shotai-image',
    serviceLabel: '图片创作服务',
  })
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
  const isComponent = (name) => /qwen|text.?encoder|clip|t5|vae|(?:^|[-_.])ae(?:[-_.]|$)/i.test(name)
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
        /flux.?2.*vae|(?:^|[-_.])vae(?:[-_.]|$)|(?:^|[-_.])ae(?:[-_.]|$)/i.test(name) ||
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
    const match = basename(path).match(/^sha256-([a-f0-9]{64})$/i)
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

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)

  if (requestUrl.pathname === '/shotai/system') {
    const canManage = canManageRequest(request)
    respondJson(response, 200, {
      version: releaseVersion,
      isHost: canManage && !allowLanAdministration,
      canManage,
      port,
    })
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
    respondJson(response, 200, cleanupModelCache())
    return
  }

  if (requestUrl.pathname === '/ollama' || requestUrl.pathname.startsWith('/ollama/')) {
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
