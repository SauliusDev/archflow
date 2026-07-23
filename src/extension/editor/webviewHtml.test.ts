import { describe, expect, it } from 'vitest'
import { getWebviewHtml } from './webviewHtml'

describe('getWebviewHtml', () => {
  it('stamps production assets and scripts with CSP nonce', () => {
    const html = getWebviewHtml({
      webview: { cspSource: 'vscode-webview:', asWebviewUri: uri => `webview:${uri}` },
      webviewOutPath: '/extension/out/webview',
      readFile: () => '<html><head></head><body><script src="/assets/app.js"></script><link href="/assets/app.css"></body></html>',
      createNonce: () => 'nonce',
    })

    expect(html).toContain("script-src 'nonce-nonce'")
    expect(html).toContain('src="webview:/extension/out/webview/assets/app.js"')
    expect(html).toContain('nonce="nonce"')
  })

  it('uses npm build in the production fallback and loads Vite directly for development', () => {
    const fallback = getWebviewHtml({ webview: { cspSource: 'vscode-webview:', asWebviewUri: uri => uri }, webviewOutPath: '/missing', readFile: () => { throw new Error('missing') } })
    const dev = getWebviewHtml({ webview: { cspSource: 'vscode-webview:', asWebviewUri: uri => uri }, webviewOutPath: '/unused', serverUrl: 'http://localhost:5173' })

    expect(fallback).toContain('npm run build')
    expect(dev).toContain("connect-src http://localhost:5173 ws: wss:")
    expect(dev).toContain('img-src http://localhost:5173 vscode-resource: data: blob:')
    expect(dev).toContain('import { injectIntoGlobalHook } from "http://localhost:5173/@react-refresh"')
    expect(dev).toContain('window.$RefreshReg$ = () => {}')
    expect(dev).toContain('src="http://localhost:5173/@vite/client"')
    expect(dev).toContain('src="http://localhost:5173/src/webview/main.tsx"')
  })
})
