const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  nativeImage,
  shell,
} = require('electron')
const { spawn, spawnSync } = require('node:child_process')
const { createServer: createNetServer } = require('node:net')
const {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} = require('node:fs')
const { networkInterfaces } = require('node:os')
const { basename, dirname, extname, join, resolve } = require('node:path')
const { pathToFileURL } = require('node:url')

const APP_NAME = 'ShotAI'
const DEFAULT_PORT = 9090
const CONTROL_TIMEOUT_MS = 30_000

let mainWindow = null
let tray = null
let ollamaProcess = null
let imageProcess = null
let quitting = false
let dataRoot = ''
let logPath = ''
let runtimeLogDirectory = ''
let config = null
let serverReady = false
let forceQuit = false
let quitPromptOpen = false
let shutdownStarted = false
const openLogFiles = []
const ollamaRuntimeState = {
  source: 'unavailable',
  endpoint: '',
  pid: 0,
  modelDirectory: '',
  isolated: false,
  systemOllamaDetected: false,
  computeLibrary: '',
  offline: false,
}
const imageRuntimeState = {
  state: 'idle',
  error: '',
  modelKind: 'unknown',
}
globalThis.__shotaiImageRuntimeState = imageRuntimeState

if (!app.requestSingleInstanceLock({ version: app.getVersion() })) {
  app.quit()
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true })
  return path
}

function runtimeLogFile(name) {
  if (!runtimeLogDirectory) return join(dataRoot, 'logs', name)
  if (process.platform !== 'linux' || !app.isPackaged) {
    return join(runtimeLogDirectory, name)
  }
  const userId = typeof process.getuid === 'function' ? process.getuid() : 'user'
  const extension = extname(name)
  const stem = extension ? name.slice(0, -extension.length) : name
  return join(runtimeLogDirectory, `${stem}-${userId}${extension}`)
}

function prepareRuntimeLogDirectory() {
  const candidates = []
  if (process.platform === 'linux' && app.isPackaged) {
    if (process.env.APPIMAGE) {
      candidates.push(join(dirname(resolve(process.env.APPIMAGE)), 'ShotAI-logs'))
    } else {
      candidates.push(join(dirname(process.execPath), 'logs'))
    }
    candidates.push(join(app.getPath('desktop'), 'ShotAI-logs'))
  }
  candidates.push(join(dataRoot, 'logs'))

  for (const directory of [...new Set(candidates)]) {
    const probePath = join(directory, `.shotai-write-test-${process.pid}`)
    try {
      ensureDirectory(directory)
      const descriptor = openSync(probePath, 'a')
      closeSync(descriptor)
      unlinkSync(probePath)
      return directory
    } catch {
      // Try the next writable location.
    }
  }
  return join(dataRoot, 'logs')
}

function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`
  if (logPath) {
    try {
      appendFileSync(logPath, line, 'utf8')
    } catch {
      // Logging must never prevent startup.
    }
  }
}

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function writeRuntimeConfig() {
  const bundled = readJson(
    app.isPackaged
      ? join(process.resourcesPath, 'shotai', 'lan.config.json')
      : join(app.getAppPath(), 'lan.config.json'),
  )
  const savedPath = join(dataRoot, 'lan.config.json')
  const saved = readJson(savedPath)
  config = {
    ...bundled,
    ...saved,
    host: saved.host || bundled.host || '0.0.0.0',
    port: Number(saved.port || bundled.port || DEFAULT_PORT),
    version: app.getVersion(),
    ollamaUrl: saved.ollamaUrl || bundled.ollamaUrl || 'http://127.0.0.1:11434',
    imageRuntime: {
      ...(bundled.imageRuntime || {}),
      ...(saved.imageRuntime || {}),
    },
    concurrency: {
      maxActiveUsers: 5,
      maxParallelInferences: 2,
      ...(bundled.concurrency || {}),
      ...(saved.concurrency || {}),
    },
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    config.port = DEFAULT_PORT
  }
  writeFileSync(savedPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return savedPath
}

function executableCandidates(name, relativeDirectory) {
  const names = process.platform === 'win32'
    ? [`${name}.exe`, name]
    : [name, join('bin', name)]
  const roots = [
    join(dataRoot, 'runtime', relativeDirectory),
    join(process.resourcesPath, 'runtime', relativeDirectory),
    join(dirname(process.execPath), 'runtime', relativeDirectory),
  ]
  const candidates = roots.flatMap((root) => names.map((file) => join(root, file)))
  candidates.push(process.platform === 'win32' ? `${name}.exe` : name)
  return [...new Set(candidates)]
}

function findExecutable(name, relativeDirectory) {
  for (const candidate of executableCandidates(name, relativeDirectory)) {
    if (candidate === name || candidate === `${name}.exe` || existsSync(candidate)) {
      return candidate
    }
  }
  return ''
}

async function endpointOnline(url, timeout = 2_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return response.status > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function portAvailable(port) {
  return new Promise((resolvePort) => {
    const probe = createNetServer()
    probe.unref()
    probe.once('error', () => resolvePort(false))
    probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
      probe.close(() => resolvePort(true))
    })
  })
}

async function findPrivateOllamaUrl() {
  for (let port = 11435; port <= 11454; port += 1) {
    if (await portAvailable(port)) return `http://127.0.0.1:${port}`
  }
  throw new Error('ShotAI 无法找到可用的独立 AI 服务端口（11435–11454）')
}

