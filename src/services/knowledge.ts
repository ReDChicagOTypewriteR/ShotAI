import mammoth from 'mammoth'

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

const SUPPORTED_EXTENSIONS = ['txt', 'md', 'markdown', 'pdf', 'doc', 'docx']
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
    throw new Error('只支持常见文本、PDF 和 Word 文件')
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
  await task.destroy()
  return pages.join('\n\n')
}

async function extractDocxText(file: File) {
  const result = await mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  })
  return result.value
}

export async function extractKnowledgeText(file: File) {
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
