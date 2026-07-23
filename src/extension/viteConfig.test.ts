import { describe, expect, it } from 'vitest'
import type { UserConfig } from 'vite'
import viteConfig from '../../vite.config.mts'

describe('Vite development server', () => {
  it('allows VS Code webview origins to load development modules', () => {
    const config = viteConfig as UserConfig
    const origin = typeof config.server?.cors === 'object'
      ? config.server.cors.origin
      : undefined

    expect(origin).toBeInstanceOf(RegExp)
    expect((origin as RegExp).test('vscode-webview://generated-extension-origin')).toBe(true)
    expect((origin as RegExp).test('https://untrusted.example')).toBe(false)
    expect(config.server?.origin).toBe('http://localhost:5173')
  })
})
