// Vite lowers syntax but intentionally does not add runtime polyfills.
// Element Plus uses Array.prototype.at in a few interaction paths, while some
// Chromium/Edge versions still deployed on intranets do not provide it.
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    configurable: true,
    writable: true,
    value<T>(this: T[], index: number): T | undefined {
      const length = this.length
      const integer = Math.trunc(index) || 0
      const normalized = integer < 0 ? length + integer : integer
      if (normalized < 0 || normalized >= length) return undefined
      return this[normalized]
    },
  })
}
