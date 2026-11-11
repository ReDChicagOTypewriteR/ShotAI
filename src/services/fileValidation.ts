import type { DocumentBlock, DocumentSkillResult } from './documentSkill'
import { extractKnowledgeText } from './knowledge'
import type { ExcelSkillPlan, ExcelSkillResult } from './excelSkill'
import { columnIndex } from './tabularTools'
import type { TaskWorkspace } from './taskWorkspace'

export interface CheckedFile extends DocumentSkillResult { checks: string[]; warnings: string[]; evidenceIds: string[]; text?: string }
export function resolveDataText(text: string, workspace: TaskWorkspace) {
  const replaced = text.replace(/\{\{(data\d+):(\d+):([^{}]+)\}\}/g, (_, id: string, row: string, column: string) => {
    const table = workspace.table(id), index = columnIndex(table, column)
    if (!table.rows[Number(row)]) throw new Error(`数据引用行不存在：${id}:${row}`)
    const value = table.rows[Number(row)][index]
    return value === null ? '无数据' : String(value)
  })
  if (/\{\{[^}]*\}\}/.test(replaced)) throw new Error('存在无法识别的数据引用，请使用 {{data1:0:列名}} 格式。')
  return replaced
}
export function validateClaims(claims: unknown, workspace: TaskWorkspace) {
  if (!claims) return
  for (const claim of claims as Array<{ dataId: string; row: number; column: string; value: unknown }>) {
    const table = workspace.table(claim.dataId), index = columnIndex(table, claim.column)
    if (!table.rows[claim.row] || table.rows[claim.row][index] !== claim.value) throw new Error(`报告数字与计算结果不一致：${claim.dataId} 第 ${claim.row + 1} 行 ${claim.column}`)
  }
}
export async function validateDocumentFile(result: DocumentSkillResult, blocks: DocumentBlock[], kind: 'word' | 'pdf', headings: string[] = []) {
  if (!result.blob.size) throw new Error('生成文件为空')
  const text = blocks.map(block => block.text).join('\n')
  for (const heading of headings) if (!blocks.some(block => ['heading', 'title'].includes(block.type) && block.text === heading)) throw new Error(`缺少要求的章节：${heading}`)
  if (kind === 'word') {
    const { default: mammoth } = await import('mammoth')
    const actual = (await mammoth.extractRawText({ arrayBuffer: await result.blob.arrayBuffer() })).value
    const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
    if (normalize(actual) !== normalize(text)) throw new Error('Word 文件回读内容与生成计划不一致')
    return ['文件可读取', '文档内容回读一致', ...(headings.length ? ['要求章节已检查'] : [])]
  }
  const { PDFDocument } = await import('pdf-lib')
  if (!(await PDFDocument.load(await result.blob.arrayBuffer())).getPageCount() || !text.trim()) throw new Error('PDF 文件结构或内容为空')
  return ['PDF 页面结构可读取', '生成计划非空', ...(headings.length ? ['要求章节已检查'] : [])]
}
export async function validateWordChanges(result: DocumentSkillResult, source: File, replacements: Array<{ find: string; replace: string }>) {
  let expected = await extractKnowledgeText(source)
  for (const replacement of replacements) {
    if (expected.split(replacement.find).length !== 2) throw new Error('原文中的修改目标不是唯一匹配')
    expected = expected.replace(replacement.find, replacement.replace)
  }
  const actual = await extractKnowledgeText(new File([result.blob], result.fileName, { type: result.mimeType }))
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
  if (normalize(expected) !== normalize(actual)) throw new Error('Word 修改结果与预期不一致')
  return ['修改目标唯一定位', '非目标正文内容回读一致']
}
export async function validateExcelFile(result: ExcelSkillResult, plan: ExcelSkillPlan, source?: File) {
  const XLSX = await import('xlsx')
  const actual = XLSX.read(await result.blob.arrayBuffer(), { type: 'array', cellFormula: true })
  if (!actual.SheetNames.length) throw new Error('生成工作簿没有工作表')
  if (plan.mode === 'create') {
    for (const sheetPlan of plan.sheets || []) {
      const sheet = actual.Sheets[sheetPlan.name]
      if (!sheet) throw new Error(`结果缺少工作表：${sheetPlan.name}`)
      sheetPlan.rows.forEach((row, r) => row.forEach((value, c) => {
        if ((sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? null) !== value) throw new Error(`结果单元格与计划不一致：${sheetPlan.name}!${XLSX.utils.encode_cell({ r, c })}`)
      }))
    }
  } else if (source) {
    // Build an independent expected cell map, then compare every value/formula.
    const original = XLSX.read(await source.arrayBuffer(), { type: 'array', cellFormula: true })
    const expected = new Map<string, Map<string, [unknown, string | null]>>()
    const lastRows = new Map<string, number>()
    for (const name of original.SheetNames) {
      expected.set(name, new Map(Object.entries(original.Sheets[name]).filter(([address, cell]) => !address.startsWith('!') && (cell.v != null || cell.f)).map(([address, cell]) => [address, [cell.f ? null : cell.v, cell.f || null]])))
      lastRows.set(name, XLSX.utils.decode_range(original.Sheets[name]['!ref'] || 'A1').e.r)
    }
    const writeRows = (name: string, start: { r: number; c: number }, rows: unknown[][]) => {
      const sheet = expected.get(name)
      if (!sheet) throw new Error('修改计划引用了不存在的工作表')
      rows.forEach((row, r) => row.forEach((value, c) => {
        const address = XLSX.utils.encode_cell({ r: start.r + r, c: start.c + c })
        if (value == null) sheet.delete(address)
        else sheet.set(address, [value, null])
      }))
      lastRows.set(name, Math.max(lastRows.get(name) ?? 0, start.r + rows.length - 1))
    }
    for (const op of plan.operations || []) {
      if (op.type === 'set_cell') writeRows(op.sheet, XLSX.utils.decode_cell(op.cell), [[op.value]])
      else if (op.type === 'set_formula') {
        expected.get(op.sheet)!.set(op.cell.toUpperCase(), [null, op.formula.replace(/^=/, '').trim()])
        lastRows.set(op.sheet, Math.max(lastRows.get(op.sheet) || 0, XLSX.utils.decode_cell(op.cell).r))
      } else if (op.type === 'set_range') writeRows(op.sheet, XLSX.utils.decode_cell(op.startCell), op.values)
      else if (op.type === 'append_rows') writeRows(op.sheet, { r: (lastRows.get(op.sheet) || 0) + 1, c: 0 }, op.rows)
      else if (op.type === 'add_sheet') { expected.set(op.sheet, new Map()); writeRows(op.sheet, { r: 0, c: 0 }, op.rows) }
      else if (op.type === 'delete_sheet') { expected.delete(op.sheet); lastRows.delete(op.sheet) }
      else if (op.type === 'rename_sheet') {
        expected.set(op.newName, expected.get(op.sheet)!); expected.delete(op.sheet)
        lastRows.set(op.newName, lastRows.get(op.sheet) || 0); lastRows.delete(op.sheet)
      }
    }
    if (expected.size !== actual.SheetNames.length) throw new Error('结果工作表数量与计划不符')
    for (const [name, cells] of expected) {
      const sheet = actual.Sheets[name]
      if (!sheet) throw new Error(`结果工作表缺失：${name}`)
      for (const address of new Set([...cells.keys(), ...Object.keys(sheet).filter(address => !address.startsWith('!'))])) {
        const cell = sheet[address], actualValue = [cell?.f ? null : cell?.v ?? null, cell?.f || null]
        if (JSON.stringify(cells.get(address) || [null, null]) !== JSON.stringify(actualValue)) throw new Error(`结果数据或非目标单元格与计划不一致：${name}!${address}`)
      }
    }
  }
  return ['工作簿可读取', plan.mode === 'create' ? '生成数据回读一致' : '目标修改及非目标数据已检查']
}