async function waitForEndpoint(url, child, timeout = CONTROL_TIMEOUT_MS) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (child?.exitCode !== null) {
      throw new Error(`AI 服务启动后提前停止，代码：${child.exitCode}`)
    }
    if (await endpointOnline(url, 1_000)) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error('AI 服务启动超时，请查看 logs/ollama.log')
}

function openProcessLog(name) {
  const descriptor = openSync(runtimeLogFile(name), 'a')
  openLogFiles.push(descriptor)
  return descriptor
}

function cleanupInterruptedOllamaCopies(modelDirectory) {
  const blobDirectory = join(modelDirectory, 'blobs')
  if (!existsSync(blobDirectory)) return { files: 0, bytes: 0 }
  let files = 0
  let bytes = 0
  for (const entry of readdirSync(blobDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !/^COPY\d+$/i.test(entry.name)) continue
    const path = join(blobDirectory, entry.name)
    try {
      bytes += statSync(path).size
      unlinkSync(path)
      files += 1
    } catch (error) {
      log(`未能清理中断的模型临时文件 ${entry.name}：${error.message}`)
    }
  }
  if (files > 0) {
    log(`已清理 ${files} 个中断的模型转换临时文件，共 ${Math.round(bytes / 1024 / 1024)} MiB。`)
  }
  return { files, bytes }
}

function bundledCudaLibrary(executable, libraryName) {
  if (!executable || !existsSync(executable)) return ''
  const library = join(
    dirname(dirname(executable)),
    'lib',
    'ollama',
    libraryName,
    process.platform === 'win32' ? 'ggml-cuda.dll' : 'libggml-cuda.so',
  )
  return existsSync(library) ? libraryName : ''
}

