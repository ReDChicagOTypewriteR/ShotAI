<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import {
  ArrowRight,
  Check,
  CircleCheck,
  CloseBold,
  CopyDocument,
  Cpu,
  DataAnalysis,
  Delete,
  Document,
  DocumentAdd,
  Download,
  EditPen,
  Expand,
  Files,
  Fold,
  FolderOpened,
  Lock,
  MagicStick,
  Menu,
  Monitor,
  Moon,
  MoreFilled,
  Paperclip,
  Picture,
  Plus,
  RefreshRight,
  Search,
  Setting,
  Sunny,
  SwitchButton,
  UploadFilled,
  User,
  View,
  Hide,
} from '@element-plus/icons-vue'
import {
  BubbleList,
  Conversations,
  Thinking,
} from 'vue-element-plus-x'
import type { UploadFile, UploadFiles, UploadUserFile } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import {
  calculateFileSha256,
  chatWithOllama,
  createOllamaModel,
  deleteOllamaModel,
  embedWithOllama,
  ensureOllamaBlob,
  formatDigest,
  formatModelSize,
  generateImageWithOllama,
  getOllamaVersion,
  listOllamaModels,
  listRunningModels,
  normalizeOllamaModelName,
  OllamaApiError,
  showOllamaModel,
  testOllamaModel,
  verifyGgufFile,
} from './services/ollama'
import type { OllamaModel, OllamaShowResponse } from './services/ollama'
import type {
  OllamaChatMessage,
  OllamaGenerationOptions,
} from './services/ollama'
import {
  clearImageHistory,
  clearKnowledgeState,
  clearWorkspaceState,
  loadImageHistory,
  loadKnowledgeState,
  loadWorkspaceState,
  saveKnowledgeState,
  saveImageHistory,
  saveWorkspaceState,
} from './services/storage'
import {
  chunkKnowledgeText,
  createKnowledgeBase,
  extractKnowledgeText,
  formatFileSize,
  getFileExtension,
  retrieveKnowledge,
  validateKnowledgeFile,
} from './services/knowledge'
import type {
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeState,
  RetrievedKnowledge,
} from './services/knowledge'
import {
  deleteImageModelFile,
  editImageWithLocalRuntime,
  generateImageWithLocalRuntime,
  getImageRuntimeStatus,
  restartImageRuntime,
  reuseOllamaModelFileForImages,
  uploadImageModelFile,
} from './services/image-runtime'
import type { ImageRuntimeStatus } from './services/image-runtime'
import {
  cleanupModelCache,
  getMonitorSession,
  getMonitorSnapshot,
  getShotAISystemInfo,
  loginMonitor,
  logoutMonitor,
} from './services/system'
import type { MonitorSnapshot, ShotAISystemInfo } from './services/system'

type ViewKey = 'chat' | 'models' | 'knowledge' | 'diagnostics' | 'settings' | 'monitor'
type ModelStatus = 'ready' | 'sleeping' | 'checking'
type OllamaConnectionState = 'checking' | 'online' | 'degraded' | 'offline'
type ImageCanvas = 'square' | 'landscape' | 'portrait'
type ComposerMode = 'chat' | 'image'

interface RagSource {
  id: string
  documentName: string
  chunkIndex: number
  score: number
  mode: 'vector' | 'keyword'
  excerpt: string
}

interface MessageImage {
  id: string
  name: string
  mimeType: string
  dataUrl: string
  width: number
  height: number
  size: number
}

interface MessageAttachment {
  id: string
  name: string
  mimeType: string
  extension: string
  size: number
  content: string
  characterCount: number
  truncated: boolean
}

interface ImageHistoryItem {
  id: string
  dataUrl: string
  prompt: string
  model: string
  canvas: ImageCanvas
  createdAt: number
}

interface DemoMessage {
  id: number
  role: 'user' | 'assistant'
  placement: 'start' | 'end'
  variant: 'filled' | 'borderless'
  content: string
  time: string
  reasoning?: string
  loading?: boolean
  stopped?: boolean
  truncated?: boolean
  sources?: RagSource[]
  images?: MessageImage[]
  attachments?: MessageAttachment[]
  modelId?: string
  modelName?: string
  generationType?: 'chat' | 'image'
  generationProgress?: number
  generationStatus?: string
}

interface LocalModel {
  id: string
  name: string
  family: string
  capabilities: string[]
  parameters: string
  quantization: string
  size: string
  context: string
  contextTokens: number
  status: ModelStatus
  digest: string
  rawDigest: string
  detailsAvailable: boolean
}

interface ConversationSettings {
  temperature: number
  topP: number
  contextLength: number
  maxOutput: number
}

interface ConversationRecord {
  id: string
  label: string
  createdAt: number
  updatedAt: number
  modelId: string
  systemPrompt: string
  settings: ConversationSettings
  knowledgeBaseIds: string[]
  messages: DemoMessage[]
}

interface ConversationRow {
  id: string
  label: string
  group: string
  disabled?: boolean
}

interface WorkspaceState {
  version: 1
  activeConversation: string
  darkMode: boolean
  showReasoning?: boolean
  conversations: ConversationRecord[]
}

interface BubbleListExpose {
  scrollToBottom: (smooth?: boolean) => void
}

const activeView = ref<ViewKey>('chat')
const activeConversation = ref<string>('c-default')
const sidebarOpen = ref(false)
const SIDEBAR_COLLAPSED_KEY = 'shotai:conversation-sidebar-collapsed'
const sidebarCollapsed = ref(false)
const darkMode = ref(true)
const showReasoning = ref(false)
const modelDrawerOpen = ref(false)
const diagnosticsDrawerOpen = ref(false)
const settingsDrawerOpen = ref(false)
const knowledgeDrawerOpen = ref(false)
const imageStudioOpen = ref(false)
const monitorDrawerOpen = ref(false)
const monitorAuthenticated = ref(false)
const monitorLoading = ref(false)
const monitorLoginLoading = ref(false)
const monitorLoginError = ref('')
const monitorUsername = ref('admin')
const monitorPassword = ref('')
const monitorPasswordVisible = ref(false)
const monitorHideIps = ref(true)
const monitorSnapshot = ref<MonitorSnapshot | null>(null)
const monitorCpuHistory = ref<number[]>([])
const monitorMemoryHistory = ref<number[]>([])
const monitorGpuHistory = ref<number[]>([])
const imagePrompt = ref('')
const AUTO_IMAGE_PROVIDER_ID = 'auto'
const imageModelId = ref(AUTO_IMAGE_PROVIDER_ID)
const imageCanvas = ref<ImageCanvas>('square')
const imageEditStrength = ref(0.55)
const imageGenerating = ref(false)
const imageProgress = ref(0)
const imageStatus = ref('')
const generatedImageUrl = ref('')
const generatedImageModel = ref('')
const imageHistory = ref<ImageHistoryItem[]>([])
const imageRuntimeChecking = ref(false)
const imageModelImporting = ref(false)
const imageModelImportProgress = ref(0)
const imageModelImportStatus = ref('')
const imageRuntime = ref<ImageRuntimeStatus>({
  available: false,
  serviceOnline: false,
  serviceStatus: 0,
  runtimeFound: false,
  modelConfigured: false,
  modelLabel: 'FLUX.2 Klein 4B',
  modelFiles: [],
  modelDirectory: 'models/image',
  runtimeDirectory: 'runtime/image',
})
const systemInfo = ref<ShotAISystemInfo>({
  version: '1.0.0',
  platform: 'unknown',
  isHost: true,
  canManage: true,
  port: 9090,
})
const importDialogOpen = ref(false)
const importStep = ref(0)
const importProgress = ref(0)
const importRunning = ref(false)
const validationRunning = ref(false)
const importStatus = ref('')
const senderRef = ref<HTMLTextAreaElement | null>(null)
const senderText = ref('')
const composerMode = ref<ComposerMode>('chat')
const bubbleListRef = ref<BubbleListExpose | null>(null)
let messageScrollFrame = 0

function isMessageScrollerNearBottom() {
  const list = document.querySelector('.message-stage .elx-bubble-list__list')
  if (!(list instanceof HTMLElement)) return true
  return list.scrollHeight - list.clientHeight - list.scrollTop <= 72
}

function scrollMessagesToBottom(smooth = false) {
  void nextTick(() => {
    if (messageScrollFrame) {
      window.cancelAnimationFrame(messageScrollFrame)
    }
    messageScrollFrame = window.requestAnimationFrame(() => {
      bubbleListRef.value?.scrollToBottom(smooth)
      messageScrollFrame = window.requestAnimationFrame(() => {
        bubbleListRef.value?.scrollToBottom(false)
        messageScrollFrame = 0
      })
    })
  })
}
const attachmentInputRef = ref<HTMLInputElement | null>(null)
const isGenerating = ref(false)
const isStopping = ref(false)
const senderTextLength = computed(() => senderText.value.length)
const attachmentProcessing = ref(false)
const attachmentDragActive = ref(false)
const pendingImages = ref<MessageImage[]>([])
const pendingAttachments = ref<MessageAttachment[]>([])
const selectedFiles = ref<UploadUserFile[]>([])
const selectedImportFile = ref<File | null>(null)
const selectedModelFiles = ref<File[]>([])
const selectedProjectorFile = ref<File | null>(null)
const selectedImageImportFiles = ref<File[]>([])
const importFileShas = ref<Record<string, string>>({})
const importMode = ref<'chat' | 'image'>('chat')
const importName = ref('')
const importSha = ref('')
const importProjectorSha = ref('')
const importDetectedCapabilities = ref<string[]>([])
const importFailureDetail = ref('')
const ollamaConnected = ref(false)
const ollamaConnectionState = ref<OllamaConnectionState>('checking')
const ollamaVersion = ref('未检测')
const ollamaError = ref('')
const ollamaDetailFailures = ref(0)
const modelDetailsAvailable = ref(true)
const ollamaLastCheckedAt = ref('尚未检测')
const ollamaRefreshing = ref(false)
const runningModelIds = ref<string[]>([])
const conversationSearch = ref('')
const persistenceState = ref<'loading' | 'saving' | 'saved' | 'error'>(
  'loading',
)
const storageReady = ref(false)
const knowledgeStorageReady = ref(false)
const knowledgePersistenceState = ref<
  'loading' | 'saving' | 'saved' | 'error'
>('loading')
const knowledgeImporting = ref(false)
const knowledgeImportProgress = ref(0)
const knowledgeImportStatus = ref('')
const modelCacheCleaning = ref(false)
const selectedKnowledgeBaseId = ref('')
const embeddingModelId = ref('')
let chatController: AbortController | undefined
let imageController: AbortController | undefined
let imageProgressTimer: number | undefined
let healthTimer: number | undefined
let monitorTimer: number | undefined
let persistenceTimer: number | undefined
let knowledgePersistenceTimer: number | undefined
let messageId = 10

const MAX_IMAGE_COUNT = 4
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1536
const IMAGE_COMPRESSION_THRESHOLD = 3 * 1024 * 1024
const MAX_MESSAGE_ATTACHMENT_COUNT = 6
const MAX_ATTACHMENT_TEXT_CHARS = 12_000

const defaultConversationSettings: ConversationSettings = {
  temperature: 0.7,
  topP: 0.9,
  contextLength: 4096,
  maxOutput: 2048,
}

const appLogoUrl = `${import.meta.env.BASE_URL}shotai-logo.svg`

function createConversationRecord(
  label = '新的离线对话',
  id = `c-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): ConversationRecord {
  const timestamp = Date.now()
  return {
    id,
    label,
    createdAt: timestamp,
    updatedAt: timestamp,
    modelId: '',
    systemPrompt: '你是 ShotAI，一个完全离线运行、严谨可靠的中文助手。',
    settings: { ...defaultConversationSettings },
    knowledgeBaseIds: [],
    messages: [],
  }
}

const conversations = ref<ConversationRecord[]>([
  createConversationRecord('离线环境能力说明', 'c-default'),
])

const models = reactive<LocalModel[]>([])
const knowledgeBases = ref<KnowledgeBase[]>([])

const activeConversationRecord = computed(
  () =>
    conversations.value.find(
      (conversation) => conversation.id === activeConversation.value,
    ) ?? conversations.value[0],
)

const messages = computed<DemoMessage[]>({
  get: () => activeConversationRecord.value?.messages ?? [],
  set: (value) => {
    if (activeConversationRecord.value) {
      activeConversationRecord.value.messages = value
      activeConversationRecord.value.updatedAt = Date.now()
    }
  },
})

const currentModelId = computed<string>({
  get: () => activeConversationRecord.value?.modelId ?? '',
  set: (value) => {
    if (activeConversationRecord.value) {
      activeConversationRecord.value.modelId = value
      activeConversationRecord.value.updatedAt = Date.now()
    }
  },
})

const emptyModel: LocalModel = {
  id: '',
  name: '正在查找可用模型',
  family: '—',
  capabilities: [],
  parameters: '—',
  quantization: '—',
  size: '—',
  context: '—',
  contextTokens: 0,
  status: 'checking',
  digest: '—',
  rawDigest: '',
  detailsAvailable: false,
}

const selectedModel = computed(
  () =>
    models.find((model) => model.id === currentModelId.value) ??
    models[0] ??
    emptyModel,
)

const selectedModelSupportsVision = computed(() =>
  selectedModel.value.capabilities.includes('vision'),
)

const visionModels = computed(() =>
  models.filter((model) => model.capabilities.includes('vision')),
)

const preferredVisionModel = computed(() =>
  selectedModelSupportsVision.value
    ? selectedModel.value
    : visionModels.value[0],
)

const embeddingModels = computed(() =>
  models.filter((model) => model.capabilities.includes('embedding')),
)

function isImageGenerationModel(model: LocalModel) {
  const id = model.id.toLowerCase()
  return (
    model.capabilities.some((capability) =>
      ['image', 'image-generation', 'image_generation'].includes(
        capability.toLowerCase(),
      ),
    ) ||
    id.includes('flux2-klein') ||
    id.includes('flux-klein') ||
    id.includes('z-image-turbo')
  )
}

const imageGenerationModels = computed(() =>
  models.filter(isImageGenerationModel),
)

type ManagedModelSectionKey = 'conversation' | 'knowledge' | 'image'

const managedModelSections = computed(() => [
  {
    key: 'conversation' as ManagedModelSectionKey,
    title: '对话与图片识别',
    description: '用于日常对话、阅读文档和识别上传的图片',
    models: models.filter(
      (model) =>
        !model.capabilities.includes('embedding') &&
        !isImageGenerationModel(model),
    ),
  },
  {
    key: 'knowledge' as ManagedModelSectionKey,
    title: '资料查找',
    description: '帮助系统从本地资料中更准确地找到相关内容',
    models: embeddingModels.value,
  },
  {
    key: 'image' as ManagedModelSectionKey,
    title: '图片生成与修改',
    description: '负责生成图片、以图生图和修改已有图片',
    models: imageGenerationModels.value,
  },
])

const managedModelCount = computed(
  () => models.length + (imageRuntime.value.modelFiles.length ? 1 : 0),
)

interface ImageProviderOption {
  id: string
  label: string
  detail: string
  kind: 'local-runtime' | 'ollama'
  modelId: string
}

const imageProviderOptions = computed<ImageProviderOption[]>(() => [
  ...(imageRuntime.value.serviceOnline
    ? [
        {
          id: 'local-runtime',
          label: imageRuntime.value.modelLabel,
          detail: '本地图片组件',
          kind: 'local-runtime' as const,
          modelId: imageRuntime.value.modelLabel,
        },
      ]
    : []),
  ...imageGenerationModels.value.map((model) => ({
    id: `ollama:${model.id}`,
    label: model.name,
    detail: `${model.size} · Ollama`,
    kind: 'ollama' as const,
    modelId: model.id,
  })),
])

const hostPlatformLabel = computed(() => {
  if (systemInfo.value.platform === 'linux') return 'Ubuntu / Linux'
  if (systemInfo.value.platform === 'win32') return 'Windows'
  if (systemInfo.value.platform === 'darwin') return 'macOS'
  return '主机'
})

const selectedImageProvider = computed(() => {
  if (imageModelId.value === AUTO_IMAGE_PROVIDER_ID) {
    return imageProviderOptions.value[0]
  }
  return (
    imageProviderOptions.value.find(
      (provider) => provider.id === imageModelId.value,
    ) ?? imageProviderOptions.value[0]
  )
})

type CapabilityKey = 'chat' | 'vision' | 'knowledge' | 'image'

const capabilityOverview = computed(() => [
  {
    key: 'chat' as CapabilityKey,
    title: '日常对话',
    status: ollamaConnected.value && models.length ? '已就绪' : '需要准备',
    detail: ollamaConnected.value
      ? models.length
        ? `自动使用 ${selectedModel.value.name}`
        : '还没有添加对话模型'
      : 'AI 服务尚未启动',
    ready: ollamaConnected.value && models.length > 0,
  },
  {
    key: 'vision' as CapabilityKey,
    title: '图片识别',
    status: preferredVisionModel.value ? '已就绪' : '需要准备',
    detail: preferredVisionModel.value
      ? `上传图片后自动使用 ${preferredVisionModel.value.name}`
      : '还没有可以识别图片的模型',
    ready: Boolean(preferredVisionModel.value),
  },
  {
    key: 'knowledge' as CapabilityKey,
    title: '资料查找',
    status: '可以使用',
    detail: embeddingModels.value.length
      ? `自动使用 ${embeddingModels.value[0]?.name}`
      : '当前使用普通文字查找，也可以正常工作',
    ready: true,
  },
  {
    key: 'image' as CapabilityKey,
    title: '图片创作',
    status: selectedImageProvider.value ? '已就绪' : '需要准备',
    detail: selectedImageProvider.value
      ? `生成时自动使用 ${selectedImageProvider.value.label}`
      : '还没有准备图片模型文件',
    ready: Boolean(selectedImageProvider.value),
  },
])

const imageCanvasOptions: Array<{
  id: ImageCanvas
  label: string
  detail: string
  width: number
  height: number
}> = [
  {
    id: 'square',
    label: '正方形',
    detail: '1024 × 1024',
    width: 1024,
    height: 1024,
  },
  {
    id: 'landscape',
    label: '横图',
    detail: '1152 × 768',
    width: 1152,
    height: 768,
  },
  {
    id: 'portrait',
    label: '竖图',
    detail: '768 × 1152',
    width: 768,
    height: 1152,
  },
]

const selectedImageCanvas = computed(
  () =>
    imageCanvasOptions.find((option) => option.id === imageCanvas.value) ??
    imageCanvasOptions[0],
)

const selectedKnowledgeBase = computed(() =>
  knowledgeBases.value.find(
    (knowledgeBase) => knowledgeBase.id === selectedKnowledgeBaseId.value,
  ),
)

const activeKnowledgeBases = computed(() => {
  const ids = new Set(
    activeConversationRecord.value?.knowledgeBaseIds ?? [],
  )
  return knowledgeBases.value.filter((knowledgeBase) =>
    ids.has(knowledgeBase.id),
  )
})

const totalKnowledgeDocuments = computed(() =>
  knowledgeBases.value.reduce(
    (total, knowledgeBase) => total + knowledgeBase.documents.length,
    0,
  ),
)

const totalKnowledgeChunks = computed(() =>
  knowledgeBases.value.reduce(
    (total, knowledgeBase) => total + knowledgeBase.chunks.length,
    0,
  ),
)

const knowledgePersistenceLabel = computed(() => {
  if (knowledgePersistenceState.value === 'loading') return '正在读取资料'
  if (knowledgePersistenceState.value === 'saving') return '正在保存资料'
  if (knowledgePersistenceState.value === 'error') return '资料保存失败'
  return '资料已保存'
})

const activeConversationTitle = computed(
  () => activeConversationRecord.value?.label ?? '新的离线对话',
)

function getConversationGroup(updatedAt: number) {
  const elapsed = Date.now() - updatedAt
  if (elapsed < 24 * 60 * 60 * 1000) return '今天'
  if (elapsed < 7 * 24 * 60 * 60 * 1000) return '近 7 天'
  return '更早'
}

const conversationItems = computed<ConversationRow[]>(() => {
  const keyword = conversationSearch.value.trim().toLowerCase()
  return [...conversations.value]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .filter((conversation) =>
      keyword ? conversation.label.toLowerCase().includes(keyword) : true,
    )
    .map((conversation) => ({
      id: conversation.id,
      label: conversation.label,
      group: getConversationGroup(conversation.updatedAt),
      disabled:
        isGenerating.value && conversation.id !== activeConversation.value,
    }))
})

const latestAssistantId = computed(() => {
  for (let index = messages.value.length - 1; index >= 0; index -= 1) {
    if (messages.value[index].role === 'assistant') {
      return messages.value[index].id
    }
  }
  return -1
})

const quickPrompts = [
  '请介绍当前模型适合完成哪些任务',
  '帮我总结接下来上传的文件',
  '识别并整理接下来上传图片中的内容',
  '帮我起草一份结构清晰的工作材料',
]

function useQuickPrompt(prompt: string) {
  senderText.value = prompt
  void nextTick(() => {
    resizeComposer()
    focusSenderEnd()
  })
}

const visionModelRecommendations = [
  {
    label: '推荐 · 速度更快',
    name: '图片模型 · 快速版',
    size: '6.1 GB',
    note: '适合当前电脑，可以看图片、识别图片中的文字，也可以正常聊天。',
    command: 'ollama pull qwen3-vl:8b-instruct-q4_K_M',
  },
  {
    label: '效果更好 · 运行较慢',
    name: '图片模型 · 效果增强版',
    size: '20 GB',
    note: '回答和图片理解更强，但等待时间更长，也会占用更多电脑内存。',
    command: 'ollama pull qwen3-vl:30b-a3b-instruct-q4_K_M',
  },
]

const persistenceLabel = computed(() => {
  if (persistenceState.value === 'loading') return '正在读取本地数据'
  if (persistenceState.value === 'saving') return '正在保存'
  if (persistenceState.value === 'error') return '本地保存异常'
  return '本地数据已保存'
})

const totalModelBytes = ref(0)
const totalModelSize = computed(() => formatModelSize(totalModelBytes.value))
const ollamaConnectionLabel = import.meta.env.DEV
  ? '这台电脑'
  : '运行服务的电脑'
const ollamaStateLabel = computed(() => {
  if (ollamaConnectionState.value === 'checking') return '正在检测'
  if (ollamaConnectionState.value === 'online') return '服务在线'
  if (ollamaConnectionState.value === 'degraded') return '连接异常'
  return '服务离线'
})
const ollamaStateCode = computed(() => {
  if (ollamaConnectionState.value === 'checking') return '正在检查运行状态'
  if (ollamaConnectionState.value === 'online') return 'AI 服务可以使用'
  if (ollamaConnectionState.value === 'degraded') return '部分功能暂时不可用'
  return 'AI 服务尚未启动'
})
const ollamaStateDescription = computed(() => {
  if (ollamaConnectionState.value === 'checking') {
    return '正在检查服务和可用模型，请稍候'
  }
  if (ollamaConnectionState.value === 'online') {
    return `已连接到${ollamaConnectionLabel} · 找到 ${models.length} 个模型`
  }
  if (ollamaConnectionState.value === 'degraded') {
    return ollamaError.value || '部分功能暂时不可用，请重新检查'
  }
  return ollamaError.value || '请先启动 AI 服务，然后重新检查'
})

const systemChecks = computed(() => [
  {
    label: 'AI 服务',
    value: ollamaConnected.value ? '运行正常' : '未连接',
    ok: ollamaConnected.value,
  },
  {
    label: '服务版本',
    value: ollamaVersion.value,
    ok: ollamaConnected.value,
  },
  {
    label: '连接位置',
    value: ollamaConnectionLabel,
    ok: ollamaConnectionState.value === 'online',
  },
  {
    label: '模型信息',
    value: ollamaDetailFailures.value
      ? `${ollamaDetailFailures.value} 个读取失败`
      : '读取正常',
    ok:
      ollamaConnected.value &&
      ollamaConnectionState.value !== 'degraded',
  },
  {
    label: '找到的模型',
    value: `${models.length} 个`,
    ok: models.length > 0,
  },
  {
    label: '正在使用的模型',
    value: `${runningModelIds.value.length} 个`,
    ok: ollamaConnected.value,
  },
  {
    label: '最后检测',
    value: ollamaLastCheckedAt.value,
    ok: ollamaConnected.value,
  },
])

function isImageGenerationMainFile(file: File) {
  return (
    /flux.?2.*klein|z.?image.*turbo/i.test(file.name) &&
    !/qwen|text.?encoder|vae|(?:^|[-_.])ae(?:[-_.]|$)/i.test(file.name)
  )
}

function isImageVaeFile(file: File) {
  return (
    /flux.?2.*vae|(?:^|[-_.])vae(?:[-_.]|$)|(?:^|[-_.])ae(?:[-_.]|$)/i.test(
      file.name,
    ) || file.name.toLowerCase() === 'diffusion_pytorch_model.safetensors'
  )
}

function isSingleImageModelFile(file: File) {
  return (
    /stable.?diffusion|sdxl|sd.?3|juggernaut|dreamshaper/i.test(file.name) &&
    !isImageVaeFile(file)
  )
}

function getImageImportFileRole(file: File) {
  if (isImageGenerationMainFile(file) || isSingleImageModelFile(file)) return '图片主模型'
  if (isImageVaeFile(file)) return '图片处理文件'
  if (/qwen|text.?encoder/i.test(file.name)) return '文字理解文件'
  return '配套文件'
}

const imageImportAnalysis = computed(() => {
  const files = selectedImageImportFiles.value
  const main = files.find(isImageGenerationMainFile)
  const vae = files.find(isImageVaeFile)
  const encoders = files.filter(
    (file) => file.name.toLowerCase().endsWith('.gguf') && /qwen|text.?encoder/i.test(file.name),
  )
  const wantsEightB = Boolean(main && /9b/i.test(main.name))
  const encoder =
    encoders.find((file) => wantsEightB ? /8b/i.test(file.name) : /4b/i.test(file.name)) ||
    encoders[0]
  const single = files.find(isSingleImageModelFile)
  const missing: string[] = []

  if (main) {
    if (!encoder) missing.push(wantsEightB ? 'Qwen3-8B 文字理解文件' : 'Qwen3-4B 文字理解文件')
    if (!vae) missing.push('FLUX.2 图片处理文件')
  } else if (!single) {
    missing.push('图片主模型文件')
  }

  return {
    main,
    encoder,
    vae,
    single,
    missing,
    configured: Boolean(single || (main && encoder && vae)),
  }
})

const importMetadata = computed(() => {
  const files: File[] =
    importMode.value === 'image'
      ? selectedImageImportFiles.value
      : ([...selectedModelFiles.value, selectedProjectorFile.value].filter(
          Boolean,
        ) as File[])
  const fileName =
    importMode.value === 'image'
      ? imageImportAnalysis.value.main?.name ||
        imageImportAnalysis.value.single?.name ||
        files[0]?.name ||
        '图片模型'
      : selectedImportFile.value?.name ?? 'Qwen3-8B-Q4_K_M.gguf'
  const totalSize = files.reduce((total, file) => total + file.size, 0)
  return {
    fileName,
    projectorFileName: selectedProjectorFile.value?.name ?? '',
    isVisionImport:
      importMode.value === 'chat' && Boolean(selectedProjectorFile.value),
    isImageImport: importMode.value === 'image',
    modelFileCount: selectedModelFiles.value.length,
    fileCount: files.length,
    size: totalSize
      ? `${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB`
      : '5.03 GB',
  }
})

const importDetection = computed(() => {
  const count = selectedFiles.value.length
  if (!count) {
    return {
      tone: 'idle',
      title: '选择下载好的模型文件',
      detail: '直接选择下载页中的全部模型文件，系统会自动判断用途并组合，不需要先选择功能。',
    }
  }
  if (importMode.value === 'image') {
    if (!imageImportAnalysis.value.configured) {
      return {
        tone: 'warning',
        title: '已识别为图片创作模型，但文件还不完整',
        detail: `还需要：${imageImportAnalysis.value.missing.join('、')}。请从同一个下载页面一次选全。`,
      }
    }
    return {
      tone: 'success',
      title: '已识别为图片生成与修改模型',
      detail: `共 ${selectedImageImportFiles.value.length} 个文件，将自动组合使用；与聊天模型重复的文件会直接复用，不会重复占用空间。`,
    }
  }
  if (!selectedImportFile.value && selectedProjectorFile.value) {
    return {
      tone: 'warning',
      title: '还缺少主要模型文件',
      detail: '当前只识别到图片配套文件，请返回同一个下载页，再选择体积更大的主要文件。',
    }
  }
  if (selectedImportFile.value && selectedProjectorFile.value) {
    return {
      tone: 'success',
      title: '已自动组合为图片模型',
      detail: '两个文件会一起安装。安装完成后，系统还会自动验证是否真的可以识别图片。',
    }
  }
  if (selectedModelFiles.value.length > 1) {
    const splitError = validateSplitGgufFiles(selectedModelFiles.value)
    return splitError
      ? {
          tone: 'warning',
          title: '模型分片选择不完整或不匹配',
          detail: splitError,
        }
      : {
          tone: 'success',
          title: `已识别为 ${selectedModelFiles.value.length} 个 GGUF 分片`,
          detail: '全部分片会按顺序校验、写入并组合为一个模型，不会把较小分片误认为图片配套文件。',
        }
  }
  return {
    tone: 'success',
    title: '已识别为单文件模型',
    detail: '这个文件会作为普通聊天模型安装；如果下载页另有图片配套文件，请把两个文件一起选择。',
  }
})

const importCapabilityLabel = computed(() => {
  if (importMode.value === 'image') return '可以生成图片和修改图片'
  const capabilities = importDetectedCapabilities.value
  if (capabilities.includes('vision')) return '可以聊天和识别图片'
  if (capabilities.includes('embedding')) return '适合查找本地资料'
  if (capabilities.includes('thinking')) return '可以聊天并显示回答思路'
  return '可以正常聊天'
})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const answerMarkdownRenderer = new marked.Renderer()
answerMarkdownRenderer.code = ({ text, lang }) => {
  const language = escapeHtml((lang || '代码').split(/\s+/)[0])
  return [
    '<div class="answer-code">',
    '<div class="answer-code-heading">',
    `<span>${language}</span>`,
    '<button type="button" data-copy-code>复制代码</button>',
    '</div>',
    `<pre><code>${escapeHtml(text)}</code></pre>`,
    '</div>',
  ].join('')
}

function renderAnswerText(value: string) {
  const html = marked.parse(
    value.replace(/^[\u200B\u200C\u200D\u200E\u200F\uFEFF]/, ''),
    {
      renderer: answerMarkdownRenderer,
      gfm: true,
      breaks: true,
      async: false,
    },
  ) as string
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['img', 'iframe', 'video', 'audio', 'style'],
  })
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '发生未知错误'
}

function getModelContextTokens(show?: OllamaShowResponse) {
  const entry = Object.entries(show?.model_info ?? {}).find(([key]) =>
    key.endsWith('.context_length'),
  )
  return typeof entry?.[1] === 'number' ? entry[1] : 0
}

function getContextLabel(show?: OllamaShowResponse) {
  const value = getModelContextTokens(show)
  if (!value) return '默认'
  return value >= 1024 ? `${Math.round(value / 1024)}K` : `${value}`
}

function normalizeConversation(
  conversation: Partial<ConversationRecord>,
): ConversationRecord {
  const timestamp = Date.now()
  const restoredMessages = Array.isArray(conversation.messages)
    ? conversation.messages.map((message) => ({
        ...message,
        loading: false,
        content:
          message.loading && !message.content
            ? '上次生成已中断，你可以点击“重新生成”继续。'
            : message.content,
      }))
    : []

  return {
    id:
      typeof conversation.id === 'string' && conversation.id
        ? conversation.id
        : `c-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    label:
      typeof conversation.label === 'string' && conversation.label.trim()
        ? conversation.label.trim()
        : '新的离线对话',
    createdAt:
      typeof conversation.createdAt === 'number'
        ? conversation.createdAt
        : timestamp,
    updatedAt:
      typeof conversation.updatedAt === 'number'
        ? conversation.updatedAt
        : timestamp,
    modelId:
      typeof conversation.modelId === 'string' ? conversation.modelId : '',
    systemPrompt:
      typeof conversation.systemPrompt === 'string'
        ? conversation.systemPrompt
        : '你是 ShotAI，一个完全离线运行、严谨可靠的中文助手。',
    settings: {
      ...defaultConversationSettings,
      ...(conversation.settings ?? {}),
    },
    knowledgeBaseIds: Array.isArray(conversation.knowledgeBaseIds)
      ? conversation.knowledgeBaseIds.filter(
          (knowledgeBaseId): knowledgeBaseId is string =>
            typeof knowledgeBaseId === 'string',
        )
      : [],
    messages: restoredMessages,
  }
}

