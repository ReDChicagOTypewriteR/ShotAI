import { computed, ref, watch } from 'vue'
import en from '../locales/en'

export type LanguagePreference = 'auto' | 'zh-CN' | 'en'
export const LANGUAGE_STORAGE_KEY = 'shotai-ui-language'
export function validLanguage(value: unknown): LanguagePreference {
  return value === 'zh-CN' || value === 'en' ? value : 'auto'
}
export function systemLanguage(languages: readonly string[]): 'zh-CN' | 'en' {
  return /^zh(?:[-_]|$)/i.test(languages[0] || '') ? 'zh-CN' : 'en'
}
function savedLanguage(): LanguagePreference {
  try { return validLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY)) }
  catch { return 'auto' }
}
export const languagePreference = ref<LanguagePreference>(savedLanguage())
const detectedLanguage = ref(systemLanguage(typeof navigator === 'undefined' ? [] : [navigator.language]))
export const locale = computed(() => languagePreference.value === 'auto' ? detectedLanguage.value : languagePreference.value)
const patterns = Object.entries(en).filter(([key]) => /\{\d+\}/.test(key)).map(([key, translated]) => {
  const indices: number[] = []
  const pattern = key.split(/(\{\d+\})/).map(part => {
    const parameter = part.match(/^\{(\d+)\}$/)
    if (parameter) { indices.push(Number(parameter[1])); return '([\\s\\S]*?)' }
    return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
  return { expression: new RegExp(`^${pattern}$`), indices, translated }
})
export function setLanguage(value: unknown) {
  languagePreference.value = validLanguage(value)
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, languagePreference.value) }
  catch { /* The current session remains usable when storage is unavailable. */ }
}
export function t(key: string, values: readonly unknown[] = []): string {
  let translated = locale.value === 'en' ? en[key] ?? key : key
  if (locale.value === 'en' && !en[key] && /[\u3400-\u9fff]/.test(key)) {
    for (const pattern of patterns) {
      const match = key.match(pattern.expression)
      if (!match) continue
      const parameters: string[] = []
      pattern.indices.forEach((index, position) => { parameters[index] = match[position + 1] })
      return pattern.translated.replace(/\{(\d+)\}/g, (_, index) => parameters[index])
    }
  }
  return translated.replace(/\{(\d+)\}/g, (token, index) => index < values.length ? String(values[index]) : token)
}
if (typeof window !== 'undefined') {
  window.addEventListener('languagechange', () => { detectedLanguage.value = systemLanguage([navigator.language]) })
  window.addEventListener('storage', event => {
    if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) languagePreference.value = validLanguage(event.newValue)
  })
}
watch(locale, value => {
  if (typeof document === 'undefined') return
  document.documentElement.lang = value
  document.title = value === 'en' ? 'ShotAI · Offline Workspace' : 'ShotAI · 离线智能工作台'
}, { immediate: true })