async function startOllama() {
  const executable = findExecutable('ollama', 'ollama')
  const isBundledOllama = Boolean(
    executable && executable !== 'ollama' && executable !== 'ollama.exe',
  )
  const shotAIModelDirectory = join(dataRoot, 'models', 'ollama')
  ollamaRuntimeState.systemOllamaDetected = await endpointOnline(
    'http://127.0.0.1:11434/api/version',
  )

  // A separately installed Ollama often owns 11434 and may expose an unrelated
  // model store. The full package must use its own model directory and endpoint.
  // Keep the system Ollama available on 11434, but never mix its models into ShotAI.
  if (isBundledOllama) {
    config.ollamaUrl = await findPrivateOllamaUrl()
    Object.assign(ollamaRuntimeState, {
      source: 'embedded',
      endpoint: config.ollamaUrl,
      modelDirectory: shotAIModelDirectory,
      isolated: true,
    })
    log(
      `发现内置 Ollama。ShotAI 使用独立服务 ${config.ollamaUrl} 和独立模型目录 ${shotAIModelDirectory}。`,
    )
    if (ollamaRuntimeState.systemOllamaDetected) {
      log('同时检测到系统 Ollama（127.0.0.1:11434），已隔离，不会读取它的模型。')
    }
  }

  const versionUrl = new URL('/api/version', config.ollamaUrl).toString()
  if (!isBundledOllama && await endpointOnline(versionUrl)) {
    let version = '未知版本'
    try {
      const response = await fetch(versionUrl)
      const body = await response.json()
      version = body.version || version
    } catch {
      // The service is online; version details are diagnostic only.
    }
    log(
      `检测到已经运行的 Ollama（${version}，${config.ollamaUrl}）。`,
    )
    Object.assign(ollamaRuntimeState, {
      source: 'external',
      endpoint: config.ollamaUrl,
      modelDirectory: '由外部 Ollama 管理',
      isolated: false,
    })
    return
  }
  if (!executable) {
    ollamaRuntimeState.endpoint = config.ollamaUrl
    log('未找到 Ollama，工作台仍会启动。')
    return
  }
  const output = openProcessLog('ollama.log')
  try {
    cleanupInterruptedOllamaCopies(shotAIModelDirectory)
    const preferredComputeLibrary = isBundledOllama
      ? bundledCudaLibrary(executable, 'cuda_v12')
      : ''
    Object.assign(ollamaRuntimeState, {
      computeLibrary: preferredComputeLibrary,
      offline: isBundledOllama,
    })
    if (preferredComputeLibrary) {
      log(
        process.platform === 'linux'
          ? 'Ubuntu 离线包已固定使用 CUDA 12 运行库，以兼容 Tesla V100（Compute Capability 7.0）。'
          : 'Windows 完整包已固定使用内置 CUDA 12 运行库。',
      )
    }
    const child = spawn(executable, ['serve'], {
      cwd: existsSync(executable) ? dirname(executable) : undefined,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', output, output],
      env: {
        ...process.env,
        OLLAMA_HOST: new URL(config.ollamaUrl).host,
        OLLAMA_MODELS: shotAIModelDirectory,
        ...(isBundledOllama
          ? {
              OLLAMA_NO_CLOUD: 'true',
              OLLAMA_CONTEXT_LENGTH: process.env.OLLAMA_CONTEXT_LENGTH || '8192',
              OLLAMA_NUM_PARALLEL: String(
                config.concurrency?.maxParallelInferences || 2,
              ),
              OLLAMA_MAX_QUEUE: String(
                Math.max(
                  1,
                  (config.concurrency?.maxActiveUsers || 5) -
                    (config.concurrency?.maxParallelInferences || 2),
                ),
              ),
              OLLAMA_MAX_LOADED_MODELS: '1',
              OLLAMA_KEEP_ALIVE: '5m',
            }
          : {}),
        ...(preferredComputeLibrary
          ? { OLLAMA_LLM_LIBRARY: preferredComputeLibrary }
          : {}),
      },
    })
    ollamaProcess = child
    Object.assign(ollamaRuntimeState, {
      source: isBundledOllama ? 'embedded' : 'managed',
      endpoint: config.ollamaUrl,
      pid: child.pid || 0,
      modelDirectory: shotAIModelDirectory,
      isolated: isBundledOllama,
    })
    child.on('error', (error) => log(`Ollama 启动失败：${error.message}`))
    child.on('exit', (code) => log(`Ollama 已停止，代码：${code}`))
    await waitForEndpoint(versionUrl, child)
    log(`Ollama 已启动：${executable}（PID ${child.pid || '未知'}）`)
  } catch (error) {
    stopProcess(ollamaProcess)
    ollamaProcess = null
    log(`Ollama 启动失败：${error.message}`)
    if (isBundledOllama) throw error
  }
}

function imageFiles() {
  const directory = join(dataRoot, 'models', 'image')
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:gguf|safetensors|sft|ckpt)$/i.test(entry.name))
    .map((entry) => {
      const path = join(directory, entry.name)
      return { name: entry.name, path, size: statSync(path).size }
    })
    .sort((left, right) => right.size - left.size)
}

function configuredImagePath(value) {
  if (!value) return ''
  return resolve(dataRoot, value)
}

