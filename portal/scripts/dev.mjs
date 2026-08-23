import { spawn } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const children = [
  spawn(npmCommand, ['run', 'dev:portal'], { stdio: 'inherit' }),
  spawn(npmCommand, ['run', 'docs:dev'], { stdio: 'inherit' }),
]

let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(code), 100)
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping && (code ?? 0) !== 0) {
      stop(code ?? 1)
    } else if (!stopping && signal) {
      stop(0)
    }
  })
}

process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
