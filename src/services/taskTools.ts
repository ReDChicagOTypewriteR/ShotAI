export type Schema = Record<string, unknown>

// Repetition bounds can expand into enormous runtime grammars. Execution still
// validates the original schema, including every length and collection limit.
export function runtimeSchema(schema: Schema): Schema {
  const result: Schema = {}
  for (const [key, value] of Object.entries(schema)) {
    if (['minLength', 'maxLength', 'minItems', 'maxItems'].includes(key)) continue
    if (key === 'properties' && value && typeof value === 'object') {
      result[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, runtimeSchema(child as Schema)]))
    } else if (['items', 'additionalProperties'].includes(key) && value && typeof value === 'object') {
      result[key] = runtimeSchema(value as Schema)
    } else if (['oneOf', 'anyOf', 'allOf'].includes(key) && Array.isArray(value)) {
      result[key] = value.map(child => runtimeSchema(child as Schema))
    } else result[key] = value
  }
  return result
}
const string = { type: 'string', minLength: 1, maxLength: 2000 }
const id = { type: 'string', minLength: 1, maxLength: 200 }
const number = { type: 'integer', minimum: 1 }
const strings = { type: 'array', items: string, maxItems: 64 }
export const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({ type: 'object', properties, required, additionalProperties: false })
const cell = { type: ['string', 'number', 'boolean', 'null'] }
const rows = { type: 'array', maxItems: 100000, items: { type: 'array', maxItems: 256, items: cell } }
export const excelOperationSchema: Schema = { oneOf: [
  object({ type: { const: 'set_cell' }, sheet: string, cell: string, value: cell }),
  object({ type: { const: 'set_formula' }, sheet: string, cell: string, formula: string }),
  object({ type: { const: 'set_range' }, sheet: string, startCell: string, values: rows }),
  object({ type: { const: 'append_rows' }, sheet: string, rows }),
  object({ type: { const: 'add_sheet' }, sheet: string, rows }),
  object({ type: { const: 'rename_sheet' }, sheet: string, newName: string }),
  object({ type: { const: 'delete_sheet' }, sheet: string }),
] }
const block = object({ type: { enum: ['title', 'heading', 'paragraph', 'bullet'] }, text: { type: 'string', maxLength: 16000 }, level: { enum: [1, 2, 3] } }, ['type', 'text'])
export function officeFilePlanSchema(kind: 'excel' | 'word' | 'pdf', mode: 'create' | 'edit'): Schema {
  const common = { mode: { const: mode }, fileName: string, summary: { type: 'string' } }
  if (kind === 'excel') return mode === 'edit'
    ? object({ ...common, operations: { type: 'array', minItems: 1, maxItems: 200, items: excelOperationSchema } }, ['mode', 'operations'])
    // The model's grammar only needs the shape. The Excel plan parser enforces workbook size limits.
    : object({
        ...common,
        sheets: { type: 'array', items: object({
          name: { type: 'string' },
          rows: { type: 'array', items: { type: 'array', items: cell } },
        }) },
      }, ['mode', 'sheets'])
  if (kind === 'word' && mode === 'edit') return object({ ...common, replacements: { type: 'array', minItems: 1, maxItems: 100, items: object({ find: string, replace: { type: 'string', maxLength: 16000 } }) } }, ['mode', 'replacements'])
  return object({ ...common, blocks: { type: 'array', minItems: 1, maxItems: 200, items: block } }, ['mode', 'blocks'])
}
const tool = (name: string, description: string, parameters: Schema) => ({ type: 'function' as const, function: { name, description, parameters } })
export const taskTools = [
  tool('create_table', 'Create a small table from user-provided/example data, or extract literal values from read text with evidence. Do NOT use for copying spreadsheet previews or doing arithmetic; read_sheet and calculation tools handle those.', object({ columns: { ...strings, minItems: 1 }, rows: { ...rows, maxItems: 10000 }, evidenceIds: { type: 'array', items: id, maxItems: 100 } }, ['columns', 'rows'])),
  tool('list_sources', 'List document sections and sheet names/ranges. This does not read their full contents.', object({})),
  tool('read_document', 'Read 1–2 document sections with exact evidence IDs. Indices start at 1.', object({ sourceId: id, start: number, count: { type: 'integer', minimum: 1, maximum: 2 } }, ['sourceId'])),
  tool('search_document', 'Find and read relevant document sections. Not a full-document summary.', object({ sourceId: id, query: string })),
  tool('summarize_document', 'Read and summarize every section with evidence; fails explicitly if the task budget cannot cover the full document.', object({ sourceId: id })),
  tool('read_sheet', 'Read the COMPLETE worksheet or specified actual row interval into a local dataset. Preview contains only 20 rows; calculations use all rows. Do not guess dataset IDs.', object({ sourceId: id, sheet: string, headerRow: number, startRow: number, endRow: number }, ['sourceId', 'sheet'])),
  tool('filter_table', 'Filter all rows of a dataset. Numeric conditions reject non-numeric values.', object({ dataId: id, rules: { type: 'array', minItems: 1, maxItems: 20, items: object({ column: string, operator: { enum: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'] }, value: cell }) } })),
  tool('aggregate_table', 'Compute precise sum, average, min, max, count, optionally grouped by named columns. Never mentally calculate totals.', object({ dataId: id, groupBy: strings, metrics: { type: 'array', minItems: 1, maxItems: 20, items: object({ column: string, operation: { enum: ['sum', 'average', 'min', 'max', 'count'] }, name: string }, ['operation', 'name']) } }, ['dataId', 'metrics'])),
  tool('deduplicate_table', 'Remove duplicate keys, retaining the first occurrence.', object({ dataId: id, keys: { ...strings, minItems: 1 } })),
  tool('join_tables', 'Join two datasets on explicit keys. Right-hand keys must be unique; ambiguous matches are rejected.', object({ leftId: id, rightId: id, leftKey: string, rightKey: string, kind: { enum: ['inner', 'left', 'full'] } }, ['leftId', 'rightId', 'leftKey', 'rightKey'])),
  tool('compare_tables', 'Compare a numeric column by unique key. Difference is RIGHT minus LEFT; missing records are not treated as zero.', object({ leftId: id, rightId: id, key: string, value: string })),
  tool('write_file', 'Create Excel/Word/PDF. Excel exports full dataIds, not preview rows. In text blocks, reference exact computed cells with {{data1:0:column name}} (zero-based data row). cite evidenceIds from prior results; unknown citations/placeholders fail. Each numeric claim must reference a dataset cell.', object({
    kind: { enum: ['excel', 'word', 'pdf'] }, name: string, dataIds: { type: 'array', items: id, maxItems: 16 }, blocks: { type: 'array', items: block, maxItems: 200 },
    evidenceIds: { type: 'array', items: id, maxItems: 100 },
    claims: { type: 'array', maxItems: 100, items: object({ dataId: id, row: { type: 'integer', minimum: 0 }, column: string, value: cell }) },
    requiredHeadings: { type: 'array', items: string, maxItems: 30 },
  }, ['kind', 'name', 'evidenceIds'])),
  tool('edit_excel', 'Modify a copy of an uploaded workbook. Result will be reopened and checked.', object({ sourceId: id, name: string, operations: { type: 'array', minItems: 1, maxItems: 200, items: excelOperationSchema } })),
  tool('replace_word', 'Modify only uniquely matching text in a DOCX while preserving the original package and formatting. Text may span multiple runs. Repeated/absent targets fail.', object({ sourceId: id, name: string, replacements: { type: 'array', minItems: 1, maxItems: 100, items: object({ find: string, replace: { type: 'string', maxLength: 16000 } }) } })),
  tool('finish', 'Finish with a factual answer and evidence IDs. Use needsInput=true only to ask a specific clarification without claiming analysis or creating files.', object({ answer: { type: 'string', minLength: 1, maxLength: 20000 }, evidenceIds: { type: 'array', items: id, maxItems: 100 }, needsInput: { type: 'boolean' } }, ['answer'])),
]
export const taskDecisionSchema = { oneOf: taskTools.map(tool => object({ tool: { const: tool.function.name }, arguments: tool.function.parameters })) }

export function validateSchema(value: unknown, schema: Schema, path = '参数'): void {
  if (schema.oneOf) {
    for (const option of schema.oneOf as Schema[]) { try { validateSchema(value, option, path); return } catch { /* try next shape */ } }
    throw new Error(`${path}不符合任何允许的工具格式`)
  }
  if ('const' in schema && value !== schema.const) throw new Error(`${path}值无效`)
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) throw new Error(`${path}不是允许的值`)
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (types.length && !types.includes(actual) && !(types.includes('integer') && typeof value === 'number' && Number.isInteger(value))) throw new Error(`${path}类型错误`)
  if (typeof value === 'number' && (!Number.isFinite(value) || (typeof schema.minimum === 'number' && value < schema.minimum) || (typeof schema.maximum === 'number' && value > schema.maximum))) throw new Error(`${path}数值超出范围`)
  if (typeof value === 'string' && ((typeof schema.minLength === 'number' && value.length < schema.minLength) || (typeof schema.maxLength === 'number' && value.length > schema.maxLength))) throw new Error(`${path}长度超出范围`)
  if (Array.isArray(value)) {
    if ((typeof schema.minItems === 'number' && value.length < schema.minItems) || (typeof schema.maxItems === 'number' && value.length > schema.maxItems)) throw new Error(`${path}条目数量超出范围`)
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items as Schema, `${path}[${index}]`))
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>, properties = (schema.properties || {}) as Record<string, Schema>
    for (const name of (schema.required || []) as string[]) if (!(name in record)) throw new Error(`${path}缺少字段：${name}`)
    for (const [name, child] of Object.entries(record)) {
      if (['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error(`${path}含无效字段`)
      if (Object.prototype.hasOwnProperty.call(properties, name)) validateSchema(child, properties[name], `${path}.${name}`)
      else if (schema.additionalProperties === false) throw new Error(`${path}含不支持字段：${name}`)
    }
  }
}
export function validateTool(name: string, args: unknown): asserts args is Record<string, unknown> {
  const definition = taskTools.find(tool => tool.function.name === name)
  if (!definition) throw new Error(`不支持的工具：${name}`)
  validateSchema(args, definition.function.parameters)
}