function selectImageArguments() {
  const settings = config.imageRuntime || {}
  const files = imageFiles()
  let full = configuredImagePath(settings.model)
  let diffusion = configuredImagePath(settings.diffusionModel)
  let textEncoder = configuredImagePath(settings.textEncoder)
  let vae = configuredImagePath(settings.vae)

  if (!full && !diffusion) {
    const isComponent = (file) =>
      /qwen|text.?encoder|full.?encoder.?small.?decoder|clip|t5|vae|(?:^|[-_.])ae(?:[-_.]|$)/i.test(file.name)
    diffusion = files.find(
      (file) =>
        /flux.?2.*klein|z.?image.*turbo/i.test(file.name) &&
        !isComponent(file),
    )?.path || ''
    if (diffusion) {
      const wantsEightB = /9b/i.test(basename(diffusion))
      const encoders = files.filter(
        (file) => file.name.toLowerCase().endsWith('.gguf') && /qwen|text.?encoder/i.test(file.name),
      )
      textEncoder = (
        encoders.find((file) => wantsEightB ? /8b/i.test(file.name) : /4b/i.test(file.name)) ||
        encoders[0]
      )?.path || ''
      vae = files.find(
        (file) =>
          /full.?encoder.?small.?decoder|flux.?2.*vae|(?:^|[-_.])vae(?:[-_.]|$)|(?:^|[-_.])ae(?:[-_.]|$)/i.test(file.name) ||
          (file.name === 'diffusion_pytorch_model.safetensors' &&
            file.size < 1_000_000_000),
      )?.path || ''
    } else {
      full = files.find(
        (file) =>
          /stable.?diffusion|sdxl|sd.?3|juggernaut|dreamshaper/i.test(file.name) &&
          !isComponent(file),
      )?.path || ''
    }
  }

  const port = Number(new URL(settings.url || 'http://127.0.0.1:1234').port || 1234)
  const args = ['--listen-ip', '127.0.0.1', '--listen-port', String(port)]
  if (full && existsSync(full)) {
    imageRuntimeState.modelKind = 'single'
    args.push('--model', full)
  } else if ([diffusion, textEncoder, vae].every((path) => path && existsSync(path))) {
    imageRuntimeState.modelKind = 'pipeline'
    args.push('--diffusion-model', diffusion, '--llm', textEncoder, '--vae', vae)
  } else {
    imageRuntimeState.modelKind = diffusion ? 'pipeline' : 'unknown'
    imageRuntimeState.error = diffusion
      ? '图片模型文件不完整：请同时添加主模型、文字理解文件和图片处理文件。'
      : files.length
        ? '没有识别到可用的图片主模型，请确认文件名和下载页面说明。'
        : '尚未添加图片模型文件。'
    return null
  }
  args.push(
    '--steps', String(Number(settings.steps || 4)),
    '--cfg-scale', String(settings.cfgScale ?? 1),
    '--offload-to-cpu',
    '--diffusion-fa',
  )
  return { args, port }
}

function imageRuntimeDirectory() {
  for (const root of [
    join(dataRoot, 'runtime', 'image'),
    join(process.resourcesPath, 'runtime', 'image'),
    join(dirname(process.execPath), 'runtime', 'image'),
  ]) {
    if (existsSync(join(root, process.platform === 'win32' ? 'sd-server.exe' : 'sd-server'))) {
      return root
    }
  }
  return join(dataRoot, 'runtime', 'image')
}

async function startImageRuntime() {
  const settings = selectImageArguments()
  const runtimeDirectory = imageRuntimeDirectory()
  const executable = join(
    runtimeDirectory,
    process.platform === 'win32' ? 'sd-server.exe' : 'sd-server',
  )
  if (!settings || !existsSync(executable)) {
    imageRuntimeState.state = 'unavailable'
    if (settings && !existsSync(executable)) {
      imageRuntimeState.error = '安装包中没有找到图片运行组件，请安装完整版本。'
    }
    log('图片运行组件或图片模型未准备，跳过图片服务。')
    return
  }
  if (await endpointOnline(`http://127.0.0.1:${settings.port}/v1/models`)) {
    imageRuntimeState.state = 'online'
    imageRuntimeState.error = ''
    log('检测到已经运行的图片服务。')
    return
  }
  const output = openProcessLog('image-runtime.log')
  imageRuntimeState.state = 'starting'
  imageRuntimeState.error = ''
  const child = spawn(executable, settings.args, {
    cwd: runtimeDirectory,
    windowsHide: true,
    stdio: ['ignore', output, output],
  })
  imageProcess = child
  child.on('error', (error) => {
    if (imageProcess !== child) return
    imageRuntimeState.state = 'error'
    imageRuntimeState.error = `图片服务启动失败：${error.message}`
    log(imageRuntimeState.error)
  })
  child.on('exit', (code) => {
    if (imageProcess !== child) return
    imageRuntimeState.state = code === 0 ? 'stopped' : 'error'
    if (code !== 0) {
      imageRuntimeState.error = `图片服务启动后停止，代码 ${code}。请查看 logs/image-runtime.log。`
    }
    log(`图片服务已停止，代码：${code}`)
  })
  log(`图片服务已启动：${basename(executable)}`)
}

