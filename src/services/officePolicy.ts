import { estimateTokens } from './taskContext'

export function summaryOutputBudget(text: string, ceiling: number) {
  return Math.min(ceiling, Math.max(192, Math.min(640, Math.ceil(estimateTokens(text) * .35))))
}

export function operationKey(tool: string, args: unknown): string {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, stable(value)])) : value
  return JSON.stringify([tool, stable(args)])
}
