import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/webview'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/webview/**/*.test.ts', 'src/webview/**/*.test.tsx'],
    setupFiles: ['src/webview/setupTests.ts'],
  },
})