function stopProcess(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
  } else {
    try {
      // Managed runtimes are placed in their own process group so helper
      // processes such as llama-quantize cannot survive a normal ShotAI exit.
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}

async function restartImageRuntime() {
  stopProcess(imageProcess)
  imageProcess = null
  imageRuntimeState.state = 'restarting'
  imageRuntimeState.error = ''
  await startImageRuntime()
}

function serverEnvironment(configPath) {
  const runtimeDirectory = imageRuntimeDirectory()
  return {
    ...process.env,
    SHOTAI_EMBEDDED: '1',
    SHOTAI_CONFIG_PATH: configPath,
    SHOTAI_OLLAMA_URL: config.ollamaUrl,
    SHOTAI_OLLAMA_SOURCE: ollamaRuntimeState.source,
    SHOTAI_OLLAMA_PID: String(ollamaRuntimeState.pid || ''),
    SHOTAI_OLLAMA_MODEL_DIRECTORY: ollamaRuntimeState.modelDirectory,
    SHOTAI_OLLAMA_ISOLATED: ollamaRuntimeState.isolated ? '1' : '0',
    SHOTAI_OLLAMA_COMPUTE_LIBRARY: ollamaRuntimeState.computeLibrary,
    SHOTAI_OLLAMA_OFFLINE: ollamaRuntimeState.offline ? '1' : '0',
    SHOTAI_OLLAMA_LOG_PATH: runtimeLogFile('ollama.log'),
    SHOTAI_SYSTEM_OLLAMA_DETECTED: ollamaRuntimeState.systemOllamaDetected ? '1' : '0',
    SHOTAI_DATA_ROOT: dataRoot,
    SHOTAI_WEB_ROOT: app.isPackaged
      ? join(process.resourcesPath, 'shotai', 'web')
      : join(app.getAppPath(), 'dist'),
    SHOTAI_IMAGE_MODEL_DIRECTORY: join(dataRoot, 'models', 'image'),
    SHOTAI_IMAGE_RUNTIME_DIRECTORY: runtimeDirectory,
    SHOTAI_LOG_DIRECTORY: runtimeLogDirectory,
    SHOTAI_INSTALL_MODEL_IMPORT_LOG_PATH: runtimeLogFile('model-import.log'),
    SHOTAI_MODEL_IMPORT_LOG_PATH: join(
      app.getPath('desktop'),
      'ShotAI-model-import.log',
    ),
    SHOTAI_VERSION: app.getVersion(),
    SHOTAI_MAX_ACTIVE_USERS: String(config.concurrency?.maxActiveUsers || 5),
    SHOTAI_MAX_PARALLEL_INFERENCES: String(
      config.concurrency?.maxParallelInferences || 2,
    ),
  }
}

async function startLanServer(configPath) {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'shotai', 'server', 'serve-lan.mjs')
    : join(app.getAppPath(), 'scripts', 'serve-lan.mjs')
  const statusUrl = `http://127.0.0.1:${config.port}/shotai/system`
  if (await endpointOnline(statusUrl)) {
    let occupiedBy = '另一个程序'
    try {
      const response = await fetch(statusUrl)
      const body = await response.json()
      if (body?.version) occupiedBy = `仍在运行的 ShotAI ${body.version}`
    } catch {
      // The occupied port may not belong to ShotAI.
    }
    throw new Error(
      `端口 ${config.port} 已被${occupiedBy}占用。请先从托盘退出旧版 ShotAI，再启动当前版本。`,
    )
  }
  Object.assign(process.env, serverEnvironment(configPath))
  globalThis.__shotaiLanServer = null
  globalThis.__shotaiLanServerError = null
  globalThis.__shotaiLanServerReady = false
  globalThis.__shotaiRestartImageRuntime = restartImageRuntime

  await import(pathToFileURL(script).href)
  const deadline = Date.now() + CONTROL_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (globalThis.__shotaiLanServerError) {
      throw globalThis.__shotaiLanServerError
    }
    if (globalThis.__shotaiLanServerReady && await endpointOnline(statusUrl)) {
      serverReady = true
      log(`网页服务已启动：${statusUrl}`)
      return
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 200))
  }
  throw new Error('9090 网页服务启动超时')
}

function iconPath() {
  return join(
    app.getAppPath(),
    'desktop',
    'electron',
    'assets',
    process.platform === 'win32' ? 'shotai.ico' : 'shotai.png',
  )
}

function showWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 700,
    title: APP_NAME,
    icon: iconPath(),
    backgroundColor: '#0b0d0f',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })
  mainWindow.loadURL(`http://127.0.0.1:${config.port}`)
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = `http://127.0.0.1:${config.port}`
    if (!url.startsWith(allowed)) {
      event.preventDefault()
      if (/^https?:/i.test(url)) void shell.openExternal(url)
    }
  })
}

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((item) => item && item.family === 'IPv4' && !item.internal)
    .map((item) => `http://${item.address}:${config.port}`)
}

