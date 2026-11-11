import { extractKnowledgeText, keywordSimilarity } from './knowledge'
import { loadLocalArtifact } from './storage'
import { splitDocument } from './taskWorkspace'

export async function attachmentContext(id: string, preview: string, query: string, maximum: number) {
  const record = await loadLocalArtifact(id)
  const full = record?.text && record.truncated === false ? record.text
    : record?.blob ? await extractKnowledgeText(new File([record.blob], record.name, { type: record.mimeType })) : preview
  if (full.length <= maximum) return full
  const sections = splitDocument(full)
  const ranked = sections.map(section => ({ section, score: keywordSimilarity(query, section.text) }))
    .sort((a, b) => b.score - a.score || a.section.index - b.section.index)
  let remaining = Math.max(0, maximum - 150)
  const selected = ranked.slice(0, 3).sort((a, b) => a.section.index - b.section.index).map(({ section }) => {
    const text = section.text.slice(0, Math.max(0, remaining - 60))
    remaining -= text.length + 60
    return text ? `[${section.location}/${sections.length}]\n${text}` : ''
  }).filter(Boolean).join('\n\n')
  return `[以下仅为相关片段，不是全文；完整总结应分段读取。共 ${sections.length} 个片段]\n${selected}`
}
