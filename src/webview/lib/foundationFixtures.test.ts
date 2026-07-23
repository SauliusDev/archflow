import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LayoutState } from '../../shared/diagram-contracts'
import { validateLayoutStateV2 } from '../../shared/diagram-contracts'

const root = path.resolve(process.cwd(), 'test/fixtures/multi-diagram-foundation')

describe('foundation layout fixtures', () => {
  it('provides a valid legacy V1 fixture', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(root, 'layout-v1.json'), 'utf8')) as LayoutState
    expect(layout.version).toBe(1)
    expect(layout.nodes.A).toEqual({ x: 10, y: 20, width: 120, height: 44 })
  })

  it('provides a bounded valid V2 fixture', () => {
    const layout = JSON.parse(fs.readFileSync(path.join(root, 'layout-v2.json'), 'utf8'))
    expect(validateLayoutStateV2(layout)).toEqual({ valid: true, value: layout })
  })
})