export async function replaceWordText(file: File, replacements: Array<{ find: string; replace: string }>) {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('Word 文件缺少正文')
  const xml = new DOMParser().parseFromString(await entry.async('string'), 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('Word 正文结构损坏')
  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const paragraphs = Array.from(xml.getElementsByTagNameNS(ns, 'p'))
  for (const replacement of replacements) {
    if (!replacement.find || replacement.find === replacement.replace) throw new Error('局部修改内容无效')
    const matches: Array<{ nodes: Element[]; offset: number }> = []
    for (const paragraph of paragraphs) {
      const nodes = Array.from(paragraph.getElementsByTagNameNS(ns, 't')), text = nodes.map(node => node.textContent || '').join('')
      let position = text.indexOf(replacement.find)
      while (position >= 0) { matches.push({ nodes, offset: position }); position = text.indexOf(replacement.find, position + replacement.find.length) }
    }
    if (matches.length !== 1) throw new Error(`无法唯一定位原文“${replacement.find.slice(0, 40)}”，找到 ${matches.length} 处，原文件未修改。`)
    const { nodes, offset } = matches[0]
    let cursor = 0, inserted = false
    for (const node of nodes) {
      const text = node.textContent || '', from = cursor, to = cursor + text.length
      cursor = to
      if (to <= offset || from >= offset + replacement.find.length) continue
      node.textContent = text.slice(0, Math.max(0, offset - from)) + (inserted ? '' : replacement.replace) + text.slice(Math.min(text.length, offset + replacement.find.length - from))
      node.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
      inserted = true
    }
  }
  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const reopened = await JSZip.loadAsync(await blob.arrayBuffer())
  for (const [name, original] of Object.entries(zip.files)) {
    if (original.dir || name === 'word/document.xml') continue
    const a = await original.async('uint8array'), b = await reopened.file(name)!.async('uint8array')
    if (a.length !== b.length || a.some((value, index) => value !== b[index])) throw new Error('非目标 Word 内容发生变化')
  }
  return blob
}
