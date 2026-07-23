import { describe, expect, it } from 'vitest'
import {
  FLOWFORGE_LAYOUT_END,
  FLOWFORGE_LAYOUT_START,
  embedLayoutInMermaid,
  readEmbeddedLayoutV2,
  stripEmbeddedLayout,
} from './embeddedLayout'
import type { LayoutState, LayoutStateV2 } from '../../shared/diagram-contracts'

const layout: LayoutState = {
  version: 1,
  nodes: {
    A: { x: 10, y: 20, width: 120, height: 44 },
  },
  viewport: { x: 1, y: 2, zoom: 1.25 },
}

function deeplyNestedMetadataJson(depth: number): string {
  return `${'{"next":'.repeat(depth)}null${'}'.repeat(depth)}`
}

describe('embedded layout comments', () => {
  it('embeds layout as Mermaid comments after the diagram source', () => {
    const result = embedLayoutInMermaid('flowchart TD\n  A[Node]\n', layout)

    expect(result).toContain(FLOWFORGE_LAYOUT_START)
    expect(result).toContain('%%     "A": {')
    expect(result).toContain(FLOWFORGE_LAYOUT_END)
    expect(result.endsWith('\n')).toBe(true)
  })

  it('strips the layout block and parses its JSON', () => {
    const source = embedLayoutInMermaid('flowchart TD\n  A[Node]\n', layout)
    const result = stripEmbeddedLayout(source)

    expect(result.error).toBeUndefined()
    expect(result.content).toBe('flowchart TD\n  A[Node]\n')
    expect(result.layout).toEqual(layout)
  })

  it('replaces an existing layout block instead of appending another one', () => {
    const first = embedLayoutInMermaid('flowchart TD\n  A[Node]\n', layout)
    const second = embedLayoutInMermaid(first, {
      ...layout,
      nodes: { A: { x: 50, y: 60 } },
    })

    expect(second.match(/FLOWFORGE LAYOUT START/g)).toHaveLength(1)
    const extracted = stripEmbeddedLayout(second).layout
    expect(extracted?.version).toBe(1)
    if (extracted && 'nodes' in extracted) expect(extracted.nodes.A).toEqual({ x: 50, y: 60 })
  })

  it('returns an error for malformed layout JSON but keeps diagram content usable', () => {
    const result = stripEmbeddedLayout([
      'flowchart TD',
      '  A[Node]',
      '',
      FLOWFORGE_LAYOUT_START,
      '%% {bad json',
      FLOWFORGE_LAYOUT_END,
      '',
    ].join('\n'))

    expect(result.error).toBeTruthy()
    expect(result.layout).toBeNull()
    expect(result.content).toContain('{bad json')
  })

  it('migrates V1 in memory without rewriting source and writes bounded V2 state only on save', () => {
    const source = embedLayoutInMermaid('flowchart TD\n  A[Node]\n', layout)
    const read = readEmbeddedLayoutV2(source, 'flowchart')
    expect(read).toMatchObject({ migrated: true, layout: { version: 2, diagramFamily: 'flowchart', elements: { 'node:A': { x: 10, y: 20, width: 120, height: 44 } } } })
    expect(source).toContain('"version": 1')

    const saved = embedLayoutInMermaid(read.content, read.layout!)
    expect(saved).toContain('"version": 2')
    expect(readEmbeddedLayoutV2(saved, 'flowchart').migrated).toBe(false)
  })

  it('rejects a V1 layout in a class diagram and leaves the Mermaid source available for auto-layout', () => {
    const source = embedLayoutInMermaid('classDiagram\n  class Account\n', layout)
    const read = readEmbeddedLayoutV2(source, 'class')

    expect(read.layout).toBeNull()
    expect(read.migrated).toBe(false)
    expect(read.error).toMatch(/V1.*class/i)
    expect(read.content).toBe(source)
  })

  it('round-trips class and namespace geometry as a V2 Mermaid comment block', () => {
    const classLayout: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'class',
      viewport: { x: 24, y: -12, zoom: 1.2 },
      elements: {
        'class:Account': { x: 160, y: 80, width: 280, height: 156 },
        'namespace:Domain': { x: 120, y: 40, width: 360, height: 240 },
      },
      edges: {},
      constraints: [{ id: 'contain-domain', kind: 'contain', handles: ['namespace:Domain', 'class:Account'] }],
    }
    const source = 'classDiagram\nnamespace Domain {\n  class Account\n}\n'
    const saved = embedLayoutInMermaid(source, classLayout)
    const reopened = readEmbeddedLayoutV2(saved, 'class')

    expect(saved).toContain('%% FLOWFORGE LAYOUT START')
    expect(reopened.content).toBe(source)
    expect(reopened.layout).toEqual(classLayout)
  })

  it('rejects family mismatches and preserves every source byte atomically', () => {
    const v2: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'class',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }
    const source = embedLayoutInMermaid('flowchart TD\n  A[Node]\n', v2)
    const result = readEmbeddedLayoutV2(source, 'flowchart')
    expect(result.error).toMatch(/does not match/)
    expect(result.content).toBe(source)
    expect(result.layout).toBeNull()
  })

  it('preserves CRLF, comments, and trailing bytes when replacing V2 state', () => {
    const v2: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }
    const source = `flowchart TD\r\n  A[Node]\r\n%% keep\r\n`
    const saved = embedLayoutInMermaid(source, v2)
    expect(readEmbeddedLayoutV2(saved, 'flowchart').content).toBe(source)
  })

  it('retains unmatched safe geometry and unknown adapter namespaces', () => {
    const v2: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: { 'node:missing': { x: 500, y: 600 } },
      edges: { 'edge:missing': { routeMode: 'manual', waypoints: [{ x: 10, y: 20 }] } },
      constraints: [{ id: 'align-1', kind: 'align', handles: ['node:missing'], axis: 'x' }],
      adapterMetadata: { 'future-adapter': { preserve: true } },
    }
    const read = readEmbeddedLayoutV2(embedLayoutInMermaid('flowchart TD\n', v2), 'flowchart')
    expect(read.layout?.elements['node:missing']).toEqual({ x: 500, y: 600 })
    expect(read.layout?.adapterMetadata?.['future-adapter']).toEqual({ preserve: true })
  })

  it.each([
    ['future version', { version: 3 }],
    ['non-finite coordinate', { ...layout, version: 2, diagramFamily: 'flowchart', elements: { A: { x: Infinity, y: 0 } }, edges: {}, constraints: [] }],
  ])('rejects %s atomically and preserves the source block', (_name, value) => {
    const source = `${FLOWFORGE_LAYOUT_START}\n%% ${JSON.stringify(value)}\n${FLOWFORGE_LAYOUT_END}\n`
    const read = readEmbeddedLayoutV2(source, 'flowchart')
    expect(read.error).toBeTruthy()
    expect(read.layout).toBeNull()
    expect(read.content).toBe(source)
  })

  it('rejects an oversized block before parsing', () => {
    const source = `${FLOWFORGE_LAYOUT_START}\n%% ${'x'.repeat(1024 * 1024)}\n${FLOWFORGE_LAYOUT_END}\n`
    const read = readEmbeddedLayoutV2(source, 'flowchart')
    expect(read.error).toMatch(/1 MiB/)
    expect(read.content).toBe(source)
  })

  it('returns invalid deep metadata blocks from both loaders without throwing', () => {
    const source = `${FLOWFORGE_LAYOUT_START}\n%% {"version":2,"diagramFamily":"flowchart","viewport":{"x":0,"y":0,"zoom":1},"elements":{},"edges":{},"constraints":[],"adapterMetadata":${deeplyNestedMetadataJson(2_000)}}\n${FLOWFORGE_LAYOUT_END}\n`
    let stripped: ReturnType<typeof stripEmbeddedLayout> | undefined
    let read: ReturnType<typeof readEmbeddedLayoutV2> | undefined

    expect(() => {
      stripped = stripEmbeddedLayout(source)
      read = readEmbeddedLayoutV2(source, 'flowchart')
    }).not.toThrow()
    expect(stripped).toMatchObject({ content: source, layout: null, error: 'Invalid Flowforge layout state' })
    expect(read).toMatchObject({ content: source, layout: null, migrated: false, error: 'Adapter metadata is too deep' })
  })
})
