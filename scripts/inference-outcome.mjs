import { StringDecoder } from 'node:string_decoder'

export class InferenceOutcome {
  constructor() {
    this.decoder = new StringDecoder('utf8')
    this.buffer = ''
    this.skipping = false
    this.result = { done: false }
  }

  consume(line) {
    if (!line.trim() || line.length > 1024 * 1024) return
    let value
    try { value = JSON.parse(line) } catch { return }
    if (!value || typeof value !== 'object') return
    if (value.error) {
      const message = typeof value.error === 'string' ? value.error : String(value.error.message || '')
      this.result.code = /grammar/i.test(message) ? 'GRAMMAR_PARSE_FAILED'
        : /out of memory|insufficient.*memory/i.test(message) ? 'RUNTIME_OUT_OF_MEMORY' : 'MODEL_RUNTIME_ERROR'
    }
    if (value.done === true) this.result.done = true
    if (typeof value.done_reason === 'string') this.result.stopReason = value.done_reason.slice(0, 40)
    for (const key of ['total_duration', 'load_duration', 'prompt_eval_duration', 'eval_duration', 'prompt_eval_count', 'eval_count']) {
      if (Number.isFinite(value[key]) && value[key] >= 0) this.result[key] = value[key]
    }
  }

  push(chunk) {
    this.buffer += this.decoder.write(chunk)
    let newline
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      if (!this.skipping) this.consume(line)
      this.skipping = false
    }
    if (this.buffer.length > 1024 * 1024) { this.buffer = ''; this.skipping = true }
  }

  finish() {
    this.buffer += this.decoder.end()
    if (!this.skipping) this.consume(this.buffer)
    this.buffer = ''
    return this.result
  }
}