async function restoreWorkspace() {
  persistenceState.value = 'loading'
  try {
    const saved = await loadWorkspaceState<WorkspaceState>()
    if (saved?.version === 1 && Array.isArray(saved.conversations)) {
      const restored = saved.conversations.map(normalizeConversation)
      if (restored.length) conversations.value = restored
      activeConversation.value = restored.some(
        (conversation) => conversation.id === saved.activeConversation,
      )
        ? saved.activeConversation
        : restored[0]?.id ?? 'c-default'
      darkMode.value = saved.darkMode !== false
      showReasoning.value = saved.showReasoning === true
      messageId = Math.max(
        messageId,
        ...conversations.value.flatMap((conversation) =>
          conversation.messages.map((message) => message.id),
        ),
      )
    }
    persistenceState.value = 'saved'
  } catch (error) {
    persistenceState.value = 'error'
    ElMessage.warning(`无法恢复本地对话：${getErrorMessage(error)}`)
  } finally {
    storageReady.value = true
  }
}

async function persistWorkspace() {
  if (!storageReady.value) return
  persistenceState.value = 'saving'
  const state: WorkspaceState = {
    version: 1,
    activeConversation: activeConversation.value,
    darkMode: darkMode.value,
    showReasoning: showReasoning.value,
    conversations: conversations.value,
  }

  try {
    const serializable = JSON.parse(JSON.stringify(state)) as WorkspaceState
    await saveWorkspaceState(serializable)
    persistenceState.value = 'saved'
  } catch (error) {
    persistenceState.value = 'error'
    console.error('ShotAI local persistence failed', error)
  }
}

function scheduleWorkspaceSave() {
  if (!storageReady.value) return
  persistenceState.value = 'saving'
  if (persistenceTimer) window.clearTimeout(persistenceTimer)
  persistenceTimer = window.setTimeout(() => {
    void persistWorkspace()
  }, 250)
}

function normalizeKnowledgeBase(
  knowledgeBase: Partial<KnowledgeBase>,
): KnowledgeBase {
  const fallback = createKnowledgeBase()
  const documents = Array.isArray(knowledgeBase.documents)
    ? knowledgeBase.documents.filter(
        (document): document is KnowledgeDocument =>
          Boolean(document?.id && document?.name),
      )
    : []
  const documentIds = new Set(documents.map((document) => document.id))
  const chunks = Array.isArray(knowledgeBase.chunks)
    ? knowledgeBase.chunks.filter(
        (chunk) =>
          Boolean(chunk?.id && chunk?.content) &&
          documentIds.has(chunk.documentId),
      )
    : []

  return {
    ...fallback,
    ...knowledgeBase,
    id: knowledgeBase.id || fallback.id,
    name: knowledgeBase.name?.trim() || '未命名资料夹',
    description: knowledgeBase.description?.trim() || '保存在这台电脑上的资料',
    documents,
    chunks,
  }
}

async function restoreKnowledge() {
  knowledgePersistenceState.value = 'loading'
  try {
    const saved = await loadKnowledgeState<KnowledgeState>()
    if (saved?.version === 1 && Array.isArray(saved.bases)) {
      knowledgeBases.value = saved.bases.map(normalizeKnowledgeBase)
      embeddingModelId.value =
        typeof saved.embeddingModelId === 'string'
          ? saved.embeddingModelId
          : ''
      selectedKnowledgeBaseId.value = knowledgeBases.value.some(
        (knowledgeBase) => knowledgeBase.id === saved.selectedBaseId,
      )
        ? saved.selectedBaseId
        : knowledgeBases.value[0]?.id ?? ''
    }
    if (!knowledgeBases.value.length) {
      const defaultBase = createKnowledgeBase()
      knowledgeBases.value = [defaultBase]
      selectedKnowledgeBaseId.value = defaultBase.id
    }
    knowledgePersistenceState.value = 'saved'
  } catch (error) {
    knowledgePersistenceState.value = 'error'
    ElMessage.warning(`无法读取已保存的资料：${getErrorMessage(error)}`)
  } finally {
    knowledgeStorageReady.value = true
  }
}

async function persistKnowledge() {
  if (!knowledgeStorageReady.value) return
  knowledgePersistenceState.value = 'saving'
  const state: KnowledgeState = {
    version: 1,
    selectedBaseId: selectedKnowledgeBaseId.value,
    embeddingModelId: embeddingModelId.value,
    bases: knowledgeBases.value,
  }

  try {
    const serializable = JSON.parse(JSON.stringify(state)) as KnowledgeState
    await saveKnowledgeState(serializable)
    knowledgePersistenceState.value = 'saved'
  } catch (error) {
    knowledgePersistenceState.value = 'error'
    console.error('ShotAI knowledge persistence failed', error)
  }
}

function scheduleKnowledgeSave() {
  if (!knowledgeStorageReady.value) return
  knowledgePersistenceState.value = 'saving'
  if (knowledgePersistenceTimer) {
    window.clearTimeout(knowledgePersistenceTimer)
  }
  knowledgePersistenceTimer = window.setTimeout(() => {
    void persistKnowledge()
  }, 400)
}

async function mapOllamaModel(
  model: OllamaModel,
  runningIds: Set<string>,
  readDetails = true,
): Promise<{ model: LocalModel; detailError?: string }> {
  let show: OllamaShowResponse | undefined
  let detailError: string | undefined
  const modelId = model.model || model.name
  if (readDetails) {
    try {
      show = await showOllamaModel(modelId)
    } catch (error) {
      detailError = getErrorMessage(error)
    }
  }

  return {
    model: {
      id: modelId,
      name: model.name || modelId,
      family: show?.details.family || model.details.family || '未知',
      capabilities: show?.capabilities ?? [],
      parameters:
        show?.details.parameter_size || model.details.parameter_size || '未知',
      quantization:
        show?.details.quantization_level ||
        model.details.quantization_level ||
        '未知',
      size: formatModelSize(model.size),
      context: getContextLabel(show),
      contextTokens: getModelContextTokens(show),
      status: runningIds.has(modelId) ? 'ready' : 'sleeping',
      digest: formatDigest(model.digest),
      rawDigest: model.digest,
      detailsAvailable: Boolean(show),
    },
    detailError,
  }
}

async function refreshOllama(options: { announce?: boolean } = {}) {
  if (ollamaRefreshing.value) return
  ollamaRefreshing.value = true
  if (!ollamaConnected.value) ollamaConnectionState.value = 'checking'

  try {
    const [version, listedModels, runningModels] = await Promise.all([
      getOllamaVersion(),
      listOllamaModels(),
      listRunningModels(),
    ])
    const runningIds = new Set(
      runningModels.flatMap((model) => [model.model || model.name, model.name]),
    )
    const shouldReadDetails = modelDetailsAvailable.value || options.announce
    const mappedResults = await Promise.all(
      listedModels.map((model) =>
        mapOllamaModel(model, runningIds, shouldReadDetails),
      ),
    )
    const mappedModels = mappedResults.map((result) => result.model)
    const detailErrors = mappedResults
      .map((result) => result.detailError)
      .filter((error): error is string => Boolean(error))

    const allDetailsFailed =
      shouldReadDetails &&
      listedModels.length > 0 &&
      detailErrors.length === listedModels.length
    if (allDetailsFailed) modelDetailsAvailable.value = false
    if (shouldReadDetails && detailErrors.length === 0) {
      modelDetailsAvailable.value = true
    }
    const detailsUnavailable =
      listedModels.length > 0 &&
      (!modelDetailsAvailable.value || detailErrors.length > 0)

    models.splice(0, models.length, ...mappedModels)
    totalModelBytes.value = listedModels.reduce(
      (total, model) => total + model.size,
      0,
    )
    runningModelIds.value = [...runningIds]
    ollamaConnected.value = true
    ollamaConnectionState.value = detailsUnavailable ? 'degraded' : 'online'
    ollamaVersion.value = version.version
    ollamaDetailFailures.value = modelDetailsAvailable.value
      ? detailErrors.length
      : listedModels.length
    ollamaError.value = detailsUnavailable
      ? '聊天服务可以使用，但模型的图片和思考能力暂时无法确认。请在主机上换用最新发布包并重新启动。'
      : ''
    ollamaLastCheckedAt.value = nowTime()

    if (!currentModelId.value || !models.some((model) => model.id === currentModelId.value)) {
      currentModelId.value = models[0]?.id ?? ''
    }
    if (
      !embeddingModelId.value ||
      !embeddingModels.value.some(
        (model) => model.id === embeddingModelId.value,
      )
    ) {
      embeddingModelId.value = embeddingModels.value[0]?.id ?? ''
    }

    const greeting = messages.value[0]
    if (
      greeting?.role === 'assistant' &&
      messages.value.every((message) => message.role !== 'user')
    ) {
      greeting.content = models.length
        ? `AI 服务已经连接，找到 ${models.length} 个可用模型。\n\n当前使用：${selectedModel.value.name}。现在可以直接开始对话。`
        : 'AI 服务已经连接，但还没有找到可用模型。\n\n请打开“模型管理”添加下载好的模型文件。'
    }

    if (options.announce) {
      if (ollamaConnectionState.value === 'degraded') {
        ElMessage.warning(ollamaError.value)
      } else {
        ElMessage.success(`AI 服务已连接，找到 ${models.length} 个模型`)
      }
    }
  } catch (error) {
    ollamaConnected.value = false
    ollamaConnectionState.value = 'offline'
    ollamaVersion.value = '未连接'
    ollamaError.value = getErrorMessage(error)
    ollamaDetailFailures.value = 0
    ollamaLastCheckedAt.value = nowTime()
    models.splice(0, models.length)
    runningModelIds.value = []
    totalModelBytes.value = 0

    const greeting = messages.value[0]
    if (
      greeting?.role === 'assistant' &&
      messages.value.every((message) => message.role !== 'user')
    ) {
      greeting.content =
        'AI 服务还没有启动。\n\n请先启动 ShotAI 服务，然后打开“运行检查”重新检查。'
    }
    if (options.announce) ElMessage.error(ollamaError.value)
  } finally {
    ollamaRefreshing.value = false
  }
}

function nowTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function toggleConversationSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

function formatMonitorBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 GB'
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function formatMonitorDuration(seconds = 0) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days) return `${days} 天 ${hours} 小时`
  if (hours) return `${hours} 小时 ${minutes} 分钟`
  return `${Math.max(0, minutes)} 分钟`
}

function maskMonitorIp(ip: string) {
  if (!monitorHideIps.value) return ip
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean)
    return `${parts.slice(0, 2).join(':')}:••••`
  }
  const parts = ip.split('.')
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.•••.•••` : '••••••••'
}

function monitorClientLabel(userAgent: string) {
  if (/Edg\//i.test(userAgent)) return 'Microsoft Edge'
  if (/Chrome\//i.test(userAgent)) return 'Google Chrome'
  if (/Firefox\//i.test(userAgent)) return 'Firefox'
  if (/Safari\//i.test(userAgent)) return 'Safari'
  return '浏览器设备'
}

function appendMonitorHistory(target: { value: number[] }, value = 0) {
  target.value = [...target.value.slice(-23), Math.max(0, Math.min(100, value))]
}

function monitorChartPoints(values: number[]) {
  const normalized = values.length > 1 ? values : [0, values[0] || 0]
  return normalized
    .map((value, index) => {
      const x = (index / Math.max(1, normalized.length - 1)) * 100
      const y = 42 - (Math.max(0, Math.min(100, value)) / 100) * 38
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

async function refreshMonitor() {
  if (!monitorAuthenticated.value || monitorLoading.value) return
  monitorLoading.value = true
  try {
    const snapshot = await getMonitorSnapshot()
    monitorSnapshot.value = snapshot
    appendMonitorHistory(monitorCpuHistory, snapshot.performance.cpu.usagePercent)
    appendMonitorHistory(monitorMemoryHistory, snapshot.performance.memory.usagePercent)
    appendMonitorHistory(monitorGpuHistory, snapshot.performance.gpu?.usagePercent || 0)
  } catch (error) {
    monitorAuthenticated.value = false
    monitorLoginError.value = getErrorMessage(error)
    if (monitorTimer) window.clearInterval(monitorTimer)
    monitorTimer = undefined
  } finally {
    monitorLoading.value = false
  }
}

function startMonitorRefresh() {
  if (monitorTimer) window.clearInterval(monitorTimer)
  void refreshMonitor()
  monitorTimer = window.setInterval(() => void refreshMonitor(), 4_000)
}

async function openMonitor() {
  if (!systemInfo.value.isHost) {
    ElMessage.warning('监控平台只能在运行 ShotAI 的主机上打开')
    return
  }
  monitorDrawerOpen.value = true
  monitorLoginError.value = ''
  try {
    const session = await getMonitorSession()
    monitorAuthenticated.value = session.authenticated
    monitorUsername.value = session.username || 'admin'
    if (session.authenticated) startMonitorRefresh()
  } catch (error) {
    monitorAuthenticated.value = false
    monitorLoginError.value = getErrorMessage(error)
  }
}

async function submitMonitorLogin() {
  if (!monitorUsername.value.trim() || !monitorPassword.value) {
    monitorLoginError.value = '请输入用户名和密码'
    return
  }
  monitorLoginLoading.value = true
  monitorLoginError.value = ''
  try {
    const session = await loginMonitor(
      monitorUsername.value.trim(),
      monitorPassword.value,
    )
    monitorAuthenticated.value = session.authenticated
    monitorPassword.value = ''
    startMonitorRefresh()
  } catch (error) {
    monitorLoginError.value = getErrorMessage(error)
  } finally {
    monitorLoginLoading.value = false
  }
}

async function signOutMonitor() {
  try {
    await logoutMonitor()
  } catch {
    // A stale session is already effectively signed out.
  }
  monitorAuthenticated.value = false
  monitorSnapshot.value = null
  monitorPassword.value = ''
  if (monitorTimer) window.clearInterval(monitorTimer)
  monitorTimer = undefined
}

function switchView(view: ViewKey) {
  activeView.value = view
  sidebarOpen.value = false

  if (view === 'models') {
    modelDrawerOpen.value = true
    activeView.value = 'chat'
  }

  if (view === 'knowledge') {
    knowledgeDrawerOpen.value = true
    activeView.value = 'chat'
  }

  if (view === 'diagnostics') {
    diagnosticsDrawerOpen.value = true
    activeView.value = 'chat'
  }

  if (view === 'settings') {
    settingsDrawerOpen.value = true
    activeView.value = 'chat'
  }

  if (view === 'monitor') {
    void openMonitor()
    activeView.value = 'chat'
  }
}

function openCapability(key: CapabilityKey) {
  settingsDrawerOpen.value = false
  if (key === 'knowledge') {
    knowledgeDrawerOpen.value = true
    return
  }
  if (key === 'image') {
    openImageStudio()
    return
  }
  if (!ollamaConnected.value) {
    diagnosticsDrawerOpen.value = true
    return
  }
  modelDrawerOpen.value = true
}

function createConversation() {
  if (isGenerating.value) stopGeneration()
  pendingImages.value = []
  pendingAttachments.value = []
  const conversation = createConversationRecord()
  conversation.modelId = currentModelId.value || models[0]?.id || ''
  conversation.messages = []
  conversations.value.unshift(conversation)
  activeConversation.value = conversation.id
  sidebarOpen.value = false
  void nextTick(focusSenderEnd)
}

function handleConversationChange(item: ConversationRow) {
  if (isGenerating.value) stopGeneration()
  pendingImages.value = []
  pendingAttachments.value = []
  activeConversation.value = item.id
  sidebarOpen.value = false
  scrollMessagesToBottom()
}

async function renameConversation(conversationId = activeConversation.value) {
  const conversation = conversations.value.find(
    (item) => item.id === conversationId,
  )
  if (!conversation) return

  try {
    const result = await ElMessageBox.prompt(
      '名称只保存在本机，用于快速定位历史任务。',
      '重命名对话',
      {
        inputValue: conversation.label,
        inputPlaceholder: '输入对话名称',
        inputValidator: (value) =>
          value.trim().length > 0 || '对话名称不能为空',
        inputErrorMessage: '对话名称不能为空',
        confirmButtonText: '保存',
        cancelButtonText: '取消',
      },
    )
    conversation.label = result.value.trim().slice(0, 60)
    conversation.updatedAt = Date.now()
    ElMessage.success('对话名称已更新')
  } catch {
    // User cancelled.
  }
}

async function deleteConversation(conversationId = activeConversation.value) {
  const conversation = conversations.value.find(
    (item) => item.id === conversationId,
  )
  if (!conversation) return

  try {
    await ElMessageBox.confirm(
      `将删除“${conversation.label}”及其中的全部消息。此操作无法撤销。`,
      '删除本地对话',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'danger-confirm-button',
      },
    )
  } catch {
    return
  }

  if (conversationId === activeConversation.value && isGenerating.value) {
    stopGeneration()
  }
  if (conversationId === activeConversation.value) {
    pendingImages.value = []
    pendingAttachments.value = []
  }
  const index = conversations.value.findIndex(
    (item) => item.id === conversationId,
  )
  conversations.value.splice(index, 1)

  if (!conversations.value.length) {
    const replacement = createConversationRecord()
    replacement.modelId = models[0]?.id ?? ''
    conversations.value.push(replacement)
  }
  if (conversationId === activeConversation.value) {
    activeConversation.value = conversations.value[0].id
  }
  ElMessage.success('本地对话已删除')
}

function handleConversationMenu(command: unknown, item: ConversationRow) {
  if (command === 'rename') void renameConversation(item.id)
  if (command === 'delete') void deleteConversation(item.id)
}

async function clearCurrentConversation() {
  const conversation = activeConversationRecord.value
  if (!conversation) return
  try {
    await ElMessageBox.confirm(
      '将删除当前对话中的全部消息，但保留对话名称和设置。',
      '清空消息',
      {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  if (isGenerating.value) stopGeneration()
  pendingImages.value = []
  pendingAttachments.value = []
  conversation.messages = []
  conversation.updatedAt = Date.now()
  ElMessage.success('当前消息已清空')
}

function exportCurrentConversation() {
  const conversation = activeConversationRecord.value
  if (!conversation) return
  const lines = [
    `# ${conversation.label}`,
    '',
    `- 导出时间：${new Date().toLocaleString('zh-CN')}`,
    `- 模型：${selectedModel.value.name}`,
    '',
    ...conversation.messages.flatMap((message) => [
      `## ${message.role === 'user' ? '用户' : 'ShotAI'} · ${message.time}`,
      '',
      message.content,
      ...(message.images?.length
        ? [
            '',
            `图片附件：${message.images
              .map(
                (image) =>
                  `${image.name}（${image.width}×${image.height}）`,
              )
              .join('、')}`,
          ]
        : []),
      ...(message.attachments?.length
        ? [
            '',
            `文件：${message.attachments
              .map(
                (attachment) =>
                  `${attachment.name}（${attachment.characterCount.toLocaleString()} 字）`,
              )
              .join('、')}`,
          ]
        : []),
      '',
    ]),
  ]
  const blob = new Blob([lines.join('\n')], {
    type: 'text/markdown;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${conversation.label.replace(/[\\/:*?"<>|]/g, '-')}.md`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success('对话已保存为文本文件')
}

function handleConversationAction(command: string | number | object) {
  if (command === 'export') exportCurrentConversation()
  if (command === 'rename') void renameConversation()
  if (command === 'clear') void clearCurrentConversation()
  if (command === 'delete') void deleteConversation()
}

function legacyCopyText(content: string) {
  const textarea = document.createElement('textarea')
  textarea.value = content
  textarea.readOnly = true
  textarea.style.position = 'fixed'
  textarea.style.inset = '-1000px auto auto -1000px'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  let copied = false
  try {
    copied = document.execCommand('copy')
  } finally {
    textarea.remove()
  }
  return copied
}

async function writeClipboard(content: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content)
      return true
    } catch {
      // Intranet pages opened over HTTP often block the modern clipboard API.
    }
  }
  return legacyCopyText(content)
}

