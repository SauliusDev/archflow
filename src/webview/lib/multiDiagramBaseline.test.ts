import { describe, expect, it } from 'vitest'
import { embedLayoutInMermaid, stripEmbeddedLayout } from './embeddedLayout'
import { parseMermaidFlowchart } from '@/features/flowchart'
import { serialize } from '@/features/flowchart'
import type { LayoutState } from '../../shared/diagram-contracts'

function parsed(source: string) {
  const result = parseMermaidFlowchart(source)
  if ('error' in result) throw new Error(result.error)
  return result
}

const layout: LayoutState = {
  version: 1,
  nodes: { A: { x: 10, y: 20, width: 120, height: 44 } },
  viewport: { x: 0, y: 0, zoom: 1 },
}

describe('LEGACY PROTOTYPE current flowchart baseline', () => {
  it('contract: repeated edges remain distinct semantic edges', () => {
    const result = parsed('flowchart LR\n  A[Start]\n  B[End]\n  A --> B\n  A --> B\n')
    expect(result.edges).toHaveLength(2)
    expect(new Set(result.edges.map(edge => edge.id)).size).toBe(2)
  })

  it('contract: nested subgraph and swimlane-style children retain hierarchy', () => {
    const result = parsed([
      'flowchart TB',
      '  subgraph OUTER [Lane A]',
      '    subgraph INNER [Lane B]',
      '      A[Task]',
      '    end',
      '  end',
    ].join('\n'))
    expect(result.nodes.find(node => node.id === 'INNER')?.parentId).toBe('OUTER')
    expect(result.nodes.find(node => node.id === 'A')?.parentId).toBe('INNER')
  })

  it('expanded contract: compact edge syntax projects as a semantic edge', () => {
    const result = parsed('flowchart TB\n  c1-->a2\n')
    expect(result.edges).toEqual([expect.objectContaining({ source: 'c1', target: 'a2' })])
    expect(result.passthroughLines).not.toContain('c1-->a2')
  })

  it('known-limitation: normalized serialization does not preserve the original direction or whitespace', () => {
    const result = parsed('flowchart LR\n  A[Start]\n  B[End]\n  A --> B\n')
    const normalized = serialize(result)
    expect(normalized.startsWith('flowchart TD\n')).toBe(true)
    expect(normalized).not.toBe('flowchart LR\n  A[Start]\n  B[End]\n  A --> B\n')
  })

  it('contract: version-1 embedded layout strips and restores without changing diagram content', () => {
    const source = 'flowchart TD\n  A[Node]\n'
    const embedded = embedLayoutInMermaid(source, layout)
    expect(stripEmbeddedLayout(embedded)).toEqual({ content: source, layout })
  })

  it('foundation contract: malformed embedded layout is rejected without deleting source bytes', () => {
    const source = 'flowchart TD\n  A[Node]\n\n%% FLOWFORGE LAYOUT START\n%% {bad\n%% FLOWFORGE LAYOUT END\n'
    const result = stripEmbeddedLayout(source)
    expect(result.content).toBe(source)
    expect(result.layout).toBeNull()
    expect(result.error).toBeTruthy()
  })
})
