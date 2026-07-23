import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import vscode from '@tomjs/vite-plugin-vscode'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    vscode({
      extension: {
        entry: 'src/extension/extension.ts',
      },
    }),
  ],
  server: {
    origin: 'http://localhost:5173',
    cors: {
      origin: /^vscode-webview:\/\//,
    },
  },
  build: {
    outDir: 'out',
    // Runtime asset URLs inside JS cannot be rewritten by the VS Code host.
    assetsInlineLimit: 100_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/webview'),
    },
  },
})