async function copyMessage(content: string) {
  try {
    if (!(await writeClipboard(content))) throw new Error('copy failed')
    ElMessage.success('内容已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本')
  }
}

async function handleAnswerClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  const button = target.closest<HTMLButtonElement>('[data-copy-code]')
  if (!button) return
  const code = button.closest('.answer-code')?.querySelector('code')?.textContent
  if (!code) return
  if (await writeClipboard(code)) {
    const originalText = button.textContent
    button.textContent = '已复制'
    window.setTimeout(() => {
      button.textContent = originalText || '复制代码'
    }, 1_200)
  } else {
    ElMessage.error('复制失败，请手动选择代码')
  }
}

async function copyInstallCommand(command: string) {
  try {
    if (!(await writeClipboard(command))) throw new Error('copy failed')
    ElMessage.success('安装内容已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择这段内容')
  }
}

function resizeComposer() {
  const input = senderRef.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = `${Math.min(input.scrollHeight, 220)}px`
}

function focusSenderEnd() {
  const input = senderRef.value
  if (!input) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    event.preventDefault()
    if (!isGenerating.value) void handleSubmit()
  }
}

function handleComposerPaste(event: ClipboardEvent) {
  const files = event.clipboardData?.files
  if (!files?.length) return
  event.preventDefault()
  handlePastedFiles(files[0], files)
}

function resetConversationSettings() {
  const conversation = activeConversationRecord.value
  if (!conversation) return
  conversation.systemPrompt =
    '你是 ShotAI，一个完全离线运行、严谨可靠的中文助手。'
  conversation.settings = { ...defaultConversationSettings }
  conversation.updatedAt = Date.now()
  ElMessage.success('当前对话参数已恢复默认')
}

async function clearSavedConversations() {
  try {
    await ElMessageBox.confirm(
      '将删除这个浏览器中保存的全部对话，模型和资料不会被删除。',
      '清空全部对话',
      {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  if (isGenerating.value) stopGeneration()
  await clearWorkspaceState()
  const conversation = createConversationRecord()
  conversation.modelId = models[0]?.id ?? ''
  conversations.value = [conversation]
  activeConversation.value = conversation.id
  ElMessage.success('全部对话已清空')
}

async function clearSavedKnowledge() {
  if (!totalKnowledgeDocuments.value) {
    ElMessage.info('当前没有已添加的资料')
    return
  }
  try {
    await ElMessageBox.confirm(
      '将删除这个浏览器中保存的全部资料内容，不会删除电脑上的原文件。',
      '清空全部资料',
      {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  await clearKnowledgeState()
  const defaultBase = createKnowledgeBase()
  knowledgeBases.value = [defaultBase]
  selectedKnowledgeBaseId.value = defaultBase.id
  embeddingModelId.value = ''
  conversations.value.forEach((conversation) => {
    conversation.knowledgeBaseIds = []
  })
  ElMessage.success('全部资料已清空')
}

async function refreshBrowserFiles() {
  try {
    if ('caches' in window) {
      const cacheNames = await window.caches.keys()
      await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // Reloading with a unique address still refreshes the entry page.
  }
  const url = new URL(window.location.href)
  url.searchParams.set('refresh', String(Date.now()))
  window.location.replace(url.toString())
}

async function clearModelCacheFiles() {
  if (!systemInfo.value.canManage || modelCacheCleaning.value) return
  try {
    await ElMessageBox.confirm(
      '将清理未完成的上传文件和已经没有模型使用的数据。已安装模型和图片模型不会被删除。',
      '清理模型临时文件',
      {
        type: 'warning',
        confirmButtonText: '开始清理',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  modelCacheCleaning.value = true
  try {
    const result = await cleanupModelCache()
    ElMessage.success(
      result.removedFiles
        ? `已清理 ${result.removedFiles} 个文件，共 ${formatFileSize(result.removedBytes)}`
        : '没有发现需要清理的模型临时文件',
    )
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  } finally {
    modelCacheCleaning.value = false
  }
}

function readFileAsDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () => {
      reject(reader.error ?? new Error('无法读取图片文件'))
    })
    reader.readAsDataURL(file)
  })
}

function loadBrowserImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('无法解析图片内容')))
    image.src = dataUrl
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('图片压缩失败'))
      },
      type,
      quality,
    )
  })
}

async function prepareMessageImage(file: File): Promise<MessageImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error(`${file.name} 不是支持的 JPG、PNG 或 WebP 图片`)
  }
  if (!file.size || file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name} 不能为空且不能超过 12 MB`)
  }

  const originalDataUrl = await readFileAsDataUrl(file)
  const image = await loadBrowserImage(originalDataUrl)
  const scale = Math.min(
    1,
    MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  )
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前浏览器无法处理图片')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)
  const quality = file.size > IMAGE_COMPRESSION_THRESHOLD ? 0.88 : 0.94
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  const dataUrl = await readFileAsDataUrl(blob)
  const size = blob.size
  const mimeType = blob.type

  return {
    id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    mimeType,
    dataUrl,
    width,
    height,
    size,
  }
}

async function prepareMessageAttachment(file: File): Promise<MessageAttachment> {
  validateKnowledgeFile(file)
  const extractedText = await extractKnowledgeText(file)
  const truncated = extractedText.length > MAX_ATTACHMENT_TEXT_CHARS
  const content = truncated
    ? `${extractedText.slice(0, MAX_ATTACHMENT_TEXT_CHARS - 2_000)}\n\n[内容过长，中间部分已省略]\n\n${extractedText.slice(-1_900)}`
    : extractedText

  return {
    id: `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    extension: getFileExtension(file.name).toUpperCase() || 'TEXT',
    size: file.size,
    content,
    characterCount: extractedText.length,
    truncated,
  }
}

function pendingFileCount() {
  return pendingImages.value.length + pendingAttachments.value.length
}

async function addMessageFiles(files: File[]) {
  if (attachmentProcessing.value) return
  if (composerMode.value === 'image') {
    if (!selectLocalImageEditProvider()) {
      ElMessage.warning('这台主机还没有准备可以修改图片的本地组件')
      openImageStudio()
      return
    }
    const imageFile = files.find((file) => file.type.startsWith('image/'))
    if (!imageFile) {
      ElMessage.warning('图片修改只能添加一张 JPG、PNG 或 WebP 图片')
      return
    }
    if (files.filter((file) => file.type.startsWith('image/')).length > 1) {
      ElMessage.warning('图片修改一次只能使用一张参考图，已选择第一张')
    }
    attachmentProcessing.value = true
    try {
      const preparedImage = await prepareMessageImage(imageFile)
      pendingImages.value = [preparedImage]
      pendingAttachments.value = []
      const ratio = preparedImage.width / preparedImage.height
      imageCanvas.value =
        ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square'
      ElMessage.success('参考图已添加，请描述想要的修改')
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      attachmentProcessing.value = false
    }
    return
  }
  const remaining = MAX_MESSAGE_ATTACHMENT_COUNT - pendingFileCount()
  if (remaining <= 0) {
    ElMessage.warning(`每条消息最多添加 ${MAX_MESSAGE_ATTACHMENT_COUNT} 个附件`)
    return
  }

  const candidates = files.slice(0, remaining)
  if (!candidates.length) return
  if (files.length > remaining) {
    ElMessage.warning(
      `已达到附件上限，仅添加前 ${remaining} 个文件`,
    )
  }

  attachmentProcessing.value = true
  try {
    for (const file of candidates) {
      try {
        if (file.type.startsWith('image/')) {
          if (pendingImages.value.length >= MAX_IMAGE_COUNT) {
            throw new Error(`每条消息最多添加 ${MAX_IMAGE_COUNT} 张图片`)
          }
          pendingImages.value.push(await prepareMessageImage(file))
        } else {
          pendingAttachments.value.push(await prepareMessageAttachment(file))
        }
      } catch (error) {
        ElMessage.error(getErrorMessage(error))
      }
    }
    if (pendingImages.value.length && !preferredVisionModel.value) {
      ElMessage.warning('图片已添加，但还没有可以识别图片的模型')
    }
  } finally {
    attachmentProcessing.value = false
  }
}

function openAttachmentPicker() {
  attachmentInputRef.value?.click()
}

async function refreshImageRuntime(options: { announce?: boolean } = {}) {
  if (imageRuntimeChecking.value) return
  imageRuntimeChecking.value = true
  try {
    imageRuntime.value = await getImageRuntimeStatus()
    if (
      imageModelId.value !== AUTO_IMAGE_PROVIDER_ID &&
      !imageProviderOptions.value.some(
        (provider) => provider.id === imageModelId.value,
      )
    ) {
      imageModelId.value = AUTO_IMAGE_PROVIDER_ID
    }
    if (options.announce) {
      if (imageRuntime.value.serviceOnline) {
        ElMessage.success('图片创作服务已经就绪')
      } else if (
        imageRuntime.value.runtimeFound &&
        imageRuntime.value.modelConfigured
      ) {
        ElMessage.warning('文件已经找到，请重新启动 ShotAI 以载入图片模型')
      } else {
        ElMessage.warning('图片组件尚未准备完整，请按照页面提示操作')
      }
    }
  } finally {
    imageRuntimeChecking.value = false
  }
}

function openImageModelPicker() {
  if (!systemInfo.value.canManage) {
    ElMessage.warning('请在运行 ShotAI 的主机上添加图片模型')
    return
  }
  openImportDialog()
}

function waitForImageRuntime(delay: number) {
  return new Promise((resolve) => window.setTimeout(resolve, delay))
}

