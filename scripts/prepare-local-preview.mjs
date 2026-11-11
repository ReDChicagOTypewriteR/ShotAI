// Optional local smoke-test setup. Reuses existing Qwen2 weights, never downloads.
const source = process.argv[2]
if (!source) throw new Error('Usage: node scripts/prepare-local-preview.mjs <installed-qwen2-model>')
const target = 'shotai-preview-qwen2.5-0.5b:latest'
const base = 'http://127.0.0.1:11434/api'
async function request(path, body) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
  return result
}
const details = await request('/show', { model: source })
if (details.details?.family !== 'qwen2') throw new Error('This local test template is only for Qwen2/2.5 models')
const existing = await fetch(base + '/tags').then(response => response.json())
if (existing.models.some(model => model.name === target)) throw new Error('Preview model already exists; not overwriting it')
await request('/create', {
  model: target, from: source, stream: false,
  template: '{{ range .Messages }}<|im_start|>{{ .Role }}\n{{ .Content }}<|im_end|>\n{{ end }}<|im_start|>assistant\n',
  parameters: { temperature: 0.2, stop: ['<|im_end|>', '<|endoftext|>'] },
})
console.log(JSON.stringify({ model: target, source, weightsReused: true, template: 'ChatML', downloaded: false }))
