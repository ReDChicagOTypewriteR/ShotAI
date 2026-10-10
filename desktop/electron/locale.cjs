function systemLocale(environment, fallback = 'en') {
  const candidate = environment.LC_ALL || environment.LC_MESSAGES || environment.LANGUAGE?.split(':')[0] || environment.LANG || fallback
  return /^zh(?:[-_.]|$)/i.test(candidate) ? 'zh-CN' : 'en'
}
module.exports = { systemLocale }
