export type CellValue = string | number | boolean | null
export interface TableData { columns: string[]; rows: CellValue[][]; origins: string[]; warnings: string[] }
export interface FilterRule { column: string; operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains'; value: CellValue }
export interface Metric { column?: string; operation: 'sum' | 'average' | 'min' | 'max' | 'count'; name: string }
export function columnIndex(table: TableData, name: string) {
  const index = table.columns.indexOf(name)
  if (index < 0) throw new Error(`没有找到列：${name}。可用列：${table.columns.join('、')}`)
  return index
}
function numberValue(value: CellValue): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return Number(value)
  throw new Error(`非数值内容不能参与数值计算：${String(value).slice(0, 80)}`)
}
function decimal(value: number) {
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e')
  const places = (mantissa.split('.')[1] || '').length - Number(exponent)
  const digits = BigInt(mantissa.replace('.', ''))
  return places >= 0 ? { digits, places } : { digits: digits * BigInt(10) ** BigInt(-places), places: 0 }
}
export function preciseSum(values: number[]) {
  if (typeof BigInt !== 'function') throw new Error('当前浏览器不支持精确计算，请使用 ShotAI 桌面端或更新浏览器。')
  if (!values.every(Number.isFinite)) throw new Error('不能计算非有限数值')
  const parts = values.map(decimal)
  const places = parts.reduce((maximum, part) => Math.max(maximum, part.places), 0)
  const sum = parts.reduce((total, part) => total + part.digits * BigInt(10) ** BigInt(places - part.places), BigInt(0))
  const result = Number(sum) / 10 ** places
  if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) throw new Error('计算结果超出安全数值范围，请缩小数值范围。')
  return result
}
export function filterTable(table: TableData, rules: FilterRule[]) {
  if (!Array.isArray(rules) || !rules.length) throw new Error('请提供筛选条件')
  const indexed = rules.map(rule => ({ ...rule, index: columnIndex(table, rule.column) }))
  return { ...table, rows: table.rows.filter(row => indexed.every(rule => {
    const value = row[rule.index]
    if (rule.operator === 'contains') return String(value ?? '').includes(String(rule.value ?? ''))
    if (rule.operator === 'eq') return value === rule.value
    if (rule.operator === 'ne') return value !== rule.value
    if (value === null || value === '') return false
    const left = numberValue(value), right = numberValue(rule.value)
    if (rule.operator === 'gt') return left > right
    if (rule.operator === 'gte') return left >= right
    if (rule.operator === 'lt') return left < right
    if (rule.operator === 'lte') return left <= right
    throw new Error('不支持的筛选条件')
  })) }
}
export function aggregateTable(table: TableData, groupBy: string[], metrics: Metric[]): TableData {
  if (!Array.isArray(metrics) || !metrics.length || metrics.length > 20) throw new Error('请指定 1–20 个统计指标')
  const groupIndices = groupBy.map(name => columnIndex(table, name))
  const names = [...groupBy, ...metrics.map(metric => metric.name)]
  if (new Set(names).size !== names.length || metrics.some(metric => !metric.name)) throw new Error('统计结果列名必须唯一且非空')
  const indices = metrics.map(metric => metric.operation === 'count' && !metric.column ? -1 : columnIndex(table, metric.column || ''))
  const groups = new Map<string, { keys: CellValue[]; rows: CellValue[][] }>()
  for (const row of table.rows) {
    const keys = groupIndices.map(index => row[index])
    const key = JSON.stringify(keys)
    if (!groups.has(key)) groups.set(key, { keys, rows: [] })
    groups.get(key)!.rows.push(row)
  }
  if (!table.rows.length && !groupBy.length) groups.set('[]', { keys: [], rows: [] })
  return { ...table, columns: names, rows: [...groups.values()].map(group => [...group.keys, ...metrics.map((metric, index) => {
    const raw = group.rows.map(row => row[indices[index]]).filter(value => value !== null && value !== '')
    if (metric.operation === 'count') return indices[index] < 0 ? group.rows.length : raw.length
    const values = raw.map(numberValue)
    if (metric.operation === 'sum') return preciseSum(values)
    if (!values.length) return null
    if (metric.operation === 'average') return preciseSum(values) / values.length
    if (metric.operation === 'min') return values.reduce((a, b) => Math.min(a, b))
    if (metric.operation === 'max') return values.reduce((a, b) => Math.max(a, b))
    throw new Error('不支持的统计方式')
  })]) }
}
export function deduplicateTable(table: TableData, keys: string[]) {
  if (!keys.length) throw new Error('去重必须指定关键列')
  const indices = keys.map(name => columnIndex(table, name)), seen = new Set<string>()
  const rows = table.rows.filter(row => {
    const key = JSON.stringify(indices.map(index => row[index]))
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  return { ...table, rows }
}
export function joinTables(left: TableData, right: TableData, leftKey: string, rightKey: string, kind: 'inner' | 'left' | 'full' = 'inner'): TableData {
  if (!['inner', 'left', 'full'].includes(kind)) throw new Error('不支持的关联方式')
  const li = columnIndex(left, leftKey), ri = columnIndex(right, rightKey)
  const index = new Map<string, CellValue[]>()
  for (const row of right.rows) {
    const key = JSON.stringify(row[ri])
    if (row[ri] === null || row[ri] === '' || index.has(key)) throw new Error('右表关联键为空或重复，请先清理或汇总后关联。')
    index.set(key, row)
  }
  const seen = new Set<string>(), rows: CellValue[][] = []
  for (const row of left.rows) {
    const key = JSON.stringify(row[li]), match = index.get(key)
    if (match) { rows.push([...row, ...match]); seen.add(key) }
    else if (kind !== 'inner') rows.push([...row, ...right.columns.map(() => null)])
  }
  if (kind === 'full') for (const [key, row] of index) if (!seen.has(key)) rows.push([...left.columns.map(() => null), ...row])
  return { columns: [...left.columns.map(name => `左表.${name}`), ...right.columns.map(name => `右表.${name}`)], rows,
    origins: [...new Set([...left.origins, ...right.origins])], warnings: [...new Set([...left.warnings, ...right.warnings])] }
}
export function compareTables(left: TableData, right: TableData, key: string, value: string): TableData {
  const lk = columnIndex(left, key), rk = columnIndex(right, key), lv = columnIndex(left, value), rv = columnIndex(right, value)
  const makeIndex = (table: TableData, index: number) => {
    const map = new Map<string, CellValue[]>()
    for (const row of table.rows) {
      const id = JSON.stringify(row[index])
      if (row[index] === null || row[index] === '' || map.has(id)) throw new Error('比较键为空或重复，请先按关键列汇总。')
      map.set(id, row)
    }
    return map
  }
  const a = makeIndex(left, lk), b = makeIndex(right, rk)
  return { columns: [key, `左表.${value}`, `右表.${value}`, '差额(右减左)', '变化率', '状态'],
    rows: [...new Set([...a.keys(), ...b.keys()])].map(id => {
      const l = a.get(id), r = b.get(id)
      const before = l ? numberValue(l[lv]) : null, after = r ? numberValue(r[rv]) : null
      const delta = before !== null && after !== null ? preciseSum([after, -before]) : null
      return [l?.[lk] ?? r![rk], before, after, delta, before !== null && before !== 0 && delta !== null ? delta / before : null,
        !l ? '仅右表' : !r ? '仅左表' : delta === 0 ? '一致' : '不同']
    }), origins: [...new Set([...left.origins, ...right.origins])], warnings: [...new Set([...left.warnings, ...right.warnings])] }
}
