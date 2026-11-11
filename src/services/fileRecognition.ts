// Office Open XML files are ZIP containers. Browser MIME types are only hints.
const officeMime = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
}
const recognized = new WeakMap<File, File>()
export const DOCUMENT_ACCEPT = '.txt,.md,.markdown,.pdf,.doc,.docx,.xls,.xlsx,.xlsm,.csv,.zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export async function recognizeDocumentFile(file: File): Promise<File> {
  const cached = recognized.get(file)
  if (cached) return cached
  if (!file.size) throw new Error('这个文件是空的，无法添加')
  if (file.size > 20 * 1024 * 1024) throw new Error('单个文件不能超过 20 MB')
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  const zip = header[0] === 0x50 && header[1] === 0x4b
  const compound = header[0] === 0xd0 && header[1] === 0xcf && header[2] === 0x11 && header[3] === 0xe0
  const openXml = ['docx', 'xlsx', 'xlsm'].includes(extension)
  if (compound && openXml) throw new Error('文件可能已加密。请在 Office 或 WPS 中取消密码保护后重新上传。')
  if (!zip) {
    if (openXml || extension === 'zip') throw new Error('文件结构与扩展名不符或文件已损坏，请重新保存后上传。')
    if (extension === 'pdf' && !new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer()).includes('%PDF-')) {
      throw new Error('文件不是有效的 PDF，请重新导出后上传。')
    }
    recognized.set(file, file)
    return file
  }
  let result: File
  try {
    const { default: JSZip } = await import('jszip')
    const archive = await JSZip.loadAsync(await file.arrayBuffer())
    const types = archive.file('[Content_Types].xml')
    // Inspect entries without extracting the whole archive.
    const entries = Object.values(archive.files)
    const expandedBytes = entries.reduce((total, entry) => total +
      Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0), 0)
    if (entries.length > 10_000 || expandedBytes > 200 * 1024 * 1024) {
      throw new Error('文档展开后过大，请拆分后上传。')
    }
    if (!types || types.dir) throw new Error('这是普通 ZIP 压缩包，请解压后上传其中的文档。')
    const typeXml = await types.async('string')
    let kind: keyof typeof officeMime
    if (archive.file('word/document.xml') && /wordprocessingml\.document\.main\+xml/.test(typeXml)) kind = 'docx'
    else if (archive.file('xl/workbook.xml') && /spreadsheetml\.sheet\.main\+xml/.test(typeXml)) kind = 'xlsx'
    else if (archive.file('xl/workbook.xml') && /ms-excel\.sheet\.macroEnabled\.main\+xml/.test(typeXml)) kind = 'xlsm'
    else throw new Error('压缩包中未找到支持的 Word 或 Excel 文档结构。')
    const name = extension === kind ? file.name
      : `${file.name.replace(/\.[^.]+$/, '') || 'document'}.${kind}`
    result = new File([file], name, { type: officeMime[kind], lastModified: file.lastModified })
  } catch (error) {
    if (error instanceof Error && /[\u3400-\u9fff]/.test(error.message)) throw error
    if (error instanceof Error && /encrypt|password/i.test(error.message)) {
      throw new Error('文件可能已加密。请在 Office 或 WPS 中取消密码保护后重新上传。')
    }
    throw new Error('文档压缩结构已损坏，无法读取。请重新保存或重新复制文件后上传。')
  }
  recognized.set(file, result)
  recognized.set(result, result)
  return result
}
