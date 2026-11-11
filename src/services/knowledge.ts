import { recognizeDocumentFile } from './fileRecognition'

export type KnowledgeDocumentStatus = 'ready' | 'indexing' | 'error'

export interface KnowledgeChunk {
  id: string
  documentId: string
  documentName: string
  index: number
  content: string
  vector?: number[]
}

export interface KnowledgeDocument {
  id: string
  name: string
  type: string
  size: number
  createdAt: number
  characterCount: number
  chunkCount: number
  embeddingModel: string
  status: KnowledgeDocumentStatus
  error?: string
}

export interface KnowledgeBase {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  documents: KnowledgeDocument[]
  chunks: KnowledgeChunk[]
}

export interface KnowledgeState {
  version: 1
  selectedBaseId: string
  embeddingModelId: string
  bases: KnowledgeBase[]
}

export interface RetrievedKnowledge {
  chunk: KnowledgeChunk
  score: number
  mode: 'vector' | 'keyword'
}

const SUPPORTED_EXTENSIONS = [
  'txt',
  'md',
  'markdown',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'xlsm',
  'csv',
]
const MAX_FILE_BYTES = 20 * 1024 * 1024
const MAX_CHUNKS_PER_DOCUMENT = 2000

export function createKnowledgeBase(name = '默认资料夹'): KnowledgeBase {
  const timestamp = Date.now()
  return {
    id: `kb-${timestamp}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    description: '保存在这台电脑上的资料',
    createdAt: timestamp,
    updatedAt: timestamp,
    documents: [],
    chunks: [],
  }
}

export function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

export function validateKnowledgeFile(file: File) {
  const extension = getFileExtension(file.name)
  if (!SUPPORTED_EXTENSIONS.includes(extension)) {
    throw new Error('只支持常见文本、PDF、Word 和 Excel 文件')
  }
  if (!file.size) throw new Error('这个文件是空的，无法添加')
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('单个文件不能超过 20 MB')
  }
}

async function extractPdfText(file: File) {
  // PDF.js is considerably newer than the rest of the chat application.
  // Load it only when a PDF is selected so older intranet browsers can still
  // open ShotAI and use text/image chat without parsing the PDF bundle.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    useWorkerFetch: false,
  })
  try {
    const document = await task.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const textContent = await page.getTextContent()
      const text = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .trim()
      if (text) pages.push(`第 ${pageNumber} 页\n${text}`)
    }
    return pages.join('\n\n')
  } catch (error) {
    console.warn('[ShotAI][PDF_READ_FAILED]', error)
    if (error instanceof Error && error.name === 'PasswordException') {
      throw new Error('文件可能已加密。请在 Office 或 WPS 中取消密码保护后重新上传。')
    }
    if (error instanceof Error && /worker|dynamically imported module/i.test(error.message)) {
      throw new Error('PDF 读取组件未能启动，请刷新页面后重试，或检查离线安装文件是否完整。')
    }
    throw new Error('PDF 内容无法读取，文件可能已损坏。请重新导出后上传。')
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

async function extractDocxText(file: File) {
  const { default: mammoth } = await import('mammoth')
  try {
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
    return result.value
  } catch {
    throw new Error('Word 文档内容无法解析，请用 Office 或 WPS 重新保存为 DOCX 后上传。')
  }
}

async function extractSpreadsheetText(file: File) {
  // Spreadsheet parsing is loaded only when needed so normal chat stays fast
  // on older intranet browsers.
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
    cellFormula: true,
  })
  const sections: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean>>(
      sheet,
      {
        header: 1,
        raw: false,
        defval: '',
        blankrows: false,
      },
    )
    const lines = rows
      .map((row) => {
        const cells = [...row]
        while (cells.length && String(cells[cells.length - 1]).trim() === '') {
          cells.pop()
        }
        return cells.map((cell) => String(cell).trim()).join('\t').trim()
      })
      .filter(Boolean)
    if (lines.length) {
      sections.push(`工作表：${sheetName}\n${lines.join('\n')}`)
    }
  }

  return sections.join('\n\n')
}

export async function extractKnowledgeText(file: File) {
  file = await recognizeDocumentFile(file)
  validateKnowledgeFile(file)
  const extension = getFileExtension(file.name)
  let text = ''

  if (extension === 'doc') {
    throw new Error(
      '这是旧版 Word 文件。请用 Word 或 WPS 打开，选择“另存为”，保存成 .docx 后重新添加。',
    )
  } else if (extension === 'pdf') {
    text = await extractPdfText(file)
  } else if (extension === 'docx') {
    text = await extractDocxText(file)
  } else if (['xls', 'xlsx', 'xlsm', 'csv'].includes(extension)) {
    text = await extractSpreadsheetText(file)
  } else {
    text = await file.text()
  }

  const normalized = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    throw new Error('未从文件中识别到可检索文本')
  }
  return normalized
}

function findChunkBoundary(text: string, idealEnd: number, minimumEnd: number) {
  const candidates = ['\n\n', '\n', '。', '！', '？', '. ', '; ', '；']
  for (const marker of candidates) {
    const position = text.lastIndexOf(marker, idealEnd)
    if (position >= minimumEnd) return position + marker.length
  }
  return idealEnd
}

export function chunkKnowledgeText(
  documentId: string,
  documentName: string,
  text: string,
  targetSize = 900,
  overlap = 150,
) {
  const chunks: KnowledgeChunk[] = []
  let start = 0

  while (start < text.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
    const idealEnd = Math.min(text.length, start + targetSize)
    const end =
      idealEnd === text.length
        ? idealEnd
        : findChunkBoundary(text, idealEnd, start + Math.floor(targetSize * 0.55))
    const content = text.slice(start, end).trim()

    if (content) {
      chunks.push({
        id: `${documentId}-chunk-${chunks.length + 1}`,
        documentId,
        documentName,
        index: chunks.length,
        content,
      })
    }
    if (end >= text.length) break
    start = Math.max(start + 1, end - overlap)
  }

  return chunks
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] ** 2
    rightMagnitude += right[index] ** 2
  }
  if (!leftMagnitude || !rightMagnitude) return 0
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

function tokenize(text: string) {
  const normalized = text.toLowerCase()
  const words = normalized.match(/[a-z0-9_]{2,}/g) ?? []
  const chinese = normalized.match(/[\u3400-\u9fff]/g) ?? []
  const bigrams = chinese.slice(0, -1).map((character, index) => {
    return `${character}${chinese[index + 1]}`
  })
  return new Set([...words, ...chinese, ...bigrams])
}

export function keywordSimilarity(query: string, content: string) {
  const queryTokens = tokenize(query)
  const contentTokens = tokenize(content)
  if (!queryTokens.size || !contentTokens.size) return 0

  let matches = 0
  queryTokens.forEach((token) => {
    if (contentTokens.has(token)) matches += token.length > 1 ? 2 : 1
  })
  return matches / Math.max(1, queryTokens.size * 2)
}

export function retrieveKnowledge(
  query: string,
  bases: KnowledgeBase[],
  queryVector?: number[],
  limit = 5,
): RetrievedKnowledge[] {
  return bases
    .flatMap((base) => base.chunks)
    .map((chunk) => {
      const hasVector =
        Boolean(queryVector?.length) &&
        Boolean(chunk.vector?.length) &&
        queryVector?.length === chunk.vector?.length
      return {
        chunk,
        score: hasVector
          ? cosineSimilarity(queryVector!, chunk.vector!)
          : keywordSimilarity(query, chunk.content),
        mode: hasVector ? ('vector' as const) : ('keyword' as const),
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