function createTray() {
  const image = nativeImage.createFromPath(iconPath()).resize({ width: 20, height: 20 })
  tray = new Tray(image)
  tray.setToolTip(`${APP_NAME} · 端口 ${config.port}`)
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 ShotAI', click: showWindow },
      {
        label: '复制内网地址',
        click: () => {
          const { clipboard } = require('electron')
          clipboard.writeText(lanAddresses()[0] || `http://127.0.0.1:${config.port}`)
        },
      },
      { type: 'separator' },
      {
        label: '退出 ShotAI',
        click: () => {
          app.quit()
        },
      },
    ]),
  )
  tray.on('double-click', showWindow)
}

function shutdown() {
  if (shutdownStarted) return
  shutdownStarted = true
  try {
    globalThis.__shotaiLanServer?.close()
  } catch (error) {
    log(`网页服务停止失败：${error.message}`)
  }
  stopProcess(imageProcess)
  stopProcess(ollamaProcess)
  for (const descriptor of openLogFiles.splice(0)) {
    try {
      closeSync(descriptor)
    } catch {
      // Ignore duplicate close during shutdown.
    }
  }
}

function activeModelOperation() {
  const state = globalThis.__shotaiModelOperationState
  return state && Number(state.activeCount) > 0 ? state : null
}

async function confirmQuitDuringModelImport() {
  if (quitPromptOpen) return
  quitPromptOpen = true
  showWindow()
  try {
    const operation = activeModelOperation()
    if (!operation) return
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '模型仍在导入',
      message: '模型文件正在安装或转换，现在退出会导致导入失败。',
      detail: operation.status
        ? `当前进度：${operation.status}\n\n建议继续等待，直到界面显示模型创建成功。`
        : '建议继续等待，直到界面显示模型创建成功。',
      buttons: ['继续导入', '仍然退出'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    })
    if (result.response === 1) {
      forceQuit = true
      quitting = true
      app.quit()
    }
  } finally {
    quitPromptOpen = false
  }
}

app.on('second-instance', (_event, _commandLine, _workingDirectory, additionalData) => {
  showWindow()
  const requestedVersion = additionalData?.version
  if (requestedVersion && requestedVersion !== app.getVersion()) {
    void dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: '检测到另一个 ShotAI 版本',
      message: `当前运行的是 ${app.getVersion()}，刚刚启动的是 ${requestedVersion}。`,
      detail: '请从系统托盘退出当前版本，再重新打开新版，避免网页和主机服务混用。',
      buttons: ['知道了'],
    })
  }
})
app.on('before-quit', (event) => {
  if (!forceQuit && activeModelOperation()) {
    event.preventDefault()
    quitting = false
    void confirmQuitDuringModelImport()
    return
  }
  quitting = true
  shutdown()
})
app.on('window-all-closed', () => {
  // The tray keeps ShotAI and LAN access available until the user chooses Exit.
})

app.whenReady().then(async () => {
  app.setAppUserModelId('com.shotai.desktop')
  dataRoot = ensureDirectory(
    process.env.SHOTAI_DATA_ROOT || join(app.getPath('userData'), 'data'),
  )
  for (const directory of [
    'logs',
    join('models', 'ollama'),
    join('models', 'image'),
    join('runtime', 'ollama'),
    join('runtime', 'image'),
  ]) {
    ensureDirectory(join(dataRoot, directory))
  }
  runtimeLogDirectory = prepareRuntimeLogDirectory()
  logPath = runtimeLogFile('desktop.log')
  log(`${APP_NAME} ${app.getVersion()} 正在启动。数据目录：${dataRoot}`)
  log(`运行日志目录：${runtimeLogDirectory}`)
  const configPath = writeRuntimeConfig()

  try {
    await startOllama()
    await startImageRuntime()
    await startLanServer(configPath)
    createMainWindow()
    createTray()
    log(`工作台已启动：http://127.0.0.1:${config.port}`)
    if (process.env.SHOTAI_SMOKE_TEST === '1') {
      setTimeout(() => {
        quitting = true
        app.quit()
      }, 1_500)
    }
  } catch (error) {
    log(`启动失败：${error.message}`)
    dialog.showErrorBox(
      'ShotAI 启动失败',
      `${error.message}\n\n详细信息：${logPath}`,
    )
    quitting = true
    app.quit()
  }
})
