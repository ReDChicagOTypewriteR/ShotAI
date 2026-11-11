const { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } = require('node:fs')
const { dirname } = require('node:path')

function appendLog(path, content, maximumBytes = 10 * 1024 * 1024, retained = 3) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    if (existsSync(path) && statSync(path).size + Buffer.byteLength(content) > maximumBytes) {
      for (let index = retained; index >= 1; index--) {
        const source = index === 1 ? path : `${path}.${index - 1}`
        const target = `${path}.${index}`
        if (existsSync(target)) unlinkSync(target)
        if (existsSync(source)) renameSync(source, target)
      }
    }
    appendFileSync(path, content, { mode: 0o600 })
  } catch (error) {
    console.error(`日志写入失败：${error.message}`)
  }
}

module.exports = { appendLog }