async function removeImageModelFile(fileName: string) {
  if (!systemInfo.value.canManage || imageModelImporting.value) return
  try {
    await ElMessageBox.confirm(
      `将从主机中删除“${fileName}”。删除后相关图片模型可能无法继续使用。`,
      '删除图片模型文件',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  try {
    await deleteImageModelFile(fileName)
    imageModelImportStatus.value = '文件已删除，正在重新载入图片模型'
    imageModelImportProgress.value = 94
    const restartResult = await restartImageRuntime()
    if (restartResult.restartRequired) {
      imageModelImportProgress.value = 100
      imageModelImportStatus.value = '文件已删除，请重新启动 ShotAI'
      ElMessage.warning(imageModelImportStatus.value)
      await refreshImageRuntime()
      return
    }
    await waitForImageRuntime(900)
    await refreshImageRuntime()
    imageModelImportProgress.value = 100
    imageModelImportStatus.value = '图片模型列表已经更新'
    ElMessage.success('图片模型文件已删除')
  } catch (error) {
    ElMessage.error(getErrorMessage(error))
  }
}

function openImageStudio() {
  imageStudioOpen.value = true
  if (
    imageModelId.value !== AUTO_IMAGE_PROVIDER_ID &&
    !imageProviderOptions.value.some(
      (provider) => provider.id === imageModelId.value,
    )
  ) {
    imageModelId.value = AUTO_IMAGE_PROVIDER_ID
  }
  void refreshImageRuntime()
}

function openUnifiedModelManagement() {
  imageStudioOpen.value = false
  settingsDrawerOpen.value = false
  modelDrawerOpen.value = true
  void Promise.all([refreshOllama(), refreshImageRuntime()])
}

function getImageGenerationError(error: unknown) {
  const message = getErrorMessage(error)
  if (
    /(?:windows|linux|darwin|macos|mac os|platform|not supported|unsupported)/i.test(
      message,
    )
  ) {
    return '这台电脑当前还不能使用 Ollama 图片创作。官方目前仅支持 macOS，Windows 和 Linux 版本仍在准备中。'
  }
  if (/not found|没有找到/i.test(message)) {
    return '没有找到图片创作服务，请重新运行 ShotAI 启动器后再试。'
  }
  return message
}

async function restoreImageHistory() {
  try {
    const saved = await loadImageHistory<ImageHistoryItem[]>()
    imageHistory.value = Array.isArray(saved) ? saved.slice(0, 12) : []
  } catch {
    imageHistory.value = []
  }
}

async function persistImageHistory() {
  try {
    await saveImageHistory(
      imageHistory.value.slice(0, 12).map((item) => ({ ...item })),
    )
  } catch (error) {
    console.error('ShotAI image history save failed', error)
    ElMessage.warning('生成的图片暂时无法保存到历史记录')
  }
}

function openImageHistoryItem(item: ImageHistoryItem) {
  generatedImageUrl.value = item.dataUrl
  generatedImageModel.value = item.model
  imagePrompt.value = item.prompt
  imageCanvas.value = item.canvas
}

function formatImageHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

async function removeImageHistoryItem(itemId: string) {
  imageHistory.value = imageHistory.value.filter((item) => item.id !== itemId)
  await persistImageHistory()
}

async function clearGeneratedImageHistory() {
  try {
    await ElMessageBox.confirm(
      '将清除这个浏览器中保存的全部生成图片，不会删除图片模型。',
      '清空图片历史',
      {
        type: 'warning',
        confirmButtonText: '确认清空',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  imageHistory.value = []
  await clearImageHistory()
  ElMessage.success('图片历史已清空')
}

async function requestGeneratedImage(
  prompt: string,
  provider: ImageProviderOption,
  canvas: (typeof imageCanvasOptions)[number],
  signal: AbortSignal,
  update: (progress: number, status: string) => void,
  edit?: { source: MessageImage; strength: number },
) {
  if (provider.kind === 'local-runtime') {
    let currentProgress = 5
    const runningStatus = edit
      ? '正在参考原图进行修改，第一次会稍慢'
      : '正在载入并绘制，第一次会稍慢'
    update(currentProgress, runningStatus)
    imageProgressTimer = window.setInterval(() => {
      currentProgress = Math.min(
        90,
        currentProgress +
          Math.max(1, Math.round((92 - currentProgress) / 12)),
      )
      update(currentProgress, runningStatus)
    }, 800)
    if (edit) {
      return editImageWithLocalRuntime(prompt, edit.source.dataUrl, {
        signal,
        width: canvas.width,
        height: canvas.height,
        strength: edit.strength,
        steps: /z.?image/i.test(provider.modelId) ? 8 : 12,
        cfgScale: 1,
      })
    }
    return generateImageWithLocalRuntime(prompt, {
      signal,
      width: canvas.width,
      height: canvas.height,
      steps: /z.?image/i.test(provider.modelId) ? 8 : 4,
      cfgScale: 1,
      model: provider.modelId,
    })
  }

  return generateImageWithOllama(provider.modelId, prompt, {
    signal,
    width: canvas.width,
    height: canvas.height,
    onProgress: (completed, total) => {
      const progress = total
        ? Math.min(98, Math.max(3, Math.round((completed / total) * 100)))
        : imageProgress.value
      update(
        progress,
        total ? `正在绘制 · ${completed} / ${total}` : '正在绘制',
      )
    },
  })
}

async function rememberGeneratedImage(
  prompt: string,
  model: string,
  canvas: ImageCanvas,
  dataUrl: string,
) {
  imageHistory.value.unshift({
    id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl,
    prompt,
    model,
    canvas,
    createdAt: Date.now(),
  })
  imageHistory.value = imageHistory.value.slice(0, 12)
  await persistImageHistory()
}

async function createImage() {
  const prompt = imagePrompt.value.trim()
  if (!prompt) {
    ElMessage.warning('请先写下想要的画面')
    return
  }
  const provider = selectedImageProvider.value
  if (!provider) {
    ElMessage.warning('请先准备图片运行组件和模型文件')
    return
  }
  if (imageGenerating.value) return

  imageController = new AbortController()
  imageGenerating.value = true
  imageProgress.value = 2
  imageStatus.value = '正在准备图片模型'

  try {
    const canvas = selectedImageCanvas.value
    const result = await requestGeneratedImage(
      prompt,
      provider,
      canvas,
      imageController.signal,
      (progress, status) => {
        imageProgress.value = progress
        imageStatus.value = status
      },
    )
    generatedImageUrl.value = result.dataUrl
    generatedImageModel.value = provider.label
    await rememberGeneratedImage(
      prompt,
      provider.label,
      imageCanvas.value,
      result.dataUrl,
    )
    imageProgress.value = 100
    imageStatus.value = '图片已生成'
    ElMessage.success('图片已生成')
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      imageStatus.value = '已停止'
      imageProgress.value = 0
      return
    }
    const message = getImageGenerationError(error)
    imageStatus.value = message
    ElMessage.error(message)
  } finally {
    if (imageProgressTimer) {
      window.clearInterval(imageProgressTimer)
      imageProgressTimer = undefined
    }
    imageGenerating.value = false
    imageController = undefined
  }
}

function stopImageCreation() {
  if (!imageGenerating.value) return
  imageStatus.value = '正在停止'
  imageController?.abort()
}

function downloadGeneratedImage() {
  if (!generatedImageUrl.value) return
  const link = document.createElement('a')
  link.href = generatedImageUrl.value
  link.download = `ShotAI-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .slice(0, 19)}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  ElMessage.success('图片已保存')
}

function useImageComposer() {
  if (!selectedImageProvider.value) {
    ElMessage.warning('请先准备图片运行组件和模型文件')
    openImageStudio()
    return
  }
  if (pendingAttachments.value.length) {
    ElMessage.warning('图片创作不能使用文档，请先移除已添加的文档')
    return
  }
  if (pendingImages.value.length > 1) {
    ElMessage.warning('图片修改一次只能使用一张参考图，请先移除多余图片')
    return
  }
  if (pendingImages.value.length && !selectLocalImageEditProvider()) {
    ElMessage.warning('这台主机还没有准备可以修改图片的本地组件')
    openImageStudio()
    return
  }
  composerMode.value = 'image'
  imageStudioOpen.value = false
  void nextTick(() => {
    resizeComposer()
    focusSenderEnd()
  })
}

function selectLocalImageEditProvider() {
  const localProvider = imageProviderOptions.value.find(
    (provider) => provider.kind === 'local-runtime',
  )
  if (!localProvider) return false
  imageModelId.value = localProvider.id
  return true
}

function leaveImageComposer() {
  if (isGenerating.value) return
  composerMode.value = 'chat'
  void nextTick(focusSenderEnd)
}

function dataUrlSize(dataUrl: string) {
  const payload = dataUrl.slice(dataUrl.indexOf(',') + 1).replace(/\s+/g, '')
  return Math.max(0, Math.floor((payload.length * 3) / 4))
}

async function createImageInConversation() {
  const prompt = senderText.value.trim()
  if (!prompt) {
    ElMessage.warning('请先写下想要的画面')
    return
  }
  if (pendingAttachments.value.length) {
    ElMessage.warning('图片创作不能使用文档，请先移除文档附件')
    return
  }
  if (pendingImages.value.length > 1) {
    ElMessage.warning('图片修改一次只能使用一张参考图')
    return
  }
  const referenceImage = pendingImages.value[0]
  const provider = selectedImageProvider.value
  if (!provider) {
    ElMessage.warning('请先准备图片模型')
    openImageStudio()
    return
  }
  if (referenceImage && provider.kind !== 'local-runtime') {
    ElMessage.warning('图片修改需要使用本地图片组件，请在图片设置中选择本地模型')
    openImageStudio()
    return
  }
  const conversation = activeConversationRecord.value
  if (!conversation || imageGenerating.value || isGenerating.value) return

  const isFirstUserMessage = conversation.messages.every(
    (message) => message.role !== 'user',
  )
  conversation.messages.push({
    id: ++messageId,
    role: 'user',
    placement: 'end',
    variant: 'filled',
    content: prompt,
    time: nowTime(),
    images: referenceImage ? [{ ...referenceImage }] : undefined,
    generationType: 'image',
  })
  if (isFirstUserMessage && conversation.label === '新的离线对话') {
    conversation.label = `图片创作：${prompt}`.replace(/\s+/g, ' ').slice(0, 28)
  }
  const assistantMessage = reactive<DemoMessage>({
    id: ++messageId,
    role: 'assistant',
    placement: 'start',
    variant: 'borderless',
    content: '',
    time: nowTime(),
    loading: true,
    modelName: provider.label,
    generationType: 'image',
    generationProgress: 2,
    generationStatus: '正在准备图片模型',
  })
  conversation.messages = [...conversation.messages, assistantMessage]
  conversation.updatedAt = Date.now()
  senderText.value = ''
  void nextTick(resizeComposer)
  isGenerating.value = true
  isStopping.value = false
  imageGenerating.value = true
  imageProgress.value = 2
  imageStatus.value = assistantMessage.generationStatus ?? ''
  imageController = new AbortController()
  const controller = imageController
  await nextTick()
  scrollMessagesToBottom(true)

  try {
    const canvas = selectedImageCanvas.value
    const result = await requestGeneratedImage(
      prompt,
      provider,
      canvas,
      controller.signal,
      (progress, status) => {
        assistantMessage.generationProgress = progress
        assistantMessage.generationStatus = status
        imageProgress.value = progress
        imageStatus.value = status
        if (isMessageScrollerNearBottom()) scrollMessagesToBottom()
      },
      referenceImage
        ? { source: referenceImage, strength: imageEditStrength.value }
        : undefined,
    )
    const generatedImage: MessageImage = {
      id: `generated-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `ShotAI-${Date.now()}.png`,
      mimeType: 'image/png',
      dataUrl: result.dataUrl,
      width: canvas.width,
      height: canvas.height,
      size: dataUrlSize(result.dataUrl),
    }
    assistantMessage.images = [generatedImage]
    assistantMessage.content = referenceImage
      ? '图片已根据参考图和你的描述在本地修改。'
      : '图片已根据你的描述在本地生成。'
    assistantMessage.generationProgress = 100
    assistantMessage.generationStatus = '图片已生成'
    generatedImageUrl.value = result.dataUrl
    generatedImageModel.value = provider.label
    await rememberGeneratedImage(
      prompt,
      provider.label,
      imageCanvas.value,
      result.dataUrl,
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      assistantMessage.stopped = true
      assistantMessage.content = '已停止图片生成。'
      assistantMessage.generationStatus = '已停止'
      return
    }
    const message = getImageGenerationError(error)
    assistantMessage.content = `图片生成失败：${message}`
    assistantMessage.generationStatus = '生成失败'
    ElMessage.error(message)
  } finally {
    if (imageProgressTimer) {
      window.clearInterval(imageProgressTimer)
      imageProgressTimer = undefined
    }
    assistantMessage.loading = false
    conversation.updatedAt = Date.now()
    if (imageController === controller) imageController = undefined
    imageGenerating.value = false
    isGenerating.value = false
    isStopping.value = false
    scheduleWorkspaceSave()
    scrollMessagesToBottom()
  }
}

function downloadMessageImage(image: MessageImage) {
  const link = document.createElement('a')
  link.href = image.dataUrl
  link.download = image.name || `ShotAI-${Date.now()}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  ElMessage.success('图片已保存')
}

function handleComposerResourceAction(command: string | number | object) {
  if (command === 'attachment') {
    openAttachmentPicker()
    return
  }
  if (command === 'knowledge') {
    knowledgeDrawerOpen.value = true
    return
  }
  if (command === 'image-generation') {
    useImageComposer()
    return
  }
  if (command === 'models') {
    modelDrawerOpen.value = true
  }
}

function handleAttachmentInput(event: Event) {
  const input = event.target as HTMLInputElement
  void addMessageFiles(Array.from(input.files ?? []))
  input.value = ''
}

function handlePastedFiles(firstFile: File, fileList: FileList) {
  const files = Array.from(fileList)
  void addMessageFiles(files.length ? files : [firstFile])
}

function handleAttachmentDrop(event: DragEvent) {
  attachmentDragActive.value = false
  void addMessageFiles(Array.from(event.dataTransfer?.files ?? []))
}

function removePendingImage(imageId: string) {
  pendingImages.value = pendingImages.value.filter(
    (image) => image.id !== imageId,
  )
}

function removePendingAttachment(attachmentId: string) {
  pendingAttachments.value = pendingAttachments.value.filter(
    (attachment) => attachment.id !== attachmentId,
  )
}

function toOllamaImage(dataUrl: string) {
  const separatorIndex = dataUrl.indexOf(',')
  const rawImage =
    separatorIndex >= 0 ? dataUrl.slice(separatorIndex + 1) : dataUrl
  return rawImage.replace(/\s+/g, '')
}

function compactAttachmentText(content: string, maximum: number) {
  if (content.length <= maximum) return content
  const tailLength = Math.max(300, Math.floor(maximum * 0.2))
  const headLength = Math.max(300, maximum - tailLength - 32)
  return `${content.slice(0, headLength)}\n\n[部分内容已省略]\n\n${content.slice(-tailLength)}`
}

function createOllamaMessageContent(
  message: DemoMessage,
  attachmentCharacterBudget: number,
) {
  if (!message.attachments?.length || attachmentCharacterBudget <= 0) {
    return {
      content: message.content,
      usedAttachmentCharacters: 0,
    }
  }

  const perAttachmentBudget = Math.max(
    500,
    Math.floor(
      attachmentCharacterBudget / message.attachments.length,
    ),
  )
  let usedAttachmentCharacters = 0
  const attachmentBlocks = message.attachments.map((attachment, index) => {
    const remaining = Math.max(
      0,
      attachmentCharacterBudget - usedAttachmentCharacters,
    )
    const content =
      remaining >= 100
        ? compactAttachmentText(
            attachment.content,
            Math.min(perAttachmentBudget, remaining),
          )
        : '[本次发送内容较多，这份文件的部分内容已省略]'
    usedAttachmentCharacters += content.length
    return [
      `附件 ${index + 1}：${attachment.name}`,
      `文件类型：${attachment.extension}；文字数量：${attachment.characterCount}`,
      content,
    ].join('\n')
  })

  return {
    content: [
      message.content,
      '',
      '--- 用户随本条消息上传的文件内容 ---',
      ...attachmentBlocks,
      '--- 附件结束 ---',
    ].join('\n\n'),
    usedAttachmentCharacters,
  }
}

function estimateTextTokens(content: string) {
  const cjkCount = (content.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length
  const otherCount = Math.max(0, content.length - cjkCount)
  return Math.ceil(cjkCount * 1.15 + otherCount / 3.5) + 12
}

function estimateImageTokens(images?: MessageImage[]) {
  return (images ?? []).reduce(
    (total, image) =>
      total + Math.max(256, Math.ceil((image.width * image.height) / 784)),
    0,
  )
}

function getEffectiveContextLength(
  model: LocalModel,
  configuredLength: number,
  visionImageCount: number,
) {
  const minimumForVision = visionImageCount > 1 ? 16_384 : 8_192
  const requested = visionImageCount
    ? Math.max(configuredLength, minimumForVision)
    : configuredLength
  return model.contextTokens > 0
    ? Math.min(requested, model.contextTokens)
    : requested
}

async function createNewKnowledgeBase() {
  try {
    const result = await ElMessageBox.prompt(
      '添加的资料只保存在当前设备。',
      '新建资料夹',
      {
        inputPlaceholder: '例如：单位制度文件',
        inputValidator: (value) =>
          value.trim().length > 0 || '资料夹名称不能为空',
        confirmButtonText: '创建',
        cancelButtonText: '取消',
      },
    )
    const knowledgeBase = createKnowledgeBase(result.value.trim().slice(0, 50))
    knowledgeBases.value.unshift(knowledgeBase)
    selectedKnowledgeBaseId.value = knowledgeBase.id
    ElMessage.success('资料夹已创建')
  } catch {
    // User cancelled.
  }
}

async function renameKnowledgeBase(knowledgeBase: KnowledgeBase) {
  try {
    const result = await ElMessageBox.prompt(
      '名称只用于整理你自己的资料。',
      '重命名资料夹',
      {
        inputValue: knowledgeBase.name,
        inputValidator: (value) =>
          value.trim().length > 0 || '资料夹名称不能为空',
        confirmButtonText: '保存',
        cancelButtonText: '取消',
      },
    )
    knowledgeBase.name = result.value.trim().slice(0, 50)
    knowledgeBase.updatedAt = Date.now()
    ElMessage.success('资料夹名称已更新')
  } catch {
    // User cancelled.
  }
}

async function deleteKnowledgeBase(knowledgeBase: KnowledgeBase) {
  try {
    await ElMessageBox.confirm(
      `将删除“${knowledgeBase.name}”及其中的 ${knowledgeBase.documents.length} 份资料。此操作无法撤销。`,
      '删除资料夹',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'danger-confirm-button',
      },
    )
  } catch {
    return
  }

  knowledgeBases.value = knowledgeBases.value.filter(
    (item) => item.id !== knowledgeBase.id,
  )
  conversations.value.forEach((conversation) => {
    conversation.knowledgeBaseIds = conversation.knowledgeBaseIds.filter(
      (id) => id !== knowledgeBase.id,
    )
  })
  if (!knowledgeBases.value.length) {
    knowledgeBases.value = [createKnowledgeBase()]
  }
  selectedKnowledgeBaseId.value = knowledgeBases.value[0].id
  ElMessage.success('资料夹已删除')
}

function toggleConversationKnowledgeBase(
  knowledgeBaseId: string,
  enabled: boolean,
) {
  const conversation = activeConversationRecord.value
  if (!conversation) return
  const ids = new Set(conversation.knowledgeBaseIds)
  if (enabled) ids.add(knowledgeBaseId)
  else ids.delete(knowledgeBaseId)
  conversation.knowledgeBaseIds = [...ids]
  conversation.updatedAt = Date.now()
}

async function buildChunkEmbeddings(
  chunks: KnowledgeBase['chunks'],
  onProgress?: (completed: number, total: number) => void,
) {
  if (!embeddingModelId.value) return false
  const batchSize = 8
  let completed = 0

  for (let index = 0; index < chunks.length; index += batchSize) {
    const batch = chunks.slice(index, index + batchSize)
    const vectors = await embedWithOllama(
      embeddingModelId.value,
      batch.map((chunk) => chunk.content),
    )
    batch.forEach((chunk, batchIndex) => {
      chunk.vector = vectors[batchIndex]
    })
    completed += batch.length
    onProgress?.(completed, chunks.length)
  }
  return true
}

async function importKnowledgeDocument(file: File) {
  const knowledgeBase = selectedKnowledgeBase.value
  if (!knowledgeBase || knowledgeImporting.value) return

  try {
    validateKnowledgeFile(file)
    if (
      knowledgeBase.documents.some(
        (document) =>
          document.name === file.name &&
          document.size === file.size &&
          document.status !== 'error',
      )
    ) {
      throw new Error('同名且大小相同的文件已经导入')
    }

    knowledgeImporting.value = true
    knowledgeImportProgress.value = 5
    knowledgeImportStatus.value = `正在解析 ${file.name}`
    const text = await extractKnowledgeText(file)
    knowledgeImportProgress.value = 18

    const documentId = `doc-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`
    const chunks = chunkKnowledgeText(documentId, file.name, text)
    if (!chunks.length) throw new Error('没有从文件中读取到可用文字')

    const document: KnowledgeDocument = {
      id: documentId,
      name: file.name,
      type: file.name.split('.').pop()?.toUpperCase() ?? 'TEXT',
      size: file.size,
      createdAt: Date.now(),
      characterCount: text.length,
      chunkCount: chunks.length,
      embeddingModel: '',
      status: 'indexing',
    }
    knowledgeBase.documents.unshift(document)
    knowledgeBase.chunks.push(...chunks)

    if (embeddingModelId.value) {
      knowledgeImportStatus.value = '正在整理内容，方便之后快速查找'
      try {
        await buildChunkEmbeddings(chunks, (completed, total) => {
          knowledgeImportProgress.value =
            20 + Math.round((completed / total) * 75)
        })
        document.embeddingModel = embeddingModelId.value
      } catch (error) {
        chunks.forEach((chunk) => {
          delete chunk.vector
        })
        ElMessage.warning(
          `智能查找准备失败，仍可使用普通文字查找：${getErrorMessage(error)}`,
        )
      }
    } else {
      knowledgeImportProgress.value = 90
      ElMessage.warning('未安装资料查找助手，将使用普通文字查找')
    }

    document.status = 'ready'
    knowledgeBase.updatedAt = Date.now()
    knowledgeImportProgress.value = 100
    knowledgeImportStatus.value = `${file.name} 已整理完成`
    await persistKnowledge()
    ElMessage.success('资料已添加，可以在对话中使用')
  } catch (error) {
    knowledgeImportStatus.value = getErrorMessage(error)
    ElMessage.error(getErrorMessage(error))
  } finally {
    knowledgeImporting.value = false
  }
}

function handleKnowledgeFileChange(uploadFile: UploadFile) {
  if (uploadFile.raw) void importKnowledgeDocument(uploadFile.raw)
}

async function rebuildKnowledgeIndex() {
  const knowledgeBase = selectedKnowledgeBase.value
  if (!knowledgeBase?.chunks.length) {
    ElMessage.warning('当前资料夹中没有可以整理的文件')
    return
  }
  if (!embeddingModelId.value) {
    ElMessage.warning('请先安装资料查找助手')
    return
  }

  knowledgeImporting.value = true
  knowledgeImportProgress.value = 0
  knowledgeImportStatus.value = '正在重新整理全部资料'
  try {
    await buildChunkEmbeddings(knowledgeBase.chunks, (completed, total) => {
      knowledgeImportProgress.value = Math.round((completed / total) * 100)
    })
    knowledgeBase.documents.forEach((document) => {
      document.embeddingModel = embeddingModelId.value
      document.status = 'ready'
      delete document.error
    })
    knowledgeBase.updatedAt = Date.now()
    await persistKnowledge()
    knowledgeImportStatus.value = '资料已重新整理完成'
    ElMessage.success('当前资料已重新整理')
  } catch (error) {
    knowledgeImportStatus.value = getErrorMessage(error)
    ElMessage.error(`重建失败：${getErrorMessage(error)}`)
  } finally {
    knowledgeImporting.value = false
  }
}

async function deleteKnowledgeDocument(document: KnowledgeDocument) {
  const knowledgeBase = selectedKnowledgeBase.value
  if (!knowledgeBase) return
  try {
    await ElMessageBox.confirm(
      `将从“${knowledgeBase.name}”中删除 ${document.name}。`,
      '删除这份资料',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  knowledgeBase.documents = knowledgeBase.documents.filter(
    (item) => item.id !== document.id,
  )
  knowledgeBase.chunks = knowledgeBase.chunks.filter(
    (chunk) => chunk.documentId !== document.id,
  )
  knowledgeBase.updatedAt = Date.now()
  ElMessage.success('资料已删除')
}

async function retrieveConversationKnowledge(
  conversation: ConversationRecord,
) {
  const query =
    [...conversation.messages]
      .reverse()
      .find((message) => message.role === 'user')
      ?.content.trim() ?? ''
  const ids = new Set(conversation.knowledgeBaseIds)
  const bases = knowledgeBases.value.filter((knowledgeBase) =>
    ids.has(knowledgeBase.id),
  )
  if (!query || !bases.some((knowledgeBase) => knowledgeBase.chunks.length)) {
    return [] as RetrievedKnowledge[]
  }

  let queryVector: number[] | undefined
  const hasVectorIndex = bases.some((knowledgeBase) =>
    knowledgeBase.chunks.some((chunk) => chunk.vector?.length),
  )
  if (embeddingModelId.value && hasVectorIndex) {
    try {
      queryVector = (
        await embedWithOllama(embeddingModelId.value, query)
      )[0]
    } catch (error) {
      console.warn('ShotAI embedding query failed, using keyword fallback', error)
    }
  }
  return retrieveKnowledge(query, bases, queryVector, 5)
}

function createRagSystemMessage(results: RetrievedKnowledge[]) {
  if (!results.length) return ''
  const context = results
    .map(
      (result, index) =>
        `[资料 ${index + 1}] 文件：${result.chunk.documentName}，段落：${
          result.chunk.index + 1
        }\n${result.chunk.content}`,
    )
    .join('\n\n')

  return `以下内容来自用户添加到这台电脑的资料。请优先依据资料回答，并使用 [资料 1] 这样的标记注明依据。资料不足时要明确说明，不要编造。\n\n${context}`
}

function stopGeneration() {
  if (isStopping.value) return
  if (imageController && isGenerating.value) {
    isStopping.value = true
    imageStatus.value = '正在停止'
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'assistant') {
      last.stopped = true
      last.generationStatus = '正在停止'
    }
    imageController.abort()
    return
  }
  if (!chatController) return
  isStopping.value = true
  chatController?.abort()
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant') last.stopped = true
  if (last?.role === 'assistant' && !last.content) {
    last.content = '已停止生成。'
  }
  if (last) last.loading = false
  if (activeConversationRecord.value) {
    activeConversationRecord.value.updatedAt = Date.now()
  }
}

function ensureChatReady() {
  if (!ollamaConnected.value) {
    ElMessage.error('AI 服务尚未启动，请启动后重新检查')
    diagnosticsDrawerOpen.value = true
    return false
  }
  if (!currentModelId.value) {
    ElMessage.warning('还没有可用模型，请先添加下载好的模型文件')
    modelDrawerOpen.value = true
    return false
  }
  return true
}

async function generateAssistantResponse() {
  if (isGenerating.value || !ensureChatReady()) return
  const conversation = activeConversationRecord.value
  if (!conversation) return
  const visionSourceMessage = [...conversation.messages]
    .reverse()
    .find((message) => message.role === 'user' && message.images?.length)
  const needsVision = Boolean(visionSourceMessage?.images?.length)
  const routedVisionModel = needsVision ? preferredVisionModel.value : undefined
  const modelId = routedVisionModel?.id ?? currentModelId.value
  const model = models.find((item) => item.id === modelId) ?? emptyModel
  const supportsThinking = model.capabilities.includes('thinking')
  const supportsVision = model.capabilities.includes('vision')
  const hasKnowledgeContext = activeKnowledgeBases.value.some(
    (knowledgeBase) => knowledgeBase.chunks.length > 0,
  )
  const shouldShowReasoning = supportsThinking && showReasoning.value
  const thinkingPlaceholder = `正在使用 ${model.name} 在本地分析请求。${
    hasKnowledgeContext ? '已找到相关资料。' : ''
  }未调用任何云端服务。`

  const assistantMessage = reactive<DemoMessage>({
    id: ++messageId,
    role: 'assistant',
    placement: 'start',
    variant: 'borderless',
    content: '',
    reasoning: hasKnowledgeContext
      ? '正在查找相关资料。'
      : shouldShowReasoning
        ? thinkingPlaceholder
        : undefined,
    time: nowTime(),
    loading: true,
    modelId: model.id,
    modelName: model.name,
    generationType: 'chat',
  })
  conversation.messages.push(assistantMessage)
  conversation.updatedAt = Date.now()
  isGenerating.value = true
  isStopping.value = false
  await nextTick()
  scrollMessagesToBottom(true)

  const ragResults = await retrieveConversationKnowledge(conversation)
  if (ragResults.length) {
    assistantMessage.sources = ragResults.map((result) => ({
      id: result.chunk.id,
      documentName: result.chunk.documentName,
      chunkIndex: result.chunk.index,
      score: result.score,
      mode: result.mode,
      excerpt: result.chunk.content.slice(0, 220),
    }))
  }
  assistantMessage.reasoning = shouldShowReasoning
    ? thinkingPlaceholder
    : ragResults.length
      ? `已找到 ${ragResults.length} 段相关资料。`
      : undefined

  const chatMessages = conversation.messages.filter(
    (message) => message.id !== assistantMessage.id && message.content,
  )
  const visionImages = supportsVision ? visionSourceMessage?.images ?? [] : []
  const effectiveContextLength = getEffectiveContextLength(
    model,
    conversation.settings.contextLength,
    visionImages.length,
  )
  let attachmentCharacterBudget = Math.max(
    3_000,
    Math.min(18_000, Math.floor(effectiveContextLength * 1.25)),
  )
  const preparedMessages = chatMessages.map((message) => {
    const attachmentContent = createOllamaMessageContent(
      message,
      attachmentCharacterBudget,
    )
    attachmentCharacterBudget = Math.max(
      0,
      attachmentCharacterBudget - attachmentContent.usedAttachmentCharacters,
    )
    const images =
      supportsVision &&
      message.role === 'user' &&
      message.id === visionSourceMessage?.id
        ? message.images
        : undefined
    return {
      id: message.id,
      role: message.role,
      content: attachmentContent.content,
      images,
      ...(shouldShowReasoning && message.reasoning
        ? { thinking: message.reasoning }
        : {}),
    }
  })
  const systemMessages: OllamaChatMessage[] = []
  if (conversation.systemPrompt.trim()) {
    systemMessages.push({
      role: 'system',
      content: conversation.systemPrompt.trim(),
    })
  }
  const ragSystemMessage = createRagSystemMessage(ragResults)
  if (ragSystemMessage) {
    systemMessages.push({
      role: 'system',
      content: ragSystemMessage,
    })
  }
  const reservedOutputTokens = Math.min(
    1_024,
    Math.max(512, Math.floor(effectiveContextLength * 0.2)),
  )
  const promptTokenBudget = Math.max(
    1_024,
    effectiveContextLength - reservedOutputTokens - 256,
  )
  let usedPromptTokens = systemMessages.reduce(
    (total, message) => total + estimateTextTokens(message.content),
    0,
  )
  const selectedPreparedMessages: typeof preparedMessages = []
  const latestPreparedMessage = preparedMessages.at(-1)
  for (const message of [...preparedMessages].reverse()) {
    const messageTokens =
      estimateTextTokens(message.content) + estimateImageTokens(message.images)
    const required =
      message.id === latestPreparedMessage?.id ||
      message.id === visionSourceMessage?.id
    if (required || usedPromptTokens + messageTokens <= promptTokenBudget) {
      selectedPreparedMessages.unshift(message)
      usedPromptTokens += messageTokens
    }
  }
  const history: OllamaChatMessage[] = [
    ...systemMessages,
    ...selectedPreparedMessages.map((message) => ({
      role: message.role,
      content: message.content,
      ...(message.images?.length
        ? {
            images: message.images.map((image) =>
              toOllamaImage(image.dataUrl),
            ),
          }
        : {}),
      ...(message.thinking ? { thinking: message.thinking } : {}),
    })),
  ]
  const generation: OllamaGenerationOptions = {
    temperature: conversation.settings.temperature,
    top_p: conversation.settings.topP,
    num_ctx: effectiveContextLength,
    num_predict: conversation.settings.maxOutput,
  }

  const controller = new AbortController()
  chatController = controller
  try {
    await chatWithOllama(modelId, history, {
      signal: controller.signal,
      think: supportsThinking ? showReasoning.value : undefined,
      generation,
      onThinking(chunk) {
        assistantMessage.reasoning =
          assistantMessage.reasoning === thinkingPlaceholder
            ? chunk
            : `${assistantMessage.reasoning ?? ''}${chunk}`
        assistantMessage.loading = true
      },
      onContent(chunk) {
        const shouldFollow = isMessageScrollerNearBottom()
        assistantMessage.content += chunk
        assistantMessage.loading = false
        if (shouldFollow) scrollMessagesToBottom()
      },
      onDone(result) {
        assistantMessage.truncated =
          result.reason === 'length' ||
          (!result.reason &&
            typeof result.outputCount === 'number' &&
            result.outputCount >= generation.num_predict)
      },
      onIncomplete() {
        assistantMessage.truncated = true
      },
    })
    if (!assistantMessage.content) assistantMessage.content = '模型未返回文本内容。'
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'AbortError')) {
      if (
        error instanceof OllamaApiError &&
        (error.status === 403 || error.status === 404)
      ) {
        ollamaConnected.value = false
        ollamaConnectionState.value = 'offline'
        ollamaError.value = error.message
        ollamaLastCheckedAt.value = nowTime()
      }
      assistantMessage.loading = false
      assistantMessage.content = `生成失败：${getErrorMessage(error)}`
      ElMessage.error(getErrorMessage(error))
    }
  } finally {
    assistantMessage.loading = false
    conversation.updatedAt = Date.now()
    if (chatController === controller) {
      chatController = undefined
      isGenerating.value = false
      isStopping.value = false
    }
    scheduleWorkspaceSave()
  }
}

async function handleSubmit() {
  if (isGenerating.value) return
  if (composerMode.value === 'image') {
    await createImageInConversation()
    return
  }
  const input = senderText.value.trim()
  const submittedImages = pendingImages.value.map((image) => ({ ...image }))
  const submittedAttachments = pendingAttachments.value.map((attachment) => ({
    ...attachment,
  }))
  if (!input && !submittedImages.length && !submittedAttachments.length) {
    ElMessage.warning('请输入问题或添加附件后再发送')
    return
  }
  if (!ensureChatReady()) return
  if (submittedImages.length && !preferredVisionModel.value) {
    ElMessage.error('还没有可以识别图片的模型，请先添加一个')
    modelDrawerOpen.value = true
    return
  }

  const conversation = activeConversationRecord.value
  if (!conversation) return
  senderText.value = ''
  void nextTick(resizeComposer)
  pendingImages.value = []
  pendingAttachments.value = []
  const messageContent =
    input ||
    (submittedImages.length && submittedAttachments.length
      ? '请分析上传的图片和文档。'
      : submittedImages.length
        ? '请分析上传的图片。'
        : '请阅读并分析上传的文档。')
  const isFirstUserMessage = conversation.messages.every(
    (message) => message.role !== 'user',
  )
  conversation.messages.push({
    id: ++messageId,
    role: 'user',
    placement: 'end',
    variant: 'filled',
    content: messageContent,
    images: submittedImages.length ? submittedImages : undefined,
    attachments: submittedAttachments.length
      ? submittedAttachments
      : undefined,
    time: nowTime(),
  })
  if (isFirstUserMessage && conversation.label === '新的离线对话') {
    conversation.label = (
      input ||
      (submittedImages.length
        ? `图片分析：${submittedImages[0]?.name ?? '本地图片'}`
        : `文档分析：${submittedAttachments[0]?.name ?? '本地文档'}`)
    )
      .replace(/\s+/g, ' ')
      .slice(0, 28)
  }
  conversation.updatedAt = Date.now()
  await generateAssistantResponse()
}

async function editUserMessage(message: DemoMessage) {
  if (isGenerating.value || message.role !== 'user') return
  const conversation = activeConversationRecord.value
  if (!conversation) return
  const messageIndex = conversation.messages.findIndex(
    (item) => item.id === message.id,
  )
  if (messageIndex < 0) return

  try {
    const result = await ElMessageBox.prompt(
      '保存后会删除这条问题之后的回答，并基于修改后的内容重新生成。',
      '编辑问题并重新生成',
      {
        inputValue: message.content,
        inputType: 'textarea',
        inputPlaceholder: '输入修改后的问题',
        inputValidator: (value) => {
          const length = value.trim().length
          if (!length) return '问题不能为空'
          if (length > 8000) return '问题不能超过 8000 个字'
          return true
        },
        confirmButtonText: '保存并重新生成',
        cancelButtonText: '取消',
      },
    )
    message.content = result.value.trim()
    message.time = nowTime()
    conversation.messages.splice(messageIndex + 1)
    conversation.updatedAt = Date.now()
    await generateAssistantResponse()
  } catch {
    // User cancelled.
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isGenerating.value) {
    event.preventDefault()
    stopGeneration()
  }
}

function isVisionProjectorFile(file: File) {
  return /(^|[-_.])(mmproj|projector)([-_.]|$)/i.test(file.name)
}

function getSplitGgufPart(file: File) {
  const match = file.name.match(/^(.*?)[-_.](\d{5})-of-(\d{5})\.gguf$/i)
  if (!match) return null
  return {
    family: match[1].toLowerCase(),
    index: Number(match[2]),
    total: Number(match[3]),
  }
}

function validateSplitGgufFiles(files: File[]) {
  if (files.length <= 1) return ''
  const parts = files.map(getSplitGgufPart)
  if (parts.some((part) => !part)) {
    return '检测到多个主要模型文件，但它们不是规范的 GGUF 分片。请只选择一个单文件模型，或一次选中名称为 00001-of-000NN 的全部分片。'
  }
  const first = parts[0]!
  if (
    parts.some(
      (part) => part!.family !== first.family || part!.total !== first.total,
    )
  ) {
    return '这些 GGUF 分片不属于同一个模型或版本，请从同一下载页面重新选择。'
  }
  const indexes = new Set(parts.map((part) => part!.index))
  if (first.total !== files.length || indexes.size !== first.total) {
    return `模型分片不完整：应有 ${first.total} 个文件，当前选择了 ${files.length} 个。请一次选中全部分片。`
  }
  return ''
}

function handleFileChange(_uploadFile: UploadFile, uploadFiles: UploadFiles) {
  selectedFiles.value = uploadFiles
  const rawFiles = uploadFiles
    .map((uploadFile) => uploadFile.raw)
    .filter(Boolean) as File[]
  const imageFilesSelected = rawFiles.some(
    (file) =>
      isImageGenerationMainFile(file) ||
      isImageVaeFile(file) ||
      isSingleImageModelFile(file),
  )

  importFileShas.value = {}
  importSha.value = ''
  importProjectorSha.value = ''
  importDetectedCapabilities.value = []
  importFailureDetail.value = ''

  if (imageFilesSelected) {
    importMode.value = 'image'
    selectedImageImportFiles.value = rawFiles
    selectedImportFile.value = null
    selectedModelFiles.value = []
    selectedProjectorFile.value = null
    const main = rawFiles.find(isImageGenerationMainFile) ||
      rawFiles.find(isSingleImageModelFile) || rawFiles[0]
    importName.value = main
      ? main.name.replace(/\.(?:gguf|safetensors|sft|ckpt)$/i, '').replace(/[-_]+/g, ' ')
      : ''
    return
  }

  importMode.value = 'chat'
  selectedImageImportFiles.value = []
  let projectorFiles = rawFiles.filter(isVisionProjectorFile)
  let modelFiles = rawFiles.filter((file) => !isVisionProjectorFile(file))

  if (
    rawFiles.length === 2 &&
    projectorFiles.length === 0 &&
    !rawFiles.every((file) => Boolean(getSplitGgufPart(file)))
  ) {
    const orderedBySize = [...rawFiles].sort((a, b) => b.size - a.size)
    modelFiles = [orderedBySize[0]]
    projectorFiles = [orderedBySize[1]]
  }

  selectedProjectorFile.value = projectorFiles[0] ?? null
  selectedModelFiles.value = modelFiles
  selectedImportFile.value = modelFiles[0] ?? null
  const modelFile = selectedImportFile.value
  if (modelFile) {
    importName.value = modelFile.name
    .replace(/\.gguf$/i, '')
    .replace(/[-_.]\d{5}-of-\d{5}$/i, '')
    .replace(/[-_]+/g, ' ')
  } else {
    importName.value = ''
  }
}

function openImportDialog() {
  modelDrawerOpen.value = false
  imageStudioOpen.value = false
  importStep.value = 0
  importProgress.value = 0
  importStatus.value = ''
  selectedFiles.value = []
  selectedImportFile.value = null
  selectedModelFiles.value = []
  selectedProjectorFile.value = null
  selectedImageImportFiles.value = []
  importFileShas.value = {}
  importMode.value = 'chat'
  importName.value = ''
  importSha.value = ''
  importProjectorSha.value = ''
  importDetectedCapabilities.value = []
  importFailureDetail.value = ''
  importDialogOpen.value = true
}

async function nextImportStep() {
  if (
    importStep.value === 0 &&
    !selectedImportFile.value &&
    selectedImageImportFiles.value.length === 0
  ) {
    ElMessage.warning('请选择主要模型文件')
    return
  }
  if (importStep.value === 1 && !importName.value.trim()) {
    ElMessage.warning('请填写模型显示名称')
    return
  }

  if (importStep.value === 0 && importMode.value === 'image') {
    if (!imageImportAnalysis.value.configured) {
      ElMessage.warning(`文件还不完整：${imageImportAnalysis.value.missing.join('、')}`)
      return
    }
    validationRunning.value = true
    try {
      const shas: Record<string, string> = {}
      const files = selectedImageImportFiles.value
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]
        importStatus.value = `正在检查 ${file.name} · ${index + 1}/${files.length}`
        if (file.name.toLowerCase().endsWith('.gguf')) {
          // stable-diffusion.cpp image weights may be valid GGUF files with no
          // general.* metadata. Ollama chat models still use the stricter
          // validation below, while image-runtime files only need a valid
          // GGUF header and tensor table.
          await verifyGgufFile(file, { allowMissingMetadata: true })
        }
        shas[file.name] = await calculateFileSha256(file, (progress) => {
          importStatus.value = `正在检查 ${file.name} · ${progress}%`
        })
      }
      importFileShas.value = shas
      importStep.value = 1
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      validationRunning.value = false
      importStatus.value = ''
    }
    return
  }

  if (importStep.value === 0 && selectedImportFile.value) {
    const splitError = validateSplitGgufFiles(selectedModelFiles.value)
    if (splitError) {
      ElMessage.error(splitError)
      return
    }
    validationRunning.value = true
    importStatus.value = '正在检查主要模型文件'
    try {
      for (let index = 0; index < selectedModelFiles.value.length; index += 1) {
        const modelFile = selectedModelFiles.value[index]
        await verifyGgufFile(modelFile)
        const sha = await calculateFileSha256(modelFile, (progress) => {
          importStatus.value = `正在检查 ${modelFile.name} · ${index + 1}/${selectedModelFiles.value.length} · ${progress}%`
        })
        importFileShas.value[modelFile.name] = sha
        if (index === 0) importSha.value = sha
      }
      if (selectedProjectorFile.value) {
        await verifyGgufFile(selectedProjectorFile.value)
        importProjectorSha.value = await calculateFileSha256(
          selectedProjectorFile.value,
          (progress) => {
            importStatus.value = `正在检查图片识别配套文件 · ${progress}%`
          },
        )
      }
      importStep.value = 1
    } catch (error) {
      ElMessage.error(getErrorMessage(error))
    } finally {
      validationRunning.value = false
      importStatus.value = ''
    }
    return
  }

  if (importStep.value < 2) importStep.value += 1
}

async function startImageModelImport() {
  const files = selectedImageImportFiles.value
  if (!files.length || !imageImportAnalysis.value.configured) {
    ElMessage.error('图片模型文件还没有准备完整')
    return
  }
  if (files.some((file) => !importFileShas.value[file.name])) {
    ElMessage.error('模型文件尚未完成检查')
    return
  }

  importRunning.value = true
  imageModelImporting.value = true
  importProgress.value = 3
  imageModelImportProgress.value = 3
  importStatus.value = '正在准备图片模型文件'
  imageModelImportStatus.value = importStatus.value

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const sha256 = importFileShas.value[file.name]
      let reused = false
      if (file.name.toLowerCase().endsWith('.gguf')) {
        reused = (await reuseOllamaModelFileForImages(file.name, sha256)).reused
      }
      if (!reused) {
        await uploadImageModelFile(
          file,
          (fileProgress) => {
            const progress = Math.round(
              5 + ((index + fileProgress / 100) / files.length) * 70,
            )
            importProgress.value = progress
            imageModelImportProgress.value = progress
            importStatus.value = `正在保存 ${file.name} · ${fileProgress}%`
            imageModelImportStatus.value = importStatus.value
          },
          sha256,
        )
      } else {
        importStatus.value = `${file.name} 已存在，直接复用`
        imageModelImportStatus.value = importStatus.value
        importProgress.value = Math.round(5 + ((index + 1) / files.length) * 70)
      }
    }

    importProgress.value = 78
    imageModelImportProgress.value = 78
    importStatus.value = '文件已经组合，正在载入图片模型'
    imageModelImportStatus.value = importStatus.value
    const restartResult = await restartImageRuntime()
    if (restartResult.restartRequired) {
      throw new Error('文件已经保存，请关闭 ShotAI 后重新打开以载入图片模型')
    }

    for (let attempt = 0; attempt < 120; attempt += 1) {
      await waitForImageRuntime(1_000)
      imageRuntime.value = await getImageRuntimeStatus()
      const progress = Math.min(99, 80 + Math.floor(attempt / 6))
      importProgress.value = progress
      imageModelImportProgress.value = progress
      if (imageRuntime.value.serviceOnline) break
      if (attempt > 4 && imageRuntime.value.runtimeError) {
        throw new Error(imageRuntime.value.runtimeError)
      }
    }
    if (!imageRuntime.value.modelConfigured) {
      throw new Error(
        `图片模型文件仍不完整：${imageRuntime.value.missingFiles?.join('、') || '请重新选择同一下载页中的全部文件'}`,
      )
    }
    if (!imageRuntime.value.serviceOnline) {
      throw new Error(
        imageRuntime.value.runtimeError ||
          '图片模型载入超时，请在设置中查看图片运行日志',
      )
    }

    imageModelId.value = AUTO_IMAGE_PROVIDER_ID
    importName.value = imageRuntime.value.modelLabel
    importDetectedCapabilities.value = ['image-generation', 'image-editing']
    importProgress.value = 100
    imageModelImportProgress.value = 100
    importStatus.value = '图片生成和修改已经可以使用'
    imageModelImportStatus.value = importStatus.value
    importStep.value = 3
  } catch (error) {
    importStatus.value = '导入失败'
    imageModelImportStatus.value = getErrorMessage(error)
    ElMessage.error(imageModelImportStatus.value)
  } finally {
    importRunning.value = false
    imageModelImporting.value = false
  }
}

async function startImport() {
  if (importMode.value === 'image') {
    await startImageModelImport()
    return
  }
  const file = selectedImportFile.value
  if (
    !file ||
    !importSha.value ||
    selectedModelFiles.value.some(
      (modelFile) => !importFileShas.value[modelFile.name],
    )
  ) {
    ElMessage.error('模型文件尚未完成校验')
    return
  }
  if (selectedProjectorFile.value && !importProjectorSha.value) {
    ElMessage.error('图片识别配套文件还没有检查完成')
    return
  }
  if (!ollamaConnected.value) {
    ElMessage.error('AI 服务连接已断开，请重新检查')
    return
  }

  const modelName = normalizeOllamaModelName(importName.value)
  importRunning.value = true
  importProgress.value = 4
  importStatus.value = '正在准备模型文件'
  importFailureDetail.value = ''
  let stage: 'write' | 'create' | 'load' | 'capability' = 'write'
  let modelCreated = false

  try {
    const modelFiles: Record<string, string> = {}
    const mainUploadSpan = selectedProjectorFile.value ? 42 : 65
    for (let index = 0; index < selectedModelFiles.value.length; index += 1) {
      const modelFile = selectedModelFiles.value[index]
      const digest = await ensureOllamaBlob(
        modelFile,
        importFileShas.value[modelFile.name],
        (progress) => {
          const completed = index + progress / 100
          importProgress.value =
            5 + Math.round((completed / selectedModelFiles.value.length) * mainUploadSpan)
          importStatus.value =
            progress < 100
              ? `正在添加 ${modelFile.name} · ${progress}%`
              : `${modelFile.name} 已准备好`
        },
      )
      modelFiles[modelFile.name] = digest
    }

    if (selectedProjectorFile.value) {
      const projectorFile = selectedProjectorFile.value
      const projectorDigest = await ensureOllamaBlob(
        projectorFile,
        importProjectorSha.value,
        (progress) => {
          importProgress.value = 47 + Math.round(progress * 0.27)
          importStatus.value =
            progress < 100
              ? `正在添加图片识别配套文件 · ${progress}%`
              : '图片识别功能已准备好'
        },
      )
      modelFiles[projectorFile.name] = projectorDigest
    }

    importProgress.value = 74
    importStatus.value = '正在完成模型安装'
    stage = 'create'
    await createOllamaModel(modelName, modelFiles, (status) => {
      importStatus.value = status
      importProgress.value = Math.min(92, importProgress.value + 3)
    })
    modelCreated = true

    importProgress.value = 94
    importStatus.value = '正在检查模型是否可以正常回答'
    stage = 'load'
    await testOllamaModel(modelName)
    try {
      stage = 'capability'
      const importedModel = await showOllamaModel(modelName)
      importDetectedCapabilities.value = importedModel.capabilities ?? []
      if (
        selectedProjectorFile.value &&
        !importedModel.capabilities?.includes('vision')
      ) {
        throw new Error(
          '模型已经添加，但图片识别功能无法使用。请确认两个文件是从同一个下载页面、同一个版本中取得的，并更新 AI 服务后再试。',
        )
      }
    } catch (error) {
      if (selectedProjectorFile.value) throw error
      importDetectedCapabilities.value = []
    }
    importProgress.value = 100
    importStatus.value = '模型创建成功'
    await refreshOllama()
    currentModelId.value = modelName
    importStep.value = 3
  } catch (error) {
    const rawMessage = getErrorMessage(error)
    const lowerMessage = rawMessage.toLowerCase()
    let guidance = rawMessage
    if (error instanceof OllamaApiError && error.status === 403) {
      guidance = '当前页面没有模型管理权限。请在安装 ShotAI 的 Ubuntu 主机上打开应用后导入。'
    } else if (/unknown model architecture|unsupported architecture|not support/i.test(rawMessage)) {
      guidance = `当前 AI 服务不支持这个模型架构。实际连接的 Ollama 版本是 ${ollamaVersion.value}；请更新离线运行组件，或改用推荐模型。原始信息：${rawMessage}`
    } else if (/out of memory|cuda.*alloc|failed to allocate|memory allocation/i.test(lowerMessage)) {
      guidance = `模型已经写入，但首次加载时显存或内存不足。请先把上下文设为 8K，关闭其他占用显卡的程序，或换用更小的 Q4_K_M 模型。原始信息：${rawMessage}`
    } else if (/no space left|disk quota/i.test(lowerMessage)) {
      guidance = `模型磁盘空间不足。请清理 ShotAI 数据目录后重试。原始信息：${rawMessage}`
    } else if (/unexpected eof|digest mismatch|checksum|invalid.*gguf|failed to validate/i.test(lowerMessage)) {
      guidance = `GGUF 文件不完整、损坏或配套文件版本不一致。请核对 SHA-256，并确保所有分片或 mmproj 来自同一模型版本。原始信息：${rawMessage}`
    }
    const stageLabel = {
      write: '写入模型文件',
      create: '创建模型清单',
      load: '首次加载测试',
      capability: '功能检查',
    }[stage]
    importFailureDetail.value = `${stageLabel}失败：${guidance}`
    importStatus.value = modelCreated
      ? `模型文件已安装，但${importFailureDetail.value}`
      : importFailureDetail.value
    ElMessage.error({ message: importStatus.value, duration: 0, showClose: true })
    if (modelCreated) await refreshOllama()
  } finally {
    importRunning.value = false
  }
}

function finishImport() {
  importDialogOpen.value = false
  ElMessage.success(
    importMode.value === 'image'
      ? '图片模型已经可以使用'
      : '模型已导入并设为当前模型',
  )
}

function isManagedModelSelected(
  model: LocalModel,
  section: ManagedModelSectionKey,
) {
  if (section === 'knowledge') return embeddingModelId.value === model.id
  if (section === 'image') {
    return selectedImageProvider.value?.id === `ollama:${model.id}`
  }
  return currentModelId.value === model.id
}

function managedModelActionLabel(
  model: LocalModel,
  section: ManagedModelSectionKey,
) {
  if (isManagedModelSelected(model, section)) return '使用中'
  if (section === 'knowledge') return '用于资料'
  if (section === 'image') return '用于创作'
  return '用于对话'
}

function useManagedModel(
  model: LocalModel,
  section: ManagedModelSectionKey,
) {
  if (section === 'knowledge') {
    embeddingModelId.value = model.id
    ElMessage.success(`资料查找将使用 ${model.name}`)
    return
  }
  if (section === 'image') {
    imageModelId.value = `ollama:${model.id}`
    ElMessage.success(`图片创作将使用 ${model.name}`)
    return
  }
  currentModelId.value = model.id
  ElMessage.success(`当前对话将使用 ${model.name}`)
}

function useLocalImageRuntime() {
  if (!imageRuntime.value.serviceOnline) {
    ElMessage.warning('图片模型还没有成功载入，请先检查文件和运行状态')
    return
  }
  imageModelId.value = 'local-runtime'
  ElMessage.success(`图片创作将使用 ${imageRuntime.value.modelLabel}`)
}

async function removeModel(model: LocalModel) {
  try {
    await ElMessageBox.confirm(
      `将从运行服务的电脑中删除“${model.name}”，之后如需使用必须重新安装。`,
      '删除模型',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }

  try {
    await deleteOllamaModel(model.id)
    conversations.value.forEach((conversation) => {
      if (conversation.modelId === model.id) conversation.modelId = ''
    })
    if (embeddingModelId.value === model.id) embeddingModelId.value = ''
    await refreshOllama()
    const replacement = models[0]?.id ?? ''
    conversations.value.forEach((conversation) => {
      if (!conversation.modelId) conversation.modelId = replacement
    })
    ElMessage.success('模型已删除')
  } catch (error) {
    ElMessage.error(`删除失败：${getErrorMessage(error)}`)
  }
}

async function continueResponse() {
  if (isGenerating.value) return
  senderText.value = '请从刚才停止的位置继续回答，不要重复已经写过的内容。'
  await handleSubmit()
}

async function regenerateLast() {
  if (isGenerating.value || !ensureChatReady()) return
  const conversation = activeConversationRecord.value
  if (!conversation) return
  let assistantIndex = -1
  for (let index = conversation.messages.length - 1; index >= 0; index -= 1) {
    if (conversation.messages[index].role === 'assistant') {
      assistantIndex = index
      break
    }
  }
  const hasUserBefore = conversation.messages
    .slice(0, assistantIndex)
    .some((message) => message.role === 'user')
  if (assistantIndex <= 0 || !hasUserBefore) {
    ElMessage.warning('当前没有可以重新生成的回答')
    return
  }

  conversation.messages.splice(assistantIndex, 1)
  conversation.updatedAt = Date.now()
  await generateAssistantResponse()
}

function applyDocumentTheme(enabled: boolean) {
  document.documentElement.classList.toggle('dark', enabled)
  document.documentElement.classList.toggle('theme-light', !enabled)
}

let ambientMotionFrame = 0
function handleAmbientPointer(event: PointerEvent) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  if (ambientMotionFrame) window.cancelAnimationFrame(ambientMotionFrame)
  ambientMotionFrame = window.requestAnimationFrame(() => {
    const root = document.querySelector('.shot-app') as HTMLElement | null
    if (!root) return
    const x = event.clientX / Math.max(1, window.innerWidth) - 0.5
    const y = event.clientY / Math.max(1, window.innerHeight) - 0.5
    root.style.setProperty('--ambient-x', `${(x * 24).toFixed(1)}px`)
    root.style.setProperty('--ambient-y', `${(y * 18).toFixed(1)}px`)
  })
}

watch(darkMode, applyDocumentTheme, { immediate: true })

watch(sidebarCollapsed, (collapsed) => {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // Browsers with restricted storage can still use the control for this session.
  }
})

watch(monitorDrawerOpen, (open) => {
  if (!open && monitorTimer) {
    window.clearInterval(monitorTimer)
    monitorTimer = undefined
  }
})

watch(
  [conversations, activeConversation, darkMode, showReasoning],
  scheduleWorkspaceSave,
  { deep: true },
)

watch(
  [knowledgeBases, selectedKnowledgeBaseId, embeddingModelId],
  scheduleKnowledgeSave,
  { deep: true },
)

onMounted(async () => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('pointermove', handleAmbientPointer, { passive: true })
  try {
    sidebarCollapsed.value =
      window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    sidebarCollapsed.value = false
  }
  await Promise.all([
    restoreWorkspace(),
    restoreKnowledge(),
    restoreImageHistory(),
  ])
  scrollMessagesToBottom()
  applyDocumentTheme(darkMode.value)
  const [, , detectedSystemInfo] = await Promise.all([
    refreshOllama(),
    refreshImageRuntime(),
    getShotAISystemInfo(),
  ])
  systemInfo.value = detectedSystemInfo
  healthTimer = window.setInterval(() => {
    void refreshOllama()
  }, 15_000)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('pointermove', handleAmbientPointer)
  if (ambientMotionFrame) window.cancelAnimationFrame(ambientMotionFrame)
  chatController?.abort()
  imageController?.abort()
  if (imageProgressTimer) window.clearInterval(imageProgressTimer)
  if (healthTimer) window.clearInterval(healthTimer)
  if (monitorTimer) window.clearInterval(monitorTimer)
  if (messageScrollFrame) window.cancelAnimationFrame(messageScrollFrame)
  if (persistenceTimer) window.clearTimeout(persistenceTimer)
  if (knowledgePersistenceTimer) {
    window.clearTimeout(knowledgePersistenceTimer)
  }
  void persistWorkspace()
  void persistKnowledge()
})
</script>

<template>
  <el-config-provider namespace="el">
    <div
      class="shot-app"
      :class="{
        dark: darkMode,
        'theme-light': !darkMode,
        'sidebar-collapsed': sidebarCollapsed,
      }"
    >
      <a class="skip-link" href="#main-content">跳转到主要内容</a>

      <aside
        id="conversation-sidebar"
        class="app-sidebar"
        :class="{
          'is-open': sidebarOpen,
          'is-collapsed': sidebarCollapsed,
        }"
        aria-label="对话导航"
      >
        <div class="brand-block">
          <div class="brand-mark" aria-hidden="true">
            <img :src="appLogoUrl" alt="" />
          </div>
          <div class="brand-copy">
            <div class="brand-name">SHOT<span>AI</span></div>
            <div class="brand-subtitle">完全离线的智能助手</div>
          </div>
        </div>
        <button
          class="sidebar-collapse-toggle"
          type="button"
          :aria-label="sidebarCollapsed ? '展开对话侧边栏' : '折叠对话侧边栏'"
          :aria-expanded="!sidebarCollapsed"
          aria-controls="conversation-sidebar"
          :title="sidebarCollapsed ? '展开对话侧边栏' : '折叠对话侧边栏'"
          @click="toggleConversationSidebar"
        >
          <el-icon><Expand v-if="sidebarCollapsed" /><Fold v-else /></el-icon>
        </button>
        <el-button
          class="new-chat-button"
          type="primary"
          aria-label="新建对话"
          :title="sidebarCollapsed ? '新建对话' : undefined"
          @click="createConversation"
        >
          <el-icon><Plus /></el-icon>
          <span class="sidebar-button-label">新建对话</span>
        </el-button>

        <div
          v-show="!sidebarCollapsed || sidebarOpen"
          class="conversation-section"
        >
          <div class="section-label"><span>对话记录</span></div>
          <el-input
            v-model="conversationSearch"
            class="conversation-search"
            placeholder="搜索本地对话"
            clearable
            aria-label="搜索本地对话"
          >
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <div v-if="conversationItems.length === 0" class="conversation-empty">
            没有匹配的本地对话
          </div>
          <Conversations
            v-model:active="activeConversation"
            :items="conversationItems"
            row-key="id"
            label-key="label"
            groupable
            :show-built-in-menu="true"
            show-built-in-menu-type="hover"
            @change="handleConversationChange"
            @menu-command="handleConversationMenu"
          />
        </div>

        <div class="sidebar-footer">
          <button
            v-if="systemInfo.isHost"
            class="settings-entry"
            type="button"
            aria-label="打开主机监控"
            :title="sidebarCollapsed ? '主机监控' : undefined"
            @click="switchView('monitor')"
          >
            <el-icon><Monitor /></el-icon>
            <span class="sidebar-button-label">主机监控</span>
          </button>
          <button
            class="settings-entry"
            type="button"
            aria-label="打开模型管理"
            :title="sidebarCollapsed ? '模型管理' : undefined"
            @click="switchView('models')"
          >
            <el-icon><Cpu /></el-icon>
            <span class="sidebar-button-label">模型管理</span>
          </button>
          <button
            class="settings-entry"
            type="button"
            aria-label="侧边栏设置"
            :title="sidebarCollapsed ? '设置' : undefined"
            @click="switchView('settings')"
          >
            <el-icon><Setting /></el-icon>
            <span class="sidebar-button-label">设置</span>
          </button>
          <div
            class="offline-seal"
            :title="`${ollamaStateLabel} · 版本 ${ollamaVersion}`"
          >
            <span
              class="status-dot"
              :class="{
                muted:
                  ollamaConnectionState === 'offline' ||
                  ollamaConnectionState === 'checking',
                warning: ollamaConnectionState === 'degraded',
              }"
              aria-hidden="true"
            ></span>
            <div class="sidebar-status-copy">
              <strong>{{ ollamaStateLabel }}</strong>
              <span>版本 {{ ollamaVersion }}</span>
            </div>
          </div>
        </div>
      </aside>

      <button
        v-if="sidebarOpen"
        class="sidebar-scrim"
        type="button"
        aria-label="关闭导航"
        @click="sidebarOpen = false"
      ></button>

      <main id="main-content" class="main-shell">
        <header class="topbar">
          <div class="topbar-title">
            <el-button
              class="mobile-menu"
              text
              aria-label="打开导航"
              @click="sidebarOpen = true"
            >
              <el-icon><Menu /></el-icon>
            </el-button>
            <div>
              <h1>{{ activeConversationTitle }}</h1>
            </div>
          </div>

          <div class="topbar-actions">
            <el-select
              v-model="currentModelId"
              class="model-select"
              aria-label="选择当前模型"
              placeholder="暂无可用模型"
              :disabled="models.length === 0 || isGenerating"
            >
              <el-option
                v-for="model in models"
                :key="model.id"
                :label="model.name"
                :value="model.id"
              />
            </el-select>
            <el-tooltip content="设置" placement="bottom">
              <el-button
                class="icon-button"
                circle
                aria-label="打开设置"
                @click="settingsDrawerOpen = true"
              >
                <el-icon><Setting /></el-icon>
              </el-button>
            </el-tooltip>
            <el-dropdown trigger="click" @command="handleConversationAction">
              <el-button class="icon-button" circle aria-label="更多操作">
                <el-icon><MoreFilled /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="rename">
                    <el-icon><EditPen /></el-icon>
                    重命名对话
                  </el-dropdown-item>
                  <el-dropdown-item command="export">
                    <el-icon><Files /></el-icon>
                    导出对话
                  </el-dropdown-item>
                  <el-dropdown-item command="clear">
                    <el-icon><RefreshRight /></el-icon>
                    清空消息
                  </el-dropdown-item>
                  <el-dropdown-item command="delete" divided>
                    <el-icon><Delete /></el-icon>
                    删除对话
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </header>

        <section class="chat-workspace" aria-label="对话内容">
          <div
            v-if="messages.length"
            class="message-stage"
          >
            <BubbleList
              ref="bubbleListRef"
              :list="messages"
              max-height="100%"
              :auto-scroll="false"
              :show-back-button="true"
              :virtual="false"
            >
              <template #avatar="{ item }">
                <div
                  class="message-avatar"
                  :class="{ 'is-user': item.role === 'user' }"
                  :aria-label="item.role === 'user' ? '用户' : 'ShotAI'"
                >
                  <span v-if="item.role === 'user'">你</span>
                  <svg v-else viewBox="0 0 32 32" aria-hidden="true">
                    <path d="M4 24.5C12 23 20.5 17 27 5.5" />
                    <path d="m16.5 18.5 3.8-9 6.7-4-2.2 7.5-8.3 5.5Z" />
                    <path d="M8 26h17" />
                  </svg>
                </div>
              </template>
              <template #header="{ item }">
                <div class="message-author">
                  {{ item.role === 'user' ? '你' : 'ShotAI' }}
                  <span v-if="item.role === 'assistant'">
                    · {{ item.modelName || selectedModel.name }}
                  </span>
                </div>
              </template>
              <template #loading="{ item }">
                <div
                  v-if="item.generationType === 'image'"
                  class="inline-image-generating"
                  role="status"
                  aria-live="polite"
                >
                  <div class="image-generation-visual" aria-hidden="true">
                    <span class="image-generation-frame"></span>
                    <span class="image-generation-scan"></span>
                    <el-icon><MagicStick /></el-icon>
                  </div>
                  <div class="inline-image-generation-copy">
                    <span>{{ item.generationStatus || '正在生成图片' }}</span>
                    <strong>{{ item.generationProgress || 0 }}%</strong>
                  </div>
                  <div class="inline-image-progress" aria-hidden="true">
                    <span
                      :style="{
                        transform: `scaleX(${(item.generationProgress || 0) / 100})`,
                      }"
                    ></span>
                  </div>
                  <small>图片全程在运行 ShotAI 的电脑上生成</small>
                </div>
                <div v-else class="typing-state" aria-live="polite">
                  <span></span><span></span><span></span>
                  正在准备回答
                </div>
              </template>
              <template #content="{ item }">
                <div
                  class="message-content"
                  :class="`is-${item.role}`"
                >
                  <div
                    v-if="item.images?.length"
                    class="message-image-grid"
                    :class="`has-${Math.min(item.images.length, 4)}`"
                    aria-label="消息图片"
                  >
                    <el-image
                      v-for="(image, imageIndex) in item.images"
                      :key="image.id"
                      :src="image.dataUrl"
                      :alt="image.name"
                      :preview-src-list="
                        item.images.map((entry) => entry.dataUrl)
                      "
                      :initial-index="imageIndex"
                      preview-teleported
                      fit="contain"
                    />
                  </div>
                  <div
                    v-if="item.attachments?.length"
                    class="message-file-list"
                    aria-label="消息文档附件"
                  >
                    <el-popover
                      v-for="attachment in item.attachments"
                      :key="attachment.id"
                      placement="top-start"
                      :width="420"
                      trigger="click"
                    >
                      <template #reference>
                        <button class="message-file-card" type="button">
                          <span class="message-file-icon">
                            <el-icon><Document /></el-icon>
                          </span>
                          <span class="message-file-copy">
                            <strong>{{ attachment.name }}</strong>
                            <small>
                              {{ attachment.extension }} ·
                              {{ formatFileSize(attachment.size) }} ·
                              {{ attachment.characterCount.toLocaleString() }}
                              字
                            </small>
                          </span>
                          <span class="message-file-action">查看</span>
                        </button>
                      </template>
                      <div class="attachment-preview">
                        <strong>{{ attachment.name }}</strong>
                        <span>
                          已提取
                          {{ attachment.characterCount.toLocaleString() }}
                          字{{
                            attachment.truncated
                              ? '，内容较长，发送时会省略一部分'
                              : ''
                          }}
                        </span>
                        <p>{{ attachment.content.slice(0, 1_500) }}</p>
                      </div>
                    </el-popover>
                  </div>
                  <Thinking
                    v-if="showReasoning && item.reasoning"
                    :content="item.reasoning"
                    :status="item.loading ? 'thinking' : 'end'"
                    :auto-collapse="true"
                    max-width="100%"
                  />
                  <div v-if="item.content" class="message-text">
                    <template v-if="item.role === 'user'">{{ item.content }}</template>
                    <div
                      v-else
                      class="formatted-answer"
                      v-html="renderAnswerText(item.content)"
                      @click="handleAnswerClick"
                    ></div>
                  </div>
                  <div v-if="item.truncated" class="response-limit-note">
                    <span>这次回答已经到达长度上限。</span>
                    <el-button
                      text
                      size="small"
                      :disabled="isGenerating"
                      @click="continueResponse"
                    >
                      继续回答
                    </el-button>
                  </div>
                  <div
                    v-if="item.sources?.length"
                    class="message-sources"
                    aria-label="回答参考的资料"
                  >
                    <div class="source-heading">
                      <el-icon><Files /></el-icon>
                      参考资料 · {{ item.sources.length }}
                    </div>
                    <div class="source-list">
                      <el-popover
                        v-for="(source, sourceIndex) in item.sources"
                        :key="source.id"
                        placement="top-start"
                        :width="340"
                        trigger="click"
                      >
                        <template #reference>
                          <button class="source-chip" type="button">
                            <span>[{{ sourceIndex + 1 }}]</span>
                            {{ source.documentName }}
                          </button>
                        </template>
                        <div class="source-popover">
                          <strong>{{ source.documentName }}</strong>
                          <span>
                            第 {{ source.chunkIndex + 1 }} 段 ·
                            {{
                              source.mode === 'vector'
                                ? '智能找到'
                                : '文字找到'
                            }}
                            · {{ Math.round(source.score * 100) }}%
                          </span>
                          <p>{{ source.excerpt }}</p>
                        </div>
                      </el-popover>
                    </div>
                  </div>
                </div>
              </template>
              <template #footer="{ item }">
                <div class="message-footer">
                  <span>{{ item.time }}</span>
                  <span v-if="item.stopped" class="message-status">
                    已由用户停止
                  </span>
                  <template v-if="item.role === 'user'">
                    <el-button
                      text
                      size="small"
                      aria-label="复制问题"
                      @click="copyMessage(item.content)"
                    >
                      <el-icon><CopyDocument /></el-icon>
                      复制
                    </el-button>
                    <el-button
                      text
                      size="small"
                      :disabled="isGenerating"
                      aria-label="编辑问题并重新生成"
                      @click="editUserMessage(item)"
                    >
                      <el-icon><EditPen /></el-icon>
                      编辑
                    </el-button>
                  </template>
                  <template v-if="item.role === 'assistant' && item.content">
                    <el-button
                      v-if="item.generationType === 'image' && item.images?.[0]"
                      text
                      size="small"
                      aria-label="保存生成的图片"
                      @click="downloadMessageImage(item.images[0])"
                    >
                      <el-icon><Download /></el-icon>
                      保存图片
                    </el-button>
                    <el-button
                      v-if="item.generationType !== 'image'"
                      text
                      size="small"
                      aria-label="复制回答"
                      @click="copyMessage(item.content)"
                    >
                      <el-icon><CopyDocument /></el-icon>
                      复制
                    </el-button>
                    <el-button
                      v-if="
                        item.generationType !== 'image' &&
                        item.id === latestAssistantId &&
                        messages.some((message) => message.role === 'user')
                      "
                      text
                      size="small"
                      :disabled="isGenerating"
                      @click="regenerateLast"
                    >
                      <el-icon><RefreshRight /></el-icon>
                      重新生成
                    </el-button>
                  </template>
                </div>
              </template>
            </BubbleList>
          </div>

          <section
            v-else-if="!ollamaConnected || !models.length"
            class="empty-chat-state setup-empty-state"
            aria-label="完成首次准备"
          >
            <div class="empty-chat-mark" aria-hidden="true">
              <el-icon><Cpu /></el-icon>
            </div>
            <h2>
              {{
                ollamaConnected
                  ? '添加一个模型即可开始'
                  : '完成准备后即可开始'
              }}
            </h2>
            <p>
              {{
                ollamaConnected
                  ? '选择已经下载好的模型文件，系统会自动检查并安装。'
                  : '打开运行检查，系统会告诉你还缺少什么。'
              }}
            </p>
            <el-button
              class="setup-primary-action"
              type="primary"
              @click="
                ollamaConnected
                  ? (modelDrawerOpen = true)
                  : (diagnosticsDrawerOpen = true)
              "
            >
              <el-icon><ArrowRight /></el-icon>
              {{ ollamaConnected ? '添加模型' : '打开运行检查' }}
            </el-button>
            <small>准备完成后，这个引导会自动消失。</small>
          </section>

          <section v-else class="empty-chat-state" aria-label="开始新对话">
            <div class="empty-chat-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32">
                <path d="M4 24.5C12 23 20.5 17 27 5.5" />
                <path d="m16.5 18.5 3.8-9 6.7-4-2.2 7.5-8.3 5.5Z" />
                <path d="M8 26h17" />
              </svg>
            </div>
            <h2>有什么可以帮你？</h2>
            <p>
              {{
                models.length
                  ? `正在使用 ${selectedModel.name}`
                  : '启动 AI 服务并选择一个模型后即可开始'
              }}
            </p>
            <div class="empty-prompt-list">
              <button
                v-for="prompt in quickPrompts"
                :key="prompt"
                type="button"
                @click="useQuickPrompt(prompt)"
              >
                {{ prompt }}
              </button>
            </div>
          </section>

          <div
            class="composer-shell"
            :class="{ 'is-image-dragging': attachmentDragActive }"
            @dragenter.prevent="attachmentDragActive = true"
            @dragover.prevent
            @dragleave.prevent="attachmentDragActive = false"
            @drop.prevent="handleAttachmentDrop"
          >
            <input
              ref="attachmentInputRef"
              class="visually-hidden-input"
              type="file"
              :accept="
                composerMode === 'image'
                  ? 'image/jpeg,image/png,image/webp'
                  : 'image/jpeg,image/png,image/webp,.txt,.md,.markdown,.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv'
              "
              :multiple="composerMode !== 'image'"
              tabindex="-1"
              @change="handleAttachmentInput"
            />
            <div v-if="attachmentDragActive" class="image-drop-overlay">
              <el-icon><Paperclip /></el-icon>
              <strong>
                {{ composerMode === 'image' ? '松开即可设为参考图' : '松开鼠标即可添加' }}
              </strong>
              <span>
                {{
                  composerMode === 'image'
                    ? '支持 JPG、PNG 和 WebP，一次使用一张'
                    : '支持常见图片、文本、PDF、Word 和 Excel 文件'
                }}
              </span>
            </div>
            <div
              v-if="
                composerMode !== 'image' &&
                (pendingImages.length ||
                  pendingAttachments.length ||
                  attachmentProcessing)
              "
              class="image-attachment-tray"
              aria-live="polite"
            >
              <div class="attachment-tray-heading">
                <span>
                  <el-icon><Paperclip /></el-icon>
                  已添加
                  {{ pendingImages.length + pendingAttachments.length }}
                  个文件
                </span>
                <small>
                  {{
                    attachmentProcessing
                      ? '正在读取文件'
                      : pendingImages.length
                        ? selectedModelSupportsVision
                          ? '可以识别图片'
                          : preferredVisionModel
                            ? `将自动使用 ${preferredVisionModel.name}`
                            : '还没有可以识别图片的模型'
                        : '文件可以发送'
                  }}
                </small>
              </div>
              <div class="pending-attachment-list">
                <figure
                  v-for="image in pendingImages"
                  :key="image.id"
                  class="pending-image"
                >
                  <el-image
                    :src="image.dataUrl"
                    :alt="image.name"
                    :preview-src-list="[image.dataUrl]"
                    preview-teleported
                    fit="cover"
                  />
                  <figcaption>
                    <strong>{{ image.name }}</strong>
                    <span>
                      {{ image.width }}×{{ image.height }} ·
                      {{ formatFileSize(image.size) }}
                    </span>
                  </figcaption>
                  <button
                    type="button"
                    :aria-label="`移除 ${image.name}`"
                    @click="removePendingImage(image.id)"
                  >
                    <el-icon><CloseBold /></el-icon>
                  </button>
                </figure>
                <article
                  v-for="attachment in pendingAttachments"
                  :key="attachment.id"
                  class="pending-document"
                >
                  <span class="pending-document-icon">
                    <el-icon><Document /></el-icon>
                    {{ attachment.extension }}
                  </span>
                  <div>
                    <strong>{{ attachment.name }}</strong>
                    <span>
                      {{ formatFileSize(attachment.size) }} ·
                      {{ attachment.characterCount.toLocaleString() }} 字
                    </span>
                  </div>
                  <button
                    type="button"
                    :aria-label="`移除 ${attachment.name}`"
                    @click="removePendingAttachment(attachment.id)"
                  >
                    <el-icon><CloseBold /></el-icon>
                  </button>
                </article>
                <div
                  v-if="attachmentProcessing"
                  class="image-processing-card"
                >
                  <span></span>
                  正在读取
                </div>
              </div>
              <div
                v-if="
                  pendingImages.length &&
                  !selectedModelSupportsVision &&
                  preferredVisionModel
                "
                class="vision-auto-route"
              >
                本次将自动使用 {{ preferredVisionModel.name }} 识别图片，不会更改当前聊天模型。
              </div>
              <div
                v-else-if="pendingImages.length && !preferredVisionModel"
                class="vision-model-warning"
              >
                还没有可以识别图片的模型，请先添加一个再发送。
              </div>
            </div>
            <div
              v-if="composerMode === 'image'"
              class="composer-mode-strip"
              aria-label="图片创作模式"
            >
              <div class="composer-mode-title">
                <span><el-icon><MagicStick /></el-icon></span>
                <div>
                  <strong>图片创作</strong>
                  <small>
                    {{
                      pendingImages.length
                        ? `参考图修改 · ${selectedImageProvider?.label}`
                        : `文字生成 · ${selectedImageProvider?.label}`
                    }}
                  </small>
                </div>
              </div>
              <div class="composer-canvas-options" aria-label="图片形状">
                <button
                  v-for="option in imageCanvasOptions"
                  :key="option.id"
                  type="button"
                  :class="{ 'is-selected': imageCanvas === option.id }"
                  :aria-pressed="imageCanvas === option.id"
                  :disabled="isGenerating"
                  @click="imageCanvas = option.id"
                >
                  {{ option.label }}
                </button>
              </div>
              <button
                class="composer-mode-close"
                type="button"
                aria-label="退出图片创作模式"
                :disabled="isGenerating"
                @click="leaveImageComposer"
              >
                <el-icon><CloseBold /></el-icon>
              </button>
              <div
                v-if="pendingImages[0]"
                class="composer-reference-editor"
                aria-label="图片修改设置"
              >
                <el-image
                  class="composer-reference-image"
                  :src="pendingImages[0].dataUrl"
                  :alt="`参考图：${pendingImages[0].name}`"
                  :preview-src-list="[pendingImages[0].dataUrl]"
                  preview-teleported
                  fit="cover"
                />
                <div class="composer-reference-copy">
                  <strong>参考图</strong>
                  <small>
                    {{ pendingImages[0].width }}×{{ pendingImages[0].height }} · 修改后仍保留原图
                  </small>
                </div>
                <label class="composer-strength-control">
                  <span>
                    改动幅度
                    <strong>{{ Math.round(imageEditStrength * 100) }}%</strong>
                  </span>
                  <input
                    v-model.number="imageEditStrength"
                    type="range"
                    min="0.1"
                    max="0.95"
                    step="0.05"
                    :disabled="isGenerating"
                    aria-label="图片改动幅度"
                  />
                  <small><span>更像原图</span><span>变化更多</span></small>
                </label>
                <button
                  class="composer-reference-remove"
                  type="button"
                  :disabled="isGenerating"
                  :aria-label="`移除参考图 ${pendingImages[0].name}`"
                  @click="removePendingImage(pendingImages[0].id)"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
              <button
                v-else
                class="composer-reference-add"
                type="button"
                :disabled="isGenerating || attachmentProcessing"
                @click="openAttachmentPicker"
              >
                <el-icon><Picture /></el-icon>
                添加参考图进行修改
              </button>
            </div>
            <div class="composer-input">
              <div class="sender-prefix-actions">
                <el-dropdown
                  trigger="click"
                  placement="top-start"
                  @command="handleComposerResourceAction"
                >
                  <button
                    class="composer-tool-button"
                    type="button"
                    aria-label="添加文件或使用我的资料"
                    :disabled="isGenerating || attachmentProcessing"
                  >
                    <el-icon><Plus /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item
                        command="attachment"
                        :disabled="
                          pendingImages.length + pendingAttachments.length >=
                            MAX_MESSAGE_ATTACHMENT_COUNT
                        "
                      >
                        <el-icon><Paperclip /></el-icon>
                        {{ composerMode === 'image' ? '添加参考图' : '上传图片或文档' }}
                      </el-dropdown-item>
                      <el-dropdown-item command="knowledge">
                        <el-icon><FolderOpened /></el-icon>
                        选择我的资料
                      </el-dropdown-item>
                      <el-dropdown-item command="image-generation">
                        <el-icon><MagicStick /></el-icon>
                        创作图片
                      </el-dropdown-item>
                      <el-dropdown-item command="models" divided>
                        <el-icon><DataAnalysis /></el-icon>
                        管理 AI 模型
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
              <textarea
                ref="senderRef"
                v-model="senderText"
                class="composer-textarea"
                rows="1"
                maxlength="8000"
                :aria-label="composerMode === 'image' ? '描述想要的画面' : '输入问题'"
                :placeholder="
                  composerMode === 'image'
                    ? pendingImages.length
                      ? '描述想怎样修改这张图，按 Enter 开始'
                      : '描述想要的画面，按 Enter 开始生成'
                    : '输入问题，按 Enter 发送，Shift + Enter 换行'
                "
                @input="resizeComposer"
                @keydown="handleComposerKeydown"
                @paste="handleComposerPaste"
              ></textarea>
              <div class="composer-input-actions">
                <el-tooltip
                  :content="
                    isGenerating
                      ? isStopping
                        ? '正在停止生成'
                        : '停止生成（Esc）'
                      : composerMode === 'image'
                        ? '生成图片（Enter）'
                        : '发送消息（Enter）'
                  "
                  placement="top"
                >
                  <button
                    class="composer-action-button"
                    :class="{ 'is-stop': isGenerating }"
                    type="button"
                    :aria-label="isGenerating ? '停止生成' : '发送消息'"
                    :disabled="attachmentProcessing || isStopping"
                    @click="isGenerating ? stopGeneration() : handleSubmit()"
                  >
                    <span v-if="isGenerating" class="stop-square"></span>
                    <el-icon v-else><ArrowRight /></el-icon>
                  </button>
                </el-tooltip>
              </div>
            </div>
            <div class="composer-meta">
              <span>
                <template v-if="isGenerating">
                  <span class="generation-pulse"></span>
                  {{
                    isStopping
                      ? '正在停止'
                      : composerMode === 'image'
                        ? '正在生成图片 · ESC 可停止'
                        : '正在生成 · ESC 可停止'
                  }}
                </template>
                <template v-else>
                  {{
                    composerMode === 'image'
                      ? '图片将在本地生成'
                      : persistenceLabel
                  }}
                </template>
              </span>
              <span>{{ senderTextLength.toLocaleString() }} / 8,000</span>
            </div>
          </div>
        </section>
      </main>

      <el-drawer
        v-model="imageStudioOpen"
        class="product-drawer image-studio-drawer"
        title="图片创作"
        size="min(760px, 96vw)"
        append-to-body
        :close-on-click-modal="!imageGenerating"
      >
        <template #header>
          <div class="drawer-heading">
            <div>
              <h2>图片创作</h2>
              <p>描述想要的画面，由这台电脑在本地生成</p>
            </div>
            <el-tag
              :type="imageProviderOptions.length ? 'success' : 'warning'"
              effect="plain"
            >
              {{
                imageProviderOptions.length
                  ? '图片模型已就绪'
                  : '等待准备图片组件'
              }}
            </el-tag>
          </div>
        </template>

        <div class="drawer-content image-studio-content">
          <section
            v-if="!imageProviderOptions.length"
            class="image-model-install"
          >
            <div class="image-model-install-icon">
              <el-icon><Picture /></el-icon>
            </div>
            <span>{{ hostPlatformLabel }} 本地图片创作</span>
            <h3>添加完整模型后即可使用</h3>
            <p>
              直接点击“添加模型”并选择下载页中的全部文件。系统会自动识别、组合并复用已有文件。
            </p>

            <div class="image-setup-checks">
              <div :class="{ 'is-ready': imageRuntime.runtimeFound }">
                <el-icon>
                  <CircleCheck v-if="imageRuntime.runtimeFound" />
                  <Download v-else />
                </el-icon>
                <span>
                  <strong>图片运行组件</strong>
                  <small>
                    {{
                      imageRuntime.runtimeFound
                        ? '已经找到'
                        : '当前发布包缺少图片组件'
                    }}
                  </small>
                </span>
              </div>
              <div :class="{ 'is-ready': imageRuntime.modelConfigured }">
                <el-icon>
                  <CircleCheck v-if="imageRuntime.modelConfigured" />
                  <FolderOpened v-else />
                </el-icon>
                <span>
                  <strong>图片模型文件</strong>
                  <small>
                    {{
                      imageRuntime.modelConfigured
                        ? `已经找到 ${imageRuntime.modelFiles.length} 个文件`
                        : imageRuntime.missingFiles?.length
                          ? `还缺少：${imageRuntime.missingFiles.join('、')}`
                          : '尚未添加完整模型'
                    }}
                  </small>
                </span>
              </div>
            </div>

            <div class="image-setup-actions">
              <el-button
                v-if="systemInfo.canManage"
                type="primary"
                :loading="imageModelImporting"
                @click="openImageModelPicker"
              >
                <el-icon><FolderOpened /></el-icon>
                添加模型
              </el-button>
              <el-button
                :loading="imageRuntimeChecking"
                @click="refreshImageRuntime({ announce: true })"
              >
                <el-icon><RefreshRight /></el-icon>
                重新检查
              </el-button>
            </div>

            <div v-if="!systemInfo.canManage" class="host-managed-note compact">
              <el-icon><Lock /></el-icon>
              <div>
                <strong>请在主机上添加图片模型</strong>
                <span>模型准备完成后，这台电脑会自动识别并直接使用。</span>
              </div>
            </div>

            <div
              v-if="imageModelImporting || imageModelImportStatus"
              class="image-model-import-progress"
            >
              <div>
                <span>{{ imageModelImportStatus }}</span>
                <strong>{{ imageModelImportProgress }}%</strong>
              </div>
              <el-progress
                :percentage="imageModelImportProgress"
                :show-text="false"
                :status="imageModelImportProgress === 100 ? 'success' : undefined"
              />
            </div>

            <div class="image-platform-note">
              <strong>系统会自动判断</strong>
              <span>
                聊天、看图、资料查找和图片创作共用同一个添加入口。FLUX.2 通常需要同一下载页中的 3 个文件。
              </span>
            </div>
            <div
              v-if="imageRuntime.runtimeError"
              class="vision-model-warning"
              role="alert"
            >
              {{ imageRuntime.runtimeError }}
            </div>
          </section>

          <template v-else>
            <section class="image-studio-form">
              <div class="image-auto-route" aria-live="polite">
                <span class="image-auto-route-dot"></span>
                <div>
                  <strong>自动使用 {{ selectedImageProvider?.label }}</strong>
                  <small>只负责生成图片，不会更改聊天模型</small>
                </div>
              </div>

              <label for="image-prompt">想要什么样的画面</label>
              <el-input
                id="image-prompt"
                v-model="imagePrompt"
                type="textarea"
                :rows="5"
                maxlength="1200"
                show-word-limit
                resize="vertical"
                :disabled="imageGenerating"
                placeholder="例如：一枚银色航天器停在火星基地，清晨阳光，电影感，画面中不要出现文字"
              />

              <div class="image-canvas-heading">
                <span>图片形状</span>
                <small>正方形最适合第一次测试</small>
              </div>
              <div class="image-canvas-options">
                <button
                  v-for="option in imageCanvasOptions"
                  :key="option.id"
                  type="button"
                  :class="{ 'is-selected': imageCanvas === option.id }"
                  :disabled="imageGenerating"
                  @click="imageCanvas = option.id"
                >
                  <span
                    class="image-canvas-shape"
                    :class="`is-${option.id}`"
                  ></span>
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.detail }}</small>
                </button>
              </div>

              <div class="image-platform-note compact">
                <strong>试用功能</strong>
                <span>
                  {{
                    selectedImageProvider?.kind === 'local-runtime'
                      ? `${hostPlatformLabel} 图片组件已连接。首次运行需要载入模型，可能等待几十秒。`
                      : '当前使用 Ollama 图片模型；图片仍只在本地生成。'
                  }}
                </span>
              </div>

              <details class="image-model-more">
                <summary>更多设置</summary>
                <div class="image-model-more-content">
                  <label for="image-model">图片模型</label>
                  <el-select
                    id="image-model"
                    v-model="imageModelId"
                    :disabled="imageGenerating"
                    placeholder="自动选择"
                  >
                    <el-option
                      label="自动选择（推荐）"
                      :value="AUTO_IMAGE_PROVIDER_ID"
                    />
                    <el-option
                      v-for="provider in imageProviderOptions"
                      :key="provider.id"
                      :label="`${provider.label} · ${provider.detail}`"
                      :value="provider.id"
                    />
                  </el-select>
                  <small>只有需要固定使用某个图片模型时才需要更改。</small>

                  <div class="image-model-management-shortcut">
                    <span>
                      <strong>模型文件统一管理</strong>
                      <small>添加、删除和检查图片模型请前往模型管理</small>
                    </span>
                    <el-button @click="openUnifiedModelManagement">
                      打开模型管理
                    </el-button>
                  </div>
                </div>
              </details>

              <div v-if="imageStatus" class="image-generation-state">
                <div>
                  <span>{{ imageStatus }}</span>
                  <strong v-if="imageGenerating">{{ imageProgress }}%</strong>
                </div>
                <el-progress
                  v-if="imageGenerating"
                  :percentage="imageProgress"
                  :show-text="false"
                  :stroke-width="5"
                />
              </div>

              <div class="image-generation-actions">
                <el-button
                  v-if="imageGenerating"
                  class="image-stop-button"
                  @click="stopImageCreation"
                >
                  <span class="stop-square"></span>
                  停止
                </el-button>
                <el-button
                  v-else
                  type="primary"
                  :disabled="!imagePrompt.trim() || !selectedImageProvider"
                  @click="createImage"
                >
                  <el-icon><MagicStick /></el-icon>
                  开始生成
                </el-button>
              </div>
            </section>

            <section
              v-if="generatedImageUrl"
              class="generated-image-section"
            >
              <div class="generated-image-heading">
                <div>
                  <span>生成结果</span>
                  <strong>{{ generatedImageModel }}</strong>
                </div>
                <el-button @click="downloadGeneratedImage">
                  <el-icon><Download /></el-icon>
                  保存图片
                </el-button>
              </div>
              <el-image
                class="generated-image"
                :src="generatedImageUrl"
                :preview-src-list="[generatedImageUrl]"
                fit="contain"
                preview-teleported
                hide-on-click-modal
              />
            </section>

            <section v-if="imageHistory.length" class="image-history-section">
              <div class="image-history-heading">
                <div>
                  <span>本地记录</span>
                  <strong>最近生成的图片</strong>
                </div>
                <el-button text size="small" @click="clearGeneratedImageHistory">
                  清空记录
                </el-button>
              </div>
              <div class="image-history-grid">
                <article v-for="item in imageHistory" :key="item.id">
                  <button type="button" @click="openImageHistoryItem(item)">
                    <img :src="item.dataUrl" :alt="item.prompt" />
                    <span>{{ item.prompt }}</span>
                    <small>{{ formatImageHistoryTime(item.createdAt) }}</small>
                  </button>
                  <button
                    class="image-history-delete"
                    type="button"
                    :aria-label="`删除图片记录 ${item.prompt}`"
                    @click="removeImageHistoryItem(item.id)"
                  >
                    <el-icon><CloseBold /></el-icon>
                  </button>
                </article>
              </div>
            </section>
          </template>
        </div>
      </el-drawer>

      <el-drawer
        v-model="modelDrawerOpen"
        class="product-drawer unified-model-drawer"
        title="模型管理"
        size="min(820px, 94vw)"
        append-to-body
      >
        <template #header>
          <div class="drawer-heading">
            <div>
              <h2>模型管理</h2>
              <p>查看、添加和选择这台电脑上的 AI 模型</p>
            </div>
            <div class="drawer-actions">
              <el-button
                :loading="ollamaRefreshing"
                @click="refreshOllama({ announce: true })"
              >
                <el-icon><RefreshRight /></el-icon>
                刷新
              </el-button>
              <el-button
                v-if="systemInfo.canManage"
                type="primary"
                @click="openImportDialog"
              >
                <el-icon><DocumentAdd /></el-icon>
                添加模型
              </el-button>
            </div>
          </div>
        </template>

        <div class="drawer-content">
          <div class="storage-summary">
            <div class="storage-icon"><el-icon><Files /></el-icon></div>
            <div class="storage-copy">
              <strong>统一模型中心</strong>
              <span>
                {{ managedModelCount }} 组可用模型 · 对话模型占用 {{ totalModelSize }}
              </span>
            </div>
            <el-progress
              :percentage="ollamaConnected ? 100 : 0"
              :status="ollamaConnected ? 'success' : 'exception'"
              :show-text="false"
            />
            <span class="storage-free">版本 {{ ollamaVersion }}</span>
          </div>

          <section
            v-for="section in managedModelSections"
            :key="section.key"
            class="managed-model-section"
            :aria-labelledby="`managed-model-${section.key}`"
          >
            <div class="managed-model-heading">
              <div>
                <h3 :id="`managed-model-${section.key}`">{{ section.title }}</h3>
                <p>{{ section.description }}</p>
              </div>
              <span>
                {{
                  section.models.length +
                  (section.key === 'image' && imageRuntime.modelFiles.length ? 1 : 0)
                }}
                组
              </span>
            </div>

            <div class="model-list managed-model-list">
              <article
                v-if="section.key === 'image' && imageRuntime.modelFiles.length"
                class="model-row local-image-model-row"
                :class="{
                  'is-current': selectedImageProvider?.id === 'local-runtime',
                }"
              >
                <div class="model-symbol">图</div>
                <div class="model-details">
                  <div class="model-title-line">
                    <h3>{{ imageRuntime.modelLabel }}</h3>
                    <el-tag
                      :type="imageRuntime.serviceOnline ? 'success' : 'warning'"
                      effect="plain"
                      size="small"
                    >
                      {{ imageRuntime.serviceOnline ? '已载入' : '待检查' }}
                    </el-tag>
                  </div>
                  <div class="model-specs">
                    <span>{{ imageRuntime.modelFiles.length }} 个组合文件</span>
                    <span class="model-capability">生成图片</span>
                    <span class="model-capability">修改图片</span>
                  </div>
                </div>
                <div class="model-actions">
                  <span class="runtime-state">
                    <span
                      class="status-dot"
                      :class="{ muted: !imageRuntime.serviceOnline }"
                    ></span>
                    {{ imageRuntime.serviceOnline ? '运行正常' : '尚未载入' }}
                  </span>
                  <el-button
                    :disabled="
                      selectedImageProvider?.id === 'local-runtime' ||
                      !imageRuntime.serviceOnline
                    "
                    @click="useLocalImageRuntime"
                  >
                    {{
                      selectedImageProvider?.id === 'local-runtime'
                        ? '使用中'
                        : '用于创作'
                    }}
                  </el-button>
                </div>
              </article>

              <details
                v-if="section.key === 'image' && imageRuntime.modelFiles.length"
                class="managed-model-files"
              >
                <summary>
                  查看 {{ imageRuntime.modelFiles.length }} 个图片模型文件
                </summary>
                <div>
                  <div
                    v-for="fileName in imageRuntime.modelFiles"
                    :key="fileName"
                  >
                    <span>{{ fileName }}</span>
                    <el-button
                      v-if="systemInfo.canManage"
                      text
                      type="danger"
                      size="small"
                      :disabled="imageGenerating || imageModelImporting"
                      :aria-label="`删除 ${fileName}`"
                      @click="removeImageModelFile(fileName)"
                    >
                      <el-icon><Delete /></el-icon>
                    </el-button>
                  </div>
                </div>
              </details>

              <article
                v-for="model in section.models"
                :key="`${section.key}:${model.id}`"
                class="model-row"
                :class="{
                  'is-current': isManagedModelSelected(model, section.key),
                }"
              >
                <div class="model-symbol">{{ model.family.slice(0, 1) }}</div>
                <div class="model-details">
                  <div class="model-title-line">
                    <h3>{{ model.name }}</h3>
                    <el-tag
                      v-if="isManagedModelSelected(model, section.key)"
                      type="success"
                      effect="plain"
                      size="small"
                    >
                      当前
                    </el-tag>
                  </div>
                  <div class="model-specs">
                    <span>{{ model.size }}</span>
                    <span
                      v-if="model.capabilities.includes('vision')"
                      class="model-capability"
                    >
                      支持图片
                    </span>
                    <span
                      v-if="model.capabilities.includes('embedding')"
                      class="model-capability"
                    >
                      资料查找
                    </span>
                    <span
                      v-if="isImageGenerationModel(model)"
                      class="model-capability"
                    >
                      图片创作
                    </span>
                    <span
                      v-if="model.capabilities.includes('thinking')"
                      class="model-capability"
                    >
                      回答思路
                    </span>
                    <span
                      v-if="!model.detailsAvailable"
                      class="model-capability muted"
                    >
                      信息待确认
                    </span>
                  </div>
                </div>
                <div class="model-actions">
                  <span class="runtime-state">
                    <span
                      class="status-dot"
                      :class="{ muted: model.status !== 'ready' }"
                    ></span>
                    {{ model.status === 'ready' ? '已载入' : '可以使用' }}
                  </span>
                  <el-button
                    :disabled="isManagedModelSelected(model, section.key)"
                    @click="useManagedModel(model, section.key)"
                  >
                    <el-icon
                      v-if="isManagedModelSelected(model, section.key)"
                    >
                      <Check />
                    </el-icon>
                    {{ managedModelActionLabel(model, section.key) }}
                  </el-button>
                  <el-button
                    v-if="systemInfo.canManage"
                    class="model-delete-button"
                    text
                    type="danger"
                    :disabled="isGenerating"
                    :aria-label="`删除 ${model.name}`"
                    @click="removeModel(model)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </article>

              <div
                v-if="
                  section.models.length === 0 &&
                  (section.key !== 'image' || !imageRuntime.modelFiles.length)
                "
                class="model-empty compact"
              >
                <strong>
                  {{
                    section.key === 'conversation'
                      ? ollamaConnected
                        ? '还没有对话模型'
                        : 'AI 服务尚未启动'
                      : section.key === 'knowledge'
                        ? '尚未添加资料查找模型'
                        : '尚未添加图片生成模型'
                  }}
                </strong>
                <span>
                  {{
                    section.key === 'knowledge'
                      ? '没有专用模型时仍可使用普通文字查找'
                      : section.key === 'image'
                        ? '添加完整图片模型后，可在对话中直接生成和修改图片'
                        : ollamaError || '点击右上角“添加模型”开始使用'
                  }}
                </span>
              </div>
            </div>

            <div
              v-if="section.key === 'image' && imageRuntime.runtimeError"
              class="vision-model-warning"
              role="alert"
            >
              {{ imageRuntime.runtimeError }}
            </div>
          </section>

          <details class="vision-model-guide managed-model-guide">
            <summary>模型推荐与安装帮助</summary>
            <div class="managed-model-guide-content">
              <div class="vision-guide-heading">
                <div>
                  <span>适合当前电脑</span>
                  <h3>安装可以识别图片的模型</h3>
                </div>
                <el-tag type="success" effect="plain">文字和图片</el-tag>
              </div>
              <p>
                点击下方内容即可复制，然后粘贴到运行服务的电脑中进行安装。
                安装完成后点击“刷新”。
              </p>
              <article
                v-for="recommendation in visionModelRecommendations"
                :key="recommendation.command"
                class="vision-recommendation"
              >
                <div>
                  <span>
                    {{ recommendation.label }} · {{ recommendation.size }}
                  </span>
                  <strong>{{ recommendation.name }}</strong>
                  <small>{{ recommendation.note }}</small>
                </div>
                <button
                  type="button"
                  :aria-label="`复制 ${recommendation.name} 的安装内容`"
                  @click="copyInstallCommand(recommendation.command)"
                >
                  <span>复制安装内容</span>
                  <el-icon><CopyDocument /></el-icon>
                </button>
              </article>
            </div>
          </details>

          <button
            v-if="systemInfo.canManage"
            class="import-entry"
            type="button"
            @click="openImportDialog"
          >
            <span class="import-entry-icon"><el-icon><Plus /></el-icon></span>
            <span>
              <strong>从电脑添加模型</strong>
              <small>选择下载页中的文件，系统自动判断模型用途并组合</small>
            </span>
            <el-icon class="import-arrow"><ArrowRight /></el-icon>
          </button>
          <div v-else class="host-managed-note">
            <el-icon><Lock /></el-icon>
            <div>
              <strong>模型由主机统一管理</strong>
              <span>这台电脑可以正常使用模型，但安装和删除需要在运行 ShotAI 的主机上操作。</span>
            </div>
          </div>
        </div>
      </el-drawer>

      <el-drawer
        v-model="knowledgeDrawerOpen"
        class="product-drawer knowledge-drawer"
        title="我的资料"
        size="min(960px, 96vw)"
        append-to-body
      >
        <template #header>
          <div class="drawer-heading">
            <div>
              <h2>我的资料</h2>
              <p>添加常用文件，让 ShotAI 可以根据这些内容回答</p>
            </div>
            <div class="drawer-actions">
              <el-tag
                :type="
                  knowledgePersistenceState === 'error' ? 'danger' : 'success'
                "
                effect="plain"
              >
                {{ knowledgePersistenceLabel }}
              </el-tag>
              <el-button type="primary" @click="createNewKnowledgeBase">
                <el-icon><Plus /></el-icon>
                新建资料夹
              </el-button>
            </div>
          </div>
        </template>

        <div class="drawer-content knowledge-content">
          <details class="knowledge-more-settings">
            <summary>资料查找设置</summary>
            <div class="knowledge-more-content">
              <section class="knowledge-telemetry">
                <div>
                  <span>资料夹</span>
                  <strong>{{ knowledgeBases.length }}</strong>
                  <small>用于分类整理</small>
                </div>
                <div>
                  <span>文件</span>
                  <strong>{{ totalKnowledgeDocuments }}</strong>
                  <small>已经添加</small>
                </div>
                <div>
                  <span>内容</span>
                  <strong>{{ totalKnowledgeChunks }}</strong>
                  <small>已经整理</small>
                </div>
                <div>
                  <span>当前使用</span>
                  <strong>{{ activeKnowledgeBases.length }}</strong>
                  <small>用于本次对话</small>
                </div>
              </section>

              <section class="embedding-panel">
                <div>
                  <span class="panel-code">查找方式</span>
                  <h3>资料查找助手</h3>
                  <p>
                    安装后查找资料会更准确；没有安装时仍然可以使用普通文字查找。
                  </p>
                </div>
                <div class="embedding-actions">
                  <el-select
                    v-model="embeddingModelId"
                    aria-label="选择资料查找助手"
                    placeholder="尚未安装资料查找助手"
                    clearable
                    :disabled="knowledgeImporting"
                  >
                    <el-option
                      v-for="model in embeddingModels"
                      :key="model.id"
                      :label="model.name"
                      :value="model.id"
                    />
                  </el-select>
                  <el-button
                    :disabled="
                      !embeddingModelId ||
                      !selectedKnowledgeBase?.chunks.length ||
                      knowledgeImporting
                    "
                    :loading="knowledgeImporting"
                    @click="rebuildKnowledgeIndex"
                  >
                    <el-icon><RefreshRight /></el-icon>
                    重新整理当前资料
                  </el-button>
                </div>
                <div
                  v-if="embeddingModels.length === 0"
                  class="knowledge-inline-warning"
                >
                  尚未安装资料查找助手。你仍然可以添加资料，并使用普通文字查找。
                </div>
              </section>
            </div>
          </details>

          <div class="knowledge-layout">
            <aside class="knowledge-base-panel">
              <div class="knowledge-panel-heading">
                <span>资料分类</span>
                <strong>资料夹列表</strong>
              </div>
              <div class="knowledge-base-list">
                <article
                  v-for="knowledgeBase in knowledgeBases"
                  :key="knowledgeBase.id"
                  class="knowledge-base-card"
                  :class="{
                    'is-selected':
                      knowledgeBase.id === selectedKnowledgeBaseId,
                  }"
                >
                  <button
                    type="button"
                    @click="selectedKnowledgeBaseId = knowledgeBase.id"
                  >
                    <span class="knowledge-base-icon">
                      <el-icon><Files /></el-icon>
                    </span>
                    <span>
                      <strong>{{ knowledgeBase.name }}</strong>
                      <small>
                        {{ knowledgeBase.documents.length }} 个文件
                      </small>
                    </span>
                    <el-icon><ArrowRight /></el-icon>
                  </button>
                  <el-checkbox
                    :model-value="
                      activeConversationRecord?.knowledgeBaseIds.includes(
                        knowledgeBase.id,
                      )
                    "
                    @change="
                      toggleConversationKnowledgeBase(
                        knowledgeBase.id,
                        Boolean($event),
                      )
                    "
                  >
                    用于当前对话
                  </el-checkbox>
                </article>
              </div>
            </aside>

            <section
              v-if="selectedKnowledgeBase"
              class="knowledge-document-panel"
            >
              <div class="knowledge-document-heading">
                <div>
                  <span>文件列表</span>
                  <h3>{{ selectedKnowledgeBase.name }}</h3>
                  <p>{{ selectedKnowledgeBase.description }}</p>
                </div>
                <div>
                  <el-button
                    circle
                    aria-label="重命名资料夹"
                    @click="renameKnowledgeBase(selectedKnowledgeBase)"
                  >
                    <el-icon><EditPen /></el-icon>
                  </el-button>
                  <el-button
                    circle
                    aria-label="删除资料夹"
                    @click="deleteKnowledgeBase(selectedKnowledgeBase)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>

              <el-upload
                class="knowledge-uploader"
                drag
                action="#"
                accept=".txt,.md,.markdown,.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv"
                :auto-upload="false"
                :show-file-list="false"
                :disabled="knowledgeImporting"
                :on-change="handleKnowledgeFileChange"
              >
                <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                <div class="el-upload__text">
                  将资料拖到这里，或 <em>选择本地文件</em>
                </div>
                <template #tip>
                  <div class="el-upload__tip">
                    支持文本、PDF、Word 和 Excel 文件；每个文件最大 20 MB
                  </div>
                </template>
              </el-upload>

              <div
                v-if="knowledgeImporting || knowledgeImportProgress > 0"
                class="knowledge-progress"
              >
                <div>
                  <span>{{ knowledgeImportStatus }}</span>
                  <strong>{{ knowledgeImportProgress }}%</strong>
                </div>
                <el-progress
                  :percentage="knowledgeImportProgress"
                  :show-text="false"
                  :status="
                    knowledgeImportProgress === 100 ? 'success' : undefined
                  "
                />
              </div>

              <div class="knowledge-document-list">
                <div
                  v-if="selectedKnowledgeBase.documents.length === 0"
                  class="knowledge-empty"
                >
                  <el-icon><DocumentAdd /></el-icon>
                  <strong>这个资料夹还是空的</strong>
                  <span>添加一份文件后，ShotAI 就可以根据它回答问题。</span>
                </div>
                <article
                  v-for="document in selectedKnowledgeBase.documents"
                  :key="document.id"
                  class="knowledge-document-row"
                >
                  <div class="document-type">{{ document.type }}</div>
                  <div class="document-copy">
                    <strong>{{ document.name }}</strong>
                    <span>
                      {{ formatFileSize(document.size) }} ·
                      {{ document.characterCount.toLocaleString() }} 字
                    </span>
                  </div>
                  <el-tag
                    :type="document.embeddingModel ? 'success' : 'info'"
                    effect="plain"
                    size="small"
                  >
                    {{ document.embeddingModel ? '智能查找' : '普通查找' }}
                  </el-tag>
                  <el-button
                    text
                    circle
                    :aria-label="`删除 ${document.name}`"
                    @click="deleteKnowledgeDocument(document)"
                  >
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </article>
              </div>
            </section>
          </div>
        </div>
      </el-drawer>

      <el-drawer
        v-model="diagnosticsDrawerOpen"
        class="product-drawer"
        title="运行检查"
        size="min(560px, 94vw)"
        append-to-body
      >
        <template #header>
          <div class="drawer-heading">
            <div>
              <h2>运行检查</h2>
              <p>检查服务是否启动，以及模型能否正常使用</p>
            </div>
            <el-tag
              :type="
                ollamaConnectionState === 'online'
                  ? 'success'
                  : ollamaConnectionState === 'degraded'
                    ? 'warning'
                    : 'danger'
              "
              effect="dark"
            >
              {{ ollamaStateLabel }}
            </el-tag>
          </div>
        </template>

        <div class="drawer-content diagnostics-content">
          <div
            class="diagnostic-hero"
            :class="{
              'has-error': ollamaConnectionState === 'offline',
              'has-warning': ollamaConnectionState === 'degraded',
            }"
          >
            <el-icon>
              <CircleCheck v-if="ollamaConnectionState === 'online'" />
              <Cpu v-else />
            </el-icon>
            <div>
              <strong>{{ ollamaStateCode }} · {{ ollamaVersion }}</strong>
              <span>{{ ollamaStateDescription }}</span>
            </div>
          </div>

          <div class="check-list">
            <div v-for="check in systemChecks" :key="check.label" class="check-row">
              <span>{{ check.label }}</span>
              <strong :class="{ 'check-error': !check.ok }">
                <el-icon><Check v-if="check.ok" /><Cpu v-else /></el-icon>
                {{ check.value }}
              </strong>
            </div>
          </div>

          <div class="hardware-section">
            <h3>模型使用情况</h3>
            <div class="hardware-row">
              <span>模型</span>
              <div>
                <strong>已经安装的模型</strong>
                <el-progress
                  :percentage="models.length ? 100 : 0"
                  :show-text="false"
                />
              </div>
              <small>{{ totalModelSize }}</small>
            </div>
            <div class="hardware-row">
              <span>运行</span>
              <div>
                <strong>当前正在使用</strong>
                <el-progress
                  :percentage="models.length ? Math.round((runningModelIds.length / models.length) * 100) : 0"
                  :show-text="false"
                />
              </div>
              <small>{{ runningModelIds.length }} / {{ models.length }}</small>
            </div>
          </div>

          <el-button
            class="report-button"
            plain
            :loading="ollamaRefreshing"
            @click="refreshOllama({ announce: true })"
          >
            <el-icon><RefreshRight /></el-icon>
            重新检查
          </el-button>
        </div>
      </el-drawer>

      <el-drawer
        v-model="settingsDrawerOpen"
        class="product-drawer settings-drawer"
        title="设置"
        size="min(620px, 94vw)"
        append-to-body
      >
        <template #header>
          <div class="drawer-heading">
            <div>
              <h2>设置</h2>
              <p>管理模型、资料、运行状态和回答方式</p>
            </div>
            <el-tag
              :type="persistenceState === 'error' ? 'danger' : 'success'"
              effect="plain"
            >
              {{ persistenceLabel }}
            </el-tag>
          </div>
        </template>

        <div
          v-if="activeConversationRecord"
          class="drawer-content settings-content"
        >
          <section class="settings-section">
            <div class="settings-section-heading">
              <div>
                <span>使用准备</span>
                <h3>AI 能力</h3>
              </div>
              <small>系统会自动选择</small>
            </div>

            <div class="capability-overview">
              <button
                v-for="capability in capabilityOverview"
                :key="capability.key"
                type="button"
                @click="openCapability(capability.key)"
              >
                <span class="capability-icon">
                  <el-icon>
                    <DataAnalysis v-if="capability.key === 'chat'" />
                    <Picture v-else-if="capability.key === 'vision'" />
                    <Files v-else-if="capability.key === 'knowledge'" />
                    <MagicStick v-else />
                  </el-icon>
                </span>
                <span class="capability-copy">
                  <span>
                    <strong>{{ capability.title }}</strong>
                    <em :class="{ 'needs-setup': !capability.ready }">
                      {{ capability.status }}
                    </em>
                  </span>
                  <small>{{ capability.detail }}</small>
                </span>
                <el-icon><ArrowRight /></el-icon>
              </button>
            </div>

            <div class="theme-setting-row">
              <div>
                <el-icon><Moon v-if="darkMode" /><Sunny v-else /></el-icon>
                <span>
                  <strong>深色主题</strong>
                  <small>切换工作台的明暗外观</small>
                </span>
              </div>
              <el-switch
                v-model="darkMode"
                aria-label="切换深色主题"
              />
            </div>

            <div class="version-setting-row">
              <span>ShotAI {{ systemInfo.version }}</span>
              <small>
                {{ systemInfo.canManage ? '主机管理模式' : '内网使用模式' }}
              </small>
            </div>
          </section>

          <section class="settings-section">
            <div class="settings-section-heading">
              <div>
                <span>当前对话</span>
                <h3>对话设置</h3>
              </div>
              <small>仅影响当前对话</small>
            </div>

            <el-form label-position="top">
              <el-form-item label="对话名称">
                <el-input
                  v-model="activeConversationRecord.label"
                  maxlength="60"
                  show-word-limit
                />
              </el-form-item>
              <el-form-item label="当前使用的 AI">
                <el-select
                  v-model="currentModelId"
                  placeholder="请选择模型"
                  :disabled="models.length === 0 || isGenerating"
                >
                  <el-option
                    v-for="model in models"
                    :key="model.id"
                    :label="model.name"
                    :value="model.id"
                  />
                </el-select>
                <div class="field-help">
                  每个对话可以使用不同的模型。
                </div>
              </el-form-item>
              <el-form-item label="回答要求">
                <el-input
                  v-model="activeConversationRecord.systemPrompt"
                  type="textarea"
                  :rows="6"
                  maxlength="2000"
                  show-word-limit
                  placeholder="例如：请用简洁、正式的中文回答"
                />
                <div class="field-help">
                  这里的要求会用于当前对话，并且只保存在这台电脑上。
                </div>
              </el-form-item>
            </el-form>
          </section>

          <section class="settings-section">
            <div class="settings-section-heading">
              <div>
                <span>回答方式</span>
                <h3>回答偏好</h3>
              </div>
              <small>仅影响当前对话</small>
            </div>

            <div class="parameter-list">
              <div class="parameter-row parameter-switch-row">
                <div>
                  <strong>显示回答思路</strong>
                  <span>关闭后只显示最终回答，也会减少等待时间</span>
                </div>
                <el-switch
                  v-model="showReasoning"
                  aria-label="显示回答思路"
                />
              </div>
              <div class="parameter-row">
                <div>
                  <strong>回答变化程度</strong>
                  <span>越低越稳定，越高越有变化</span>
                </div>
                <el-slider
                  v-model="activeConversationRecord.settings.temperature"
                  :min="0"
                  :max="2"
                  :step="0.1"
                  show-input
                  aria-label="回答变化程度"
                />
              </div>
              <div class="parameter-row">
                <div>
                  <strong>用词丰富程度</strong>
                  <span>越低越直接，越高越丰富</span>
                </div>
                <el-slider
                  v-model="activeConversationRecord.settings.topP"
                  :min="0.1"
                  :max="1"
                  :step="0.05"
                  show-input
                  aria-label="用词丰富程度"
                />
              </div>
              <div class="parameter-row parameter-select-row">
                <div>
                  <strong>可以记住的内容</strong>
                  <span>越长会占用更多电脑内存</span>
                </div>
                <el-select
                  v-model="activeConversationRecord.settings.contextLength"
                  aria-label="可以记住的内容"
                >
                  <el-option
                    v-for="option in [
                      { label: '较短', value: 2048 },
                      { label: '标准', value: 4096 },
                      { label: '较长', value: 8192 },
                      { label: '很长', value: 16384 },
                      { label: '最长', value: 32768 },
                    ]"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
              <div class="parameter-row parameter-select-row">
                <div>
                  <strong>回答长度</strong>
                  <span>控制每次回答最多可以写多长</span>
                </div>
                <el-select
                  v-model="activeConversationRecord.settings.maxOutput"
                  aria-label="回答长度"
                >
                  <el-option
                    v-for="option in [
                      { label: '简短', value: 256 },
                      { label: '适中', value: 512 },
                      { label: '详细', value: 1024 },
                      { label: '很长', value: 2048 },
                      { label: '最长', value: 4096 },
                    ]"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
              </div>
            </div>
          </section>

          <section class="settings-section local-data-card">
            <div>
              <el-icon><Lock /></el-icon>
              <div>
                <strong>自动保存在这台电脑</strong>
                <span>对话和设置不会发送到其他地方。</span>
              </div>
            </div>
            <span class="local-data-state">
              <span
                class="status-dot"
                :class="{ muted: persistenceState !== 'saved' }"
              ></span>
              {{ persistenceLabel }}
            </span>
          </section>

          <section class="settings-section data-cleanup-section">
            <div class="settings-section-heading">
              <div>
                <span>本机数据</span>
                <h3>清理与刷新</h3>
              </div>
              <small>按需操作</small>
            </div>
            <div class="cleanup-list">
              <div>
                <span><strong>刷新网页文件</strong><small>页面异常或更新后仍显示旧内容时使用</small></span>
                <el-button @click="refreshBrowserFiles">立即刷新</el-button>
              </div>
              <div v-if="systemInfo.canManage">
                <span><strong>模型临时文件</strong><small>清理中断上传和已不再使用的数据，不删除已安装模型</small></span>
                <el-button
                  :loading="modelCacheCleaning"
                  @click="clearModelCacheFiles"
                >
                  清理
                </el-button>
              </div>
              <div>
                <span><strong>全部对话</strong><small>{{ conversations.length }} 条本地记录</small></span>
                <el-button type="danger" plain @click="clearSavedConversations">清空</el-button>
              </div>
              <div>
                <span><strong>全部资料</strong><small>{{ totalKnowledgeDocuments }} 个文件</small></span>
                <el-button type="danger" plain @click="clearSavedKnowledge">清空</el-button>
              </div>
              <div>
                <span><strong>生成图片记录</strong><small>{{ imageHistory.length }} 张本地图片</small></span>
                <el-button
                  type="danger"
                  plain
                  :disabled="imageHistory.length === 0"
                  @click="clearGeneratedImageHistory"
                >
                  清空
                </el-button>
              </div>
            </div>
          </section>

          <el-button class="report-button" plain @click="resetConversationSettings">
            恢复默认设置
          </el-button>
        </div>
      </el-drawer>

      <el-drawer
        v-model="monitorDrawerOpen"
        class="product-drawer monitor-drawer"
        title="主机监控"
        size="min(920px, 96vw)"
        append-to-body
        destroy-on-close
      >
        <template #header>
          <div class="drawer-heading monitor-heading">
            <div>
              <h2>主机监控</h2>
              <p>只在运行 ShotAI 的电脑上查看连接与运行状态</p>
            </div>
            <div v-if="monitorAuthenticated" class="monitor-heading-actions">
              <span class="monitor-live"><i></i>实时更新</span>
              <el-button text @click="signOutMonitor">
                <el-icon><SwitchButton /></el-icon>
                退出
              </el-button>
            </div>
          </div>
        </template>

        <div v-if="!monitorAuthenticated" class="monitor-login-shell">
          <section class="monitor-login-card" aria-labelledby="monitor-login-title">
            <div class="monitor-login-mark" aria-hidden="true">
              <el-icon><Lock /></el-icon>
            </div>
            <span class="monitor-kicker">HOST CONTROL</span>
            <h3 id="monitor-login-title">管理员验证</h3>
            <p>监控信息不会向局域网中的其他电脑开放。</p>
            <form @submit.prevent="submitMonitorLogin">
              <label>
                <span>用户名</span>
                <el-input
                  v-model="monitorUsername"
                  autocomplete="username"
                  aria-label="管理员用户名"
                >
                  <template #prefix><el-icon><User /></el-icon></template>
                </el-input>
              </label>
              <label>
                <span>密码</span>
                <el-input
                  v-model="monitorPassword"
                  :type="monitorPasswordVisible ? 'text' : 'password'"
                  autocomplete="current-password"
                  aria-label="管理员密码"
                  @keydown.enter="submitMonitorLogin"
                >
                  <template #prefix><el-icon><Lock /></el-icon></template>
                  <template #suffix>
                    <button
                      class="monitor-password-toggle"
                      type="button"
                      :aria-label="monitorPasswordVisible ? '隐藏密码' : '显示密码'"
                      @click="monitorPasswordVisible = !monitorPasswordVisible"
                    >
                      <el-icon><Hide v-if="monitorPasswordVisible" /><View v-else /></el-icon>
                    </button>
                  </template>
                </el-input>
              </label>
              <div v-if="monitorLoginError" class="monitor-login-error" role="alert">
                {{ monitorLoginError }}
              </div>
              <el-button
                class="monitor-login-button"
                type="primary"
                native-type="submit"
                :loading="monitorLoginLoading"
              >
                进入监控平台
              </el-button>
            </form>
          </section>
        </div>

        <div v-else-if="monitorSnapshot" class="monitor-dashboard">
          <section class="monitor-overview">
            <article class="monitor-hero-card">
              <span class="monitor-card-label">当前在线</span>
              <strong>{{ monitorSnapshot.onlineCount }}</strong>
              <small>台设备在最近一分钟内访问</small>
              <div class="monitor-orbit" aria-hidden="true"><i></i><i></i></div>
            </article>
            <article class="monitor-host-card">
              <div>
                <span class="monitor-card-label">运行主机</span>
                <strong>{{ monitorSnapshot.host.name }}</strong>
                <small>
                  已运行 {{ formatMonitorDuration(monitorSnapshot.host.uptimeSeconds) }}
                </small>
              </div>
              <span class="monitor-host-state"><i></i>正常</span>
            </article>
          </section>

          <section class="monitor-metrics" aria-label="主机性能">
            <article class="monitor-metric-card">
              <div class="monitor-metric-heading">
                <span>处理器</span><strong>{{ monitorSnapshot.performance.cpu.usagePercent.toFixed(0) }}%</strong>
              </div>
              <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="monitorChartPoints(monitorCpuHistory)" />
              </svg>
              <small>{{ monitorSnapshot.performance.cpu.cores }} 个运行核心</small>
            </article>
            <article class="monitor-metric-card">
              <div class="monitor-metric-heading">
                <span>内存</span><strong>{{ monitorSnapshot.performance.memory.usagePercent.toFixed(0) }}%</strong>
              </div>
              <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="monitorChartPoints(monitorMemoryHistory)" />
              </svg>
              <small>
                {{ formatMonitorBytes(monitorSnapshot.performance.memory.usedBytes) }} /
                {{ formatMonitorBytes(monitorSnapshot.performance.memory.totalBytes) }}
              </small>
            </article>
            <article class="monitor-metric-card">
              <div class="monitor-metric-heading">
                <span>显卡</span>
                <strong>
                  {{ monitorSnapshot.performance.gpu ? `${monitorSnapshot.performance.gpu.usagePercent}%` : '—' }}
                </strong>
              </div>
              <svg viewBox="0 0 100 44" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="monitorChartPoints(monitorGpuHistory)" />
              </svg>
              <small v-if="monitorSnapshot.performance.gpu">
                {{ monitorSnapshot.performance.gpu.name }} ·
                {{ monitorSnapshot.performance.gpu.temperatureCelsius }}°C
              </small>
              <small v-else>没有读取到 NVIDIA 显卡状态</small>
            </article>
            <article class="monitor-metric-card">
              <div class="monitor-metric-heading">
                <span>磁盘</span>
                <strong>
                  {{ monitorSnapshot.performance.disk ? `${monitorSnapshot.performance.disk.usagePercent.toFixed(0)}%` : '—' }}
                </strong>
              </div>
              <div class="monitor-disk-track" aria-hidden="true">
                <span
                  :style="{ transform: `scaleX(${(monitorSnapshot.performance.disk?.usagePercent || 0) / 100})` }"
                ></span>
              </div>
              <small v-if="monitorSnapshot.performance.disk">
                {{ formatMonitorBytes(monitorSnapshot.performance.disk.usedBytes) }} /
                {{ formatMonitorBytes(monitorSnapshot.performance.disk.totalBytes) }}
              </small>
              <small v-else>暂时无法读取磁盘信息</small>
            </article>
          </section>

          <section class="monitor-clients-card">
            <div class="monitor-section-heading">
              <div>
                <span class="monitor-card-label">连接设备</span>
                <h3>局域网访问记录</h3>
              </div>
              <label class="monitor-privacy-switch">
                <span>隐藏 IP</span>
                <el-switch v-model="monitorHideIps" aria-label="隐藏设备 IP" />
              </label>
            </div>
            <div v-if="monitorSnapshot.clients.length" class="monitor-client-list">
              <article v-for="client in monitorSnapshot.clients" :key="client.ip">
                <span class="monitor-device-mark"><el-icon><Monitor /></el-icon></span>
                <div>
                  <strong>{{ client.host ? '本机工作台' : monitorClientLabel(client.userAgent) }}</strong>
                  <small>{{ maskMonitorIp(client.ip) }}</small>
                </div>
                <span class="monitor-client-time">
                  {{ new Date(client.lastSeen).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }}
                </span>
                <i class="monitor-client-online" aria-label="在线"></i>
              </article>
            </div>
            <div v-else class="monitor-client-empty">暂时没有其他设备访问</div>
          </section>
        </div>

        <div v-else class="monitor-loading" role="status">
          <span></span>
          正在读取主机状态
        </div>
      </el-drawer>

      <el-dialog
        v-model="importDialogOpen"
        class="import-dialog"
        width="min(760px, 94vw)"
        :close-on-click-modal="!importRunning && !validationRunning"
        :close-on-press-escape="!importRunning && !validationRunning"
        :show-close="!importRunning && !validationRunning"
        append-to-body
      >
        <template #header>
          <div class="dialog-heading">
            <div class="dialog-icon"><el-icon><DocumentAdd /></el-icon></div>
            <div>
              <h2>添加模型</h2>
              <p>选择下载好的文件，文件不会发送到网络</p>
            </div>
          </div>
        </template>

        <el-steps :active="importStep" finish-status="success" align-center>
          <el-step title="选择文件" />
          <el-step title="检查文件" />
          <el-step title="安装模型" />
          <el-step title="完成" />
        </el-steps>

        <div class="import-step-content">
          <section v-if="importStep === 0">
            <el-upload
              v-model:file-list="selectedFiles"
              class="model-uploader"
              drag
              action="#"
              accept=".gguf,.safetensors,.sft,.ckpt"
              :auto-upload="false"
              :limit="32"
              multiple
              :on-change="handleFileChange"
              :on-remove="handleFileChange"
            >
              <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
              <div class="el-upload__text">
                将模型文件拖到这里，或 <em>选择文件</em>
              </div>
              <template #tip>
                <div class="el-upload__tip">
                  不需要先选择功能。把同一下载页中的相关文件一次选中，系统会自动识别用途。
                </div>
              </template>
            </el-upload>
            <div
              class="import-detection"
              :class="`is-${importDetection.tone}`"
              aria-live="polite"
            >
              <span class="status-dot" aria-hidden="true"></span>
              <div>
                <strong>{{ importDetection.title }}</strong>
                <small>{{ importDetection.detail }}</small>
              </div>
            </div>
            <div v-if="validationRunning" class="demo-file-option">
              <span>{{ importStatus }}</span>
            </div>
          </section>

          <section v-else-if="importStep === 1" class="validation-step">
            <div class="file-summary">
              <div class="file-type">{{ importMetadata.isImageImport ? '图片' : '主要' }}</div>
              <div>
                <strong>{{ importMetadata.fileName }}</strong>
                <span>
                  {{ importMetadata.size }} ·
                  {{
                    importMetadata.modelFileCount > 1
                      ? `${importMetadata.modelFileCount} 个主要模型分片`
                      : importMetadata.isVisionImport
                      ? '主要模型文件'
                      : importMetadata.isImageImport
                        ? `${importMetadata.fileCount} 个文件 · 自动组合`
                        : '聊天模型文件'
                  }}
                </span>
              </div>
              <el-tag type="success" effect="plain">文件正常</el-tag>
            </div>

            <div
              v-if="importMetadata.isImageImport"
              class="image-import-file-summary"
            >
              <div
                v-for="file in selectedImageImportFiles"
                :key="file.name"
                class="file-summary projector-file-summary"
              >
                <div class="file-type">{{ getImageImportFileRole(file).slice(0, 2) }}</div>
                <div>
                  <strong>{{ file.name }}</strong>
                  <span>{{ getImageImportFileRole(file) }} · {{ formatFileSize(file.size) }}</span>
                </div>
                <el-tag type="success" effect="plain">已经识别</el-tag>
              </div>
            </div>

            <div
              v-if="!importMetadata.isImageImport && importMetadata.modelFileCount > 1"
              class="image-import-file-summary"
            >
              <div
                v-for="file in selectedModelFiles"
                :key="file.name"
                class="file-summary projector-file-summary"
              >
                <div class="file-type">分片</div>
                <div>
                  <strong>{{ file.name }}</strong>
                  <span>主要模型分片 · {{ formatFileSize(file.size) }}</span>
                </div>
                <el-tag type="success" effect="plain">已经识别</el-tag>
              </div>
            </div>

            <div
              v-if="importMetadata.isVisionImport"
              class="file-summary projector-file-summary"
            >
              <div class="file-type">图片</div>
              <div>
                <strong>{{ importMetadata.projectorFileName }}</strong>
                <span>图片识别配套文件 · 将与主要文件一起安装</span>
              </div>
              <el-tag type="success" effect="plain">已经配对</el-tag>
            </div>

            <div class="validation-grid">
              <div>
                <span>{{ importMetadata.isImageImport ? '文件组合' : '主要文件' }}</span>
                <strong>检查通过</strong>
              </div>
              <div>
                <span>{{ importMetadata.isImageImport ? '自动用途' : '图片识别' }}</span>
                <strong>
                  {{
                    importMetadata.isImageImport
                      ? '生成与修改图片'
                      : importMetadata.isVisionImport
                        ? '可以使用'
                        : '没有添加'
                  }}
                </strong>
              </div>
              <div>
                <span>文件总大小</span>
                <strong>{{ importMetadata.size }}</strong>
              </div>
              <div>
                <span>检查结果</span>
                <strong class="success-text">
                  <el-icon><Check /></el-icon>
                  可以安装
                </strong>
              </div>
            </div>

            <el-form v-if="!importMetadata.isImageImport" label-position="top">
              <el-form-item label="显示名称">
                <el-input v-model="importName" maxlength="60" />
              </el-form-item>
              <el-form-item label="主要文件校验码">
                <el-input :model-value="`sha256:${importSha}`" readonly />
              </el-form-item>
              <el-form-item
                v-if="importMetadata.isVisionImport"
                label="图片识别文件校验码"
              >
                <el-input
                  :model-value="`sha256:${importProjectorSha}`"
                  readonly
                />
              </el-form-item>
            </el-form>
          </section>

          <section v-else-if="importStep === 2" class="create-step">
            <div v-if="!importRunning && importProgress === 0" class="ready-import">
              <div class="ready-icon"><el-icon><Cpu /></el-icon></div>
              <h3>准备安装模型</h3>
              <p>
                {{
                  importMetadata.isImageImport
                    ? 'ShotAI 将自动组合这些文件并启动图片服务，同时检查生成与修改功能。'
                    : 'ShotAI 将安装所选文件，并检查模型是否可以正常回答。'
                }}
                {{
                  importMetadata.isVisionImport
                    ? '同时检查图片识别功能。'
                    : ''
                }}
              </p>
              <div class="import-plan">
                <span><el-icon><Check /></el-icon> 不发送到网络</span>
                <span><el-icon><Check /></el-icon> 只在这台电脑处理</span>
                <span><el-icon><Check /></el-icon> 重复文件自动复用</span>
              </div>
            </div>
            <div v-else class="progress-state">
              <div class="progress-value">{{ importProgress }}%</div>
              <h3>{{ importProgress < 100 ? '正在导入模型' : '正在完成检查' }}</h3>
              <p>
                {{ importStatus }}
              </p>
              <el-progress
                :percentage="importProgress"
                :stroke-width="8"
                :show-text="false"
              />
            </div>
          </section>

          <section v-else class="complete-step">
            <div class="complete-icon"><el-icon><CircleCheck /></el-icon></div>
            <h3>模型导入成功</h3>
            <p>
              {{ importName }} 已检查完成，现在可以{{ importMetadata.isImageImport ? '生成或修改图片' : '开始对话' }}。
            </p>
            <div class="complete-model">
              <span>AI</span>
              <div>
                <strong>{{ importName }}</strong>
                <small>
                  {{ importMetadata.size }} · {{ importCapabilityLabel }}
                </small>
              </div>
              <el-tag type="success" effect="plain">可用</el-tag>
            </div>
          </section>
        </div>

        <template #footer>
          <div class="dialog-footer">
            <el-button
              v-if="importStep > 0 && importStep < 3 && !importRunning"
              @click="importStep -= 1"
            >
              上一步
            </el-button>
            <span class="footer-spacer"></span>
            <el-button
              v-if="importStep < 3 && !importRunning && !validationRunning"
              @click="importDialogOpen = false"
            >
              取消
            </el-button>
            <el-button
              v-if="importStep < 2"
              type="primary"
              :loading="validationRunning"
              @click="nextImportStep"
            >
              {{ validationRunning ? '正在校验' : '下一步' }}
            </el-button>
            <el-button
              v-else-if="importStep === 2 && !importRunning"
              type="primary"
              @click="startImport"
            >
              开始导入
            </el-button>
            <el-button
              v-else-if="importStep === 3"
              type="primary"
              @click="finishImport"
            >
              {{ importMetadata.isImageImport ? '完成' : '使用此模型' }}
            </el-button>
          </div>
        </template>
      </el-dialog>
    </div>
  </el-config-provider>
</template>
