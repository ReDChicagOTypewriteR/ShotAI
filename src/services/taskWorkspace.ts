import { extractKnowledgeText, keywordSimilarity } from './knowledge'
import type { CellValue, TableData } from './tabularTools'

export interface TaskSource { id: string; name: string; text?: string; truncated?: boolean; load: () => Promise<File | undefined> }
export interface TaskEvidence { id: string; sourceId: string; name: string; location: string; excerpt: string }
export interface DocumentSection { index: number; location: string; text: string }
type Workbook = Awaited<ReturnType<typeof import('xlsx')['read']>>

export function splitDocument(text: string): DocumentSection[] {
  const sections: DocumentSection[] = []
  const pages = text.match(/第 \d+ 页\n[\s\S]*?(?=第 \d+ 页\n|$)/g) || [text]
  for (const page of pages) {
    const pageName = page.match(/^第 \d+ 页/)?.[0] || ''
    let start = 0
    while (start < page.length) {
      const ideal = Math.min(start + 5000, page.length)
      const boundary = page.lastIndexOf('\n', ideal)
      const end = ideal === page.length || boundary < start + 2500 ? ideal : boundary + 1
      const content = page.slice(start, end).trim()
      if (content) sections.push({ index: sections.length + 1, location: `${pageName ? pageName + ' · ' : ''}片段 ${sections.length + 1}`, text: content })
      start = end
    }
  }
  return sections
}

