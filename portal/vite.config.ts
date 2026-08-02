import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    viteSingleFile({
      removeViteModuleLoader: true,
    }),
  ],
  server: {
    port: 5174,
  },
  build: {
    rollupOptions: {
      input: fileURLToPath(new URL('./app.html', import.meta.url)),
    },
  },
})
