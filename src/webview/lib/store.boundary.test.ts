import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const storeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/webview/lib/store.ts'), 'utf8')

describe('store flowchart boundary', () => {
  it('uses compatibility facades or the public feature API instead of private feature modules', () => {
    expect(storeSource).not.toMatch(/features\/flowchart\/(?:application|domain|state)\//)
  })
})