export class TaskWorkspace {
  readonly evidence: TaskEvidence[] = []
  readonly tables = new Map<string, TableData>()
  readonly reads = new Map<string, Set<number>>()
  private documents = new Map<string, DocumentSection[]>()
  private workbooks = new Map<string, Workbook>()
  private tableNumber = 0
  private evidenceText = new Map<string, string>()
  constructor(readonly sources: TaskSource[], readonly signal: AbortSignal) {}
  check() { this.signal.throwIfAborted() }
  source(id: string) {
    const source = this.sources.find(source => source.id === id)
    if (!source) throw new Error(`来源不存在：${id}`)
    return source
  }
  async document(id: string) {
    this.check()
    if (!this.documents.has(id)) {
      const source = this.source(id), file = await source.load()
      this.check()
      if (!file && source.truncated) throw new Error('原文件已不存在，只有不完整预览，请重新上传原文件。')
      const text = source.text && source.truncated === false ? source.text : file ? await extractKnowledgeText(file) : source.text || ''
      this.check()
      if (!text.trim()) throw new Error('来源没有可读取的文字')
      this.documents.set(id, splitDocument(text))
    }
    return this.documents.get(id)!
  }
  cite(id: string, location: string, excerpt: string) {
    const source = this.source(id)
    const old = this.evidence.find(entry => entry.sourceId === id && entry.location === location)
    if (old) return old.id
    const evidence = { id: `依据${this.evidence.length + 1}`, sourceId: id, name: source.name, location, excerpt: excerpt.slice(0, 500) }
    this.evidence.push(evidence)
    this.evidenceText.set(evidence.id, excerpt)
    return evidence.id
  }
  verifiedText(ids: string[]) { return ids.map(id => this.evidenceText.get(id) || '').join('\n') }
  async readDocument(id: string, start = 1, count = 1) {
    const sections = await this.document(id)
    if (!Number.isInteger(start) || start < 1 || start > sections.length || !Number.isInteger(count) || count < 1 || count > 2) throw new Error('片段范围无效，每次读取 1–2 个片段。')
    if (!this.reads.has(id)) this.reads.set(id, new Set())
    const selected = sections.slice(start - 1, start - 1 + count)
    return { totalSections: sections.length, readSections: selected.map(section => {
      this.reads.get(id)!.add(section.index)
      return { ...section, evidenceId: this.cite(id, section.location, section.text) }
    }), coveredSections: this.reads.get(id)!.size }
  }
  async searchDocument(id: string, query: string) {
    if (typeof query !== 'string' || !query.trim()) throw new Error('检索词不能为空')
    const sections = await this.document(id)
    const matches = sections.map(section => ({ section, score: keywordSimilarity(query, section.text) })).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score).slice(0, 2)
    const results = []
    for (const { section } of matches) results.push((await this.readDocument(id, section.index)).readSections[0])
    return { totalSections: sections.length, results, notice: '这里只是相关片段；全文总结请使用 summarize_document 覆盖全部片段。' }
  }
  async workbook(id: string) {
    this.check()
    if (!this.workbooks.has(id)) {
      const source = this.source(id), file = await source.load()
      if (!file || !/\.(xlsx?|xlsm|csv)$/i.test(file.name)) throw new Error('请指定可用的 Excel 或 CSV 原文件')
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, cellFormula: true, cellNF: true, sheetStubs: true })
      this.check()
      for (const name of workbook.SheetNames) {
        const range = XLSX.utils.decode_range(workbook.Sheets[name]['!ref'] || 'A1')
        if ((range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1) > 2_000_000) throw new Error('工作表超过本次安全处理范围，请拆分后处理。')
      }
      this.workbooks.set(id, workbook)
    }
    return this.workbooks.get(id)!
  }
  async catalog() {
    const entries = []
    for (const source of this.sources) {
      this.check()
      if (/\.(xlsx?|xlsm|csv)$/i.test(source.name) && await source.load()) {
        const workbook = await this.workbook(source.id)
        entries.push({ id: source.id, name: source.name, sheets: workbook.SheetNames.map(name => ({ name, range: workbook.Sheets[name]['!ref'] || 'A1' })) })
      } else {
        let sections: DocumentSection[]
        try { sections = await this.document(source.id) }
        catch (error) {
          this.check()
          entries.push({ id: source.id, name: source.name, unavailable: true, reason: error instanceof Error ? error.message : String(error) })
          continue
        }
        entries.push({ id: source.id, name: source.name, totalSections: sections.length,
          ...(/\.(xlsx?|xlsm|csv)$/i.test(source.name) ? { textOnly: true, notice: '只有文字索引，精确计算需要重新上传原始工作簿。' } : {}),
          sections: sections.slice(0, 50).map(section => ({ index: section.index, location: section.location, heading: section.text.split('\n')[0].slice(0, 80) })),
          indexTruncated: sections.length > 50 })
      }
    }
    return entries
  }
  keepTable(table: TableData) {
    this.check()
    if (table.rows.length > 100_000 || table.columns.length > 256) throw new Error('结果超过单次处理上限（10 万行或 256 列），请缩小范围。')
    const cells = [...this.tables.values()].reduce((total, dataset) => total + dataset.rows.length * dataset.columns.length, 0) + table.rows.length * table.columns.length
    if (cells > 2_000_000) throw new Error('本次保留的数据集超过 200 万个单元格，请缩小范围或拆分任务。')
    const id = `data${++this.tableNumber}`
    this.tables.set(id, table)
    return this.tablePreview(id)
  }
  table(id: string) {
    const table = this.tables.get(id)
    if (!table) throw new Error(`数据集不存在：${id}，请先读取工作表或运行计算。`)
    return table
  }
  tablePreview(id: string) {
    const table = this.table(id)
    return { dataId: id, columns: table.columns, rowCount: table.rows.length, rows: table.rows.slice(0, 20).map(row => row.map(value => typeof value === 'string' && value.length > 240 ? value.slice(0, 240) + '[预览省略]' : value)),
      previewOnly: table.rows.length > 20, evidenceIds: table.origins, warnings: table.warnings }
  }
  async readSheet(id: string, sheetName: string, options: { headerRow?: number; startRow?: number; endRow?: number } = {}) {
    const workbook = await this.workbook(id), XLSX = await import('xlsx')
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) throw new Error(`工作表不存在：${sheetName}`)
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
    const header = options.headerRow ?? range.s.r + 1
    const start = options.startRow ?? header + 1, end = options.endRow ?? range.e.r + 1
    if (![header, start, end].every(Number.isInteger) || header < range.s.r + 1 || start <= header || end > range.e.r + 1 || start > end + 1) throw new Error('行号范围无效，必须使用工作表的实际行号。')
    const columns: string[] = [], rows: CellValue[][] = [], warnings: string[] = []
    let formulaCount = 0
    const valueAt = (row: number, column: number): CellValue => {
      const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column })]
      if (cell?.t === 'e') throw new Error('表格含错误单元格，请先修正公式错误后再计算。')
      if (cell?.f) {
        formulaCount++
        if (cell.v === undefined) throw new Error('表格含未计算的公式，请先在 Excel 或 WPS 中重新计算并保存。')
      }
      if (cell?.v == null) return null
      if (typeof cell.v === 'number' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) return cell.w || XLSX.SSF.format(cell.z, cell.v)
      if (!['string', 'number', 'boolean'].includes(typeof cell.v)) throw new Error('工作表含不支持的单元格类型')
      return cell.v as CellValue
    }
    for (let column = range.s.c; column <= range.e.c; column++) {
      const name = String(valueAt(header, column) ?? `列${XLSX.utils.encode_col(column)}`).trim()
      if (!name || columns.includes(name)) throw new Error('表头为空或重复，请指定正确表头行，或先整理表头。')
      columns.push(name)
    }
    for (let row = start; row <= end; row++) {
      if (row % 1000 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); this.check() }
      const values = columns.map((_, index) => valueAt(row, index + range.s.c))
      if (values.some(value => value !== null && value !== '')) rows.push(values)
    }
    if (formulaCount) warnings.push('本次使用文件中保存的公式缓存值，未重新计算公式。')
    const location = start === header + 1 ? `${sheetName}!${XLSX.utils.encode_range({ s: { r: header - 1, c: range.s.c }, e: { r: Math.max(header - 1, end - 1), c: range.e.c } })}`
      : `${sheetName}!表头第 ${header} 行，数据第 ${start}–${end} 行，列 ${XLSX.utils.encode_col(range.s.c)}:${XLSX.utils.encode_col(range.e.c)}`
    const evidenceId = this.cite(id, location, JSON.stringify({ columns, firstRows: rows.slice(0, 3), rowCount: rows.length }))
    return this.keepTable({ columns, rows, origins: [evidenceId], warnings })
  }
  coverage() {
    return [...this.documents].map(([id, sections]) => ({ sourceId: id, name: this.source(id).name, read: this.reads.get(id)?.size || 0, total: sections.length }))
  }
}
