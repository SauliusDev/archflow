import { describe, expect, it } from 'vitest'
import { ADVANCED_SHAPE_CATALOG, GENERAL_SHAPE_CATALOG, getShapeDefinition } from './shapeCatalog'

describe('shape catalog', () => {
  it('includes common Mermaid 11 general shapes with distinct renderer kinds', () => {
    for (const mermaidShape of ['doc', 'cloud', 'tri', 'trap-t', 'notch-rect', 'hourglass', 'bolt', 'tag-rect']) {
      const item = GENERAL_SHAPE_CATALOG.find(candidate => candidate.mermaidShape === mermaidShape)
      expect(item).toBeDefined()
      expect(item?.renderer).not.toBe('rectangle')
    }
  })

  it('includes the folded-corner Note as an Advanced shape with a stable catalog id', () => {
    expect(ADVANCED_SHAPE_CATALOG).toContainEqual(expect.objectContaining({
      id: 'advanced:note',
      label: 'Note',
      mermaidShape: 'note',
      renderer: 'note',
    }))
  })

  it('resolves known scratchpad catalog ids and returns nothing for stale ids', () => {
    expect(getShapeDefinition('general:document')?.mermaidShape).toBe('doc')
    expect(getShapeDefinition('missing:shape')).toBeUndefined()
  })
})
