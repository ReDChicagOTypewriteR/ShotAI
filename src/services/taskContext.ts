import type { OllamaChatMessage } from './ollama'

export type ReasoningMode = 'auto' | 'on' | 'off'
export const estimateTokens = (text: string) => {
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  return Math.ceil(cjk * 1.2 + (text.length - cjk) / 3) + 16
}
export function taskBudget(modelLimit: number, requested: number, _inputTokens: number, complex: boolean) {
  const limit = Math.max(512, Math.min(modelLimit || 8192, 32768))
  // Ollama reloads a runner when num_ctx changes. Keep its allocation stable
  // across routing, planning and execution; only the output budget varies.
  const context = Math.min(limit, requested > 0 ? requested : limit)
  const output = Math.min(complex ? 4096 : 2048, Math.floor(context * .3))
  return { context, output, input: context - output - 256 }
}
export function shouldThink(mode: ReasoningMode, capable: boolean, complex: boolean) {
  return capable ? mode === 'on' || (mode === 'auto' && complex) : undefined
}

// Preserve the current request and earlier user requirements; do not feed old
// private reasoning back into the model or silently clip the latest question.
export function fitTaskHistory(messages: OllamaChatMessage[], budget: number) {
  const systems = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n')
  const history = messages.filter(message => message.role !== 'system')
  const latest = history.at(-1)
  let used = estimateTokens(systems)
  if (latest && used + estimateTokens(latest.content) > budget) throw new Error('当前上下文不足以容纳本次要求，请调高上下文长度或缩小处理范围。')
  const selected = new Set<number>()
  const last = history.length - 1
  const priority = [...new Set([last, ...(history[last - 1]?.role === 'assistant' ? [last - 1] : []),
    ...history.map((message, index) => message.role === 'user' ? index : -1).filter(index => index >= 0).reverse(),
    ...history.map((_, index) => index).reverse()])].filter(index => index >= 0)
  for (const index of priority) {
    const message = history[index]
    const cost = estimateTokens(message.content)
    if (used + cost <= budget) {
      selected.add(index)
      used += cost
    }
  }
  const omittedRequirements = history.filter((message, index) => message.role === 'user' && !selected.has(index))
  const requirements = omittedRequirements.map(message => message.content).join('\n')
  // Carry complete requirements when they fit. Otherwise explicitly disclose
  // the omission rather than inventing a lossy memory of user instructions.
  const reminder = requirements && used + estimateTokens(requirements) + 64 <= budget
    ? `\n\n较早的用户要求：\n${requirements}`
    : requirements ? '\n\n部分早期消息不在当前上下文中；涉及早期约束不明确时请询问用户。' : ''
  return [{ role: 'system' as const, content: systems + reminder }, ...[...selected].sort((a, b) => a - b).map(index => ({ role: history[index].role, content: history[index].content, ...(history[index].images ? { images: history[index].images } : {}) }))]
}
