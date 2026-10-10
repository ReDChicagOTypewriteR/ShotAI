import { createHash, timingSafeEqual } from 'node:crypto'

export function normalizeRemoteAddress(address = '') {
  return address.replace(/^::ffff:/, '')
}

export function constantTimeEqual(left, right) {
  const digest = value => createHash('sha256').update(String(value)).digest()
  return timingSafeEqual(digest(left), digest(right))
}

export function parseCookies(request) {
  const cookies = Object.create(null)
  for (const part of String(request.headers.cookie || '').split(';')) {
    const text = part.trim()
    if (!text) continue
    const separator = text.indexOf('=')
    const key = separator < 0 ? text : text.slice(0, separator)
    try { cookies[key] = separator < 0 ? '' : decodeURIComponent(text.slice(separator + 1)) }
    catch { /* A malformed cookie must not crash an otherwise valid request. */ }
  }
  return cookies
}
