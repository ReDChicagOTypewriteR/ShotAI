import { defineConfig, searchForWorkspaceRoot } from 'vite'
import { realpathSync } from 'node:fs'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  cacheDir: '.cache/vite',
  base: './',
  plugins: [
    vue(),
    legacy({
      targets: ['chrome >= 64', 'edge >= 79', 'firefox >= 68'],
      // Some intranet browsers can execute ES modules but do not implement
      // import.meta.resolve. The modern/legacy runtime probe deliberately
      // throws in those browsers, which leaves ShotAI blank on a few managed
      // Windows installations. Shipping the broadly-compatible bundle only
      // avoids that probe and also keeps file:// fallback builds usable.
      renderModernChunks: false,
    }),
  ],
  build: {
    cssTarget: 'chrome80',
  },
  server: {
    // Linked dependencies in a worktree may live outside Vite's default root.
    // Permit that dependency directory so the local PDF worker can load.
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(new URL('./node_modules', import.meta.url))] },
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/ollama': {
        target: 'http://127.0.0.1:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.removeHeader('origin')
            proxyRequest.removeHeader('referer')
            proxyRequest.setHeader('x-shotai-proxy', 'vite')
          })
        },
      },
      '^/image/': {
        target: 'http://127.0.0.1:1234',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/image/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyRequest) => {
            proxyRequest.removeHeader('origin')
            proxyRequest.removeHeader('referer')
            proxyRequest.setHeader('x-shotai-proxy', 'vite-image')
          })
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 9090,
  },
})
