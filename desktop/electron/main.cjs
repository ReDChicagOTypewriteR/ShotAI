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
const {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
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
let config = null
let serverReady = false
const openLogFiles = []
const imageRuntimeState = {
  state: 'idle',
  error: '',
  modelKind: 'unknown',
}
globalThis.__shotaiImageRuntimeState = imageRuntimeState

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

function ensureDirectory(path) {
  mkdirSync(path, { recursive: true })
  return path
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

function openProcessLog(name) {
  const descriptor = openSync(join(dataRoot, 'logs', name), 'a')
  openLogFiles.push(descriptor)
  return descriptor
}

async function startOllama() {
  const versionUrl = new URL('/api/version', config.ollamaUrl).toString()
  if (await endpointOnline(versionUrl)) {
    let version = '未知版本'
    try {
      const response = await fetch(versionUrl)
      const body = await response.json()
      version = body.version || version
    } catch {
      // The service is online; version details are diagnostic only.
    }
    log(
      `检测到已经运行的 Ollama（${version}，${config.ollamaUrl}）。将使用这个服务，内置 Ollama 不会重复启动。`,
    )
    return
  }
  const executable = findExecutable('ollama', 'ollama')
  if (!executable) {
    log('未找到 Ollama，工作台仍会启动。')
    return
  }
  const output = openProcessLog('ollama.log')
  try {
    ollamaProcess = spawn(executable, ['serve'], {
      cwd: existsSync(executable) ? dirname(executable) : undefined,
      windowsHide: true,
      stdio: ['ignore', output, output],
      env: {
        ...process.env,
        OLLAMA_HOST: '127.0.0.1:11434',
        OLLAMA_MODELS: join(dataRoot, 'models', 'ollama'),
      },
    })
    ollamaProcess.on('error', (error) => log(`Ollama 启动失败：${error.message}`))
    ollamaProcess.on('exit', (code) => log(`Ollama 已停止，代码：${code}`))
    log(`Ollama 已启动：${executable}`)
  } catch (error) {
    ollamaProcess = null
    log(`Ollama 启动失败：${error.message}`)
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
      /qwen|text.?encoder|clip|t5|vae|(?:^|[-_.])ae(?:[-_.]|$)/i.test(file.name)
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
          /flux.?2.*vae|(?:^|[-_.])vae(?:[-_.]|$)|(?:^|[-_.])ae(?:[-_.]|$)/i.test(file.name) ||
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
    child.kill('SIGTERM')
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
    SHOTAI_DATA_ROOT: dataRoot,
    SHOTAI_WEB_ROOT: app.isPackaged
      ? join(process.resourcesPath, 'shotai', 'web')
      : join(app.getAppPath(), 'dist'),
    SHOTAI_IMAGE_MODEL_DIRECTORY: join(dataRoot, 'models', 'image'),
    SHOTAI_IMAGE_RUNTIME_DIRECTORY: runtimeDirectory,
    SHOTAI_VERSION: app.getVersion(),
  }
}

async function startLanServer(configPath) {
  const script = app.isPackaged
    ? join(process.resourcesPath, 'shotai', 'server', 'serve-lan.mjs')
    : join(app.getAppPath(), 'scripts', 'serve-lan.mjs')
  Object.assign(process.env, serverEnvironment(configPath))
  globalThis.__shotaiLanServer = null
  globalThis.__shotaiLanServerError = null
  globalThis.__shotaiLanServerReady = false
  globalThis.__shotaiRestartImageRuntime = restartImageRuntime

  await import(pathToFileURL(script).href)
  const deadline = Date.now() + CONTROL_TIMEOUT_MS
  const statusUrl = `http://127.0.0.1:${config.port}/shotai/system`
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
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('double-click', showWindow)
}

function shutdown() {
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

app.on('second-instance', showWindow)
app.on('before-quit', () => {
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
  logPath = join(dataRoot, 'logs', 'desktop.log')
  log(`${APP_NAME} ${app.getVersion()} 正在启动。数据目录：${dataRoot}`)
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
