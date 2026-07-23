import { readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const baseCss = readFileSync(path.resolve(process.cwd(), 'src/webview/styles/base.css'), 'utf8')

describe('canvas chrome layout', () => {
  it('keeps the flow workarea full-width beneath the left toolbar', () => {
    expect(baseCss).toMatch(/\.canvas-workarea\s*\{[^}]*inset:\s*0;[^}]*\}/s)
  })
})