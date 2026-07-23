import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { parseMermaidFlowchart } from './parser'
import { serialize } from './serializer'

type NodeShape = FlowNodeData['shape']
type EdgeStyle = FlowEdgeData['style']

function makeNode(id: string, labelOrOverrides: string | Partial<Node<FlowNodeData>>, shape?: NodeShape): Node<FlowNodeData> {
  if (typeof labelOrOverrides === 'string') {
    return { id, type: 'default', position: { x: 0, y: 0 }, data: { label: labelOrOverrides, shape: shape! } }
  }
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { label: 'Node', shape: 'rectangle' }, ...labelOrOverrides }
}

function makeEdge(id: string, source: string, target: string, style?: EdgeStyle, label?: string): Edge<FlowEdgeData> {
  return { id, source, target, data: { style, ...(label !== undefined ? { label } : {}) } }
}

describe('serialize', () => {
  it('characterizes the exact normalized legacy shape and connector output', () => {
    const nodes = [
      makeNode('A', 'Rectangle', 'rectangle'),
      makeNode('B', 'Rounded', 'rounded'),
      makeNode('C', 'Pill', 'pill'),
      makeNode('D', 'Diamond', 'diamond'),
      makeNode('E', 'Circle', 'circle'),
      makeNode('F', 'Hexagon', 'hexagon'),
      makeNode('G', 'Cylinder', 'cylinder'),
    ]
    const edges = [
      makeEdge('e-A-B', 'A', 'B', 'arrow'),
      makeEdge('e-A-B-1', 'A', 'B', 'dotted'),
      makeEdge('e-A-B-2', 'A', 'B', 'thick'),
      makeEdge('e-A-B-3', 'A', 'B', 'open'),
    ]

    expect(serialize({ nodes, edges })).toBe([
      'flowchart TD',
      '  A[Rectangle]',
      '  B(Rounded)',
      '  C([Pill])',
      '  D{Diamond}',
      '  E((Circle))',
      '  F{{Hexagon}}',
      '  G[(Cylinder)]',
      '  A e-A-B@--> B',
      '  A e-A-B-1@-.-> B',
      '  A e-A-B-2@==> B',
      '  A e-A-B-3@--- B',
      '',
    ].join('\n'))
  })

  it('empty input produces exactly "flowchart TD\\n"', () => {
    expect(serialize({ nodes: [], edges: [] })).toBe('flowchart TD\n')
  })

  it('emits a Mermaid-compatible legacy label for multiple lines', () => {
    const source = serialize({ nodes: [makeNode('A', 'First line\nSecond line', 'rectangle')], edges: [] })

    expect(source).toContain('  A["First line<br/>Second line"]')
    const parsed = parseMermaidFlowchart(source)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.nodes[0]?.data.label).toBe('First line\nSecond line')
  })

  it('preserves a generalized Mermaid shape id instead of flattening it to a rectangle', () => {
    const node = makeNode('A', {
      data: { label: 'Document', shape: 'rectangle', mermaidShape: 'doc' },
    })

    expect(serialize({ nodes: [node], edges: [] })).toContain('  A@{ shape: doc, label: "Document" }')
  })

  it.each([
    ['rectangle', 'A[Label]'],
    ['rounded',   'A(Label)'],
    ['pill',      'A([Label])'],
    ['diamond',   'A{Label}'],
    ['circle',    'A((Label))'],
    ['hexagon',   'A{{Label}}'],
    ['cylinder',  'A[(Label)]'],
  ] as Array<[NodeShape, string]>)('shape %s emits correct bracket syntax', (shape, expected) => {
    const result = serialize({ nodes: [makeNode('A', 'Label', shape)], edges: [] })
    expect(result).toContain(`  ${expected}`)
  })

  it('subgraph node emits block format', () => {
    const result = serialize({ nodes: [makeNode('H', 'Subgraph Label', 'subgraph')], edges: [] })
    expect(result).toContain('  subgraph H [Subgraph Label]')
    expect(result).toContain('  end')
  })

  it.each([
    ['arrow',  '-->'],
    ['dotted', '-.->'],
    ['thick',  '==>'],
    ['open',   '---'],
  ] as Array<[EdgeStyle, string]>)('edge style %s emits correct arrow token', (style, connector) => {
    const nodes = [makeNode('A', 'A', 'rectangle'), makeNode('B', 'B', 'rectangle')]
    const result = serialize({ nodes, edges: [makeEdge('e1', 'A', 'B', style)] })
    expect(result).toContain(`  A e1@${connector} B`)
  })

  it('edge with label uses pipe syntax', () => {
    const nodes = [makeNode('A', 'A', 'rectangle'), makeNode('B', 'B', 'rectangle')]
    const result = serialize({ nodes, edges: [makeEdge('e1', 'A', 'B', 'arrow', 'my label')] })
    expect(result).toContain('  A e1@-->|my label| B')
  })

  it('edge without label has no pipe characters', () => {
    const nodes = [makeNode('A', 'A', 'rectangle'), makeNode('B', 'B', 'rectangle')]
    const result = serialize({ nodes, edges: [makeEdge('e1', 'A', 'B', 'arrow')] })
    expect(result).not.toContain('|')
  })

  it('serializes each edge with its stable Mermaid identity', () => {
    const nodes = [makeNode('A', 'A', 'rectangle'), makeNode('B', 'B', 'rectangle')]

    expect(serialize({ nodes, edges: [makeEdge('e1', 'A', 'B', 'arrow', 'go')] })).toContain('  A e1@-->|go| B')
  })

  it('passthroughLines appear with two-space indent in output', () => {
    const result = serialize({ nodes: [], edges: [], passthroughLines: ['click A href "example.com"'] })
    expect(result).toContain('  click A href "example.com"')
  })

  it('edge without explicit style defaults to arrow connector', () => {
    const nodes = [makeNode('A', 'A', 'rectangle'), makeNode('B', 'B', 'rectangle')]
    const result = serialize({ nodes, edges: [{ id: 'e1', source: 'A', target: 'B', data: {} }] })
    expect(result).toContain('  A e1@--> B')
  })

  it('does not mutate the input nodes or edges arrays', () => {
    const nodes = [makeNode('A', 'A', 'rectangle')]
    const edges = [makeEdge('e1', 'A', 'B', 'arrow')]
    const originalNodesRef = nodes
    const originalEdgesRef = edges
    serialize({ nodes, edges })
    expect(nodes).toBe(originalNodesRef)
    expect(edges).toBe(originalEdgesRef)
  })
})

describe('style directives', () => {
  it('emits style directive when node has fillColor override', () => {
    const node = makeNode('A', { data: { label: 'Node', shape: 'rectangle', fillColor: '#1e2a3a' } })
    const result = serialize({ nodes: [node], edges: [] })
    expect(result).toContain('  style A fill:#1e2a3a')
  })

  it('emits style directive with all three channels when all colors set', () => {
    const node = makeNode('A', { data: { label: 'Node', shape: 'rectangle', fillColor: '#1e2a3a', strokeColor: '#3a6a8a', textColor: '#79b3d3' } })
    const result = serialize({ nodes: [node], edges: [] })
    expect(result).toContain('  style A fill:#1e2a3a,stroke:#3a6a8a,color:#79b3d3')
  })

  it('does NOT emit style directive for nodes without color overrides', () => {
    const node = makeNode('A', 'Label', 'rectangle')
    const result = serialize({ nodes: [node], edges: [] })
    expect(result).not.toContain('style')
  })

  it('emits only set channels in style directive (e.g. only fill when only fillColor set)', () => {
    const node = makeNode('A', { data: { label: 'Node', shape: 'rectangle', fillColor: '#1e2a3a', textColor: '#79b3d3' } })
    const result = serialize({ nodes: [node], edges: [] })
    expect(result).toContain('  style A fill:#1e2a3a,color:#79b3d3')
    expect(result).not.toContain('stroke')
  })
})

describe('subgraph serialization', () => {
  it('subgraph with no children emits subgraph/end block with no child lines', () => {
    const subgraphNode = makeNode('SG1', {
      type: 'subgraphNode',
      data: { label: 'My Group', shape: 'subgraph', isSubgraph: true },
    })
    const result = serialize({ nodes: [subgraphNode], edges: [] })
    expect(result).toContain('subgraph SG1 [My Group]')
    expect(result).toContain('  end')
    const lines = result.split('\n').filter(Boolean)
    const sgIdx = lines.findIndex(l => l.includes('subgraph SG1'))
    const endIdx = lines.findIndex(l => l.trim() === 'end')
    expect(endIdx - sgIdx).toBe(1)
  })

  it('child node is emitted inside subgraph block with 4-space indent', () => {
    const subgraphNode = makeNode('SG1', {
      type: 'subgraphNode',
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    })
    const childNode: Node<FlowNodeData> = {
      id: 'A',
      type: 'flowNode',
      position: { x: 0, y: 0 },
      parentId: 'SG1',
      extent: 'parent',
      data: { label: 'Node A', shape: 'rectangle' },
    }
    const result = serialize({ nodes: [subgraphNode, childNode], edges: [] })
    expect(result).toContain('    A[Node A]')
  })

  it('child node with parentId is NOT emitted in the main node list', () => {
    const subgraphNode = makeNode('SG1', {
      type: 'subgraphNode',
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    })
    const childNode: Node<FlowNodeData> = {
      id: 'A',
      type: 'flowNode',
      position: { x: 0, y: 0 },
      parentId: 'SG1',
      extent: 'parent',
      data: { label: 'Node A', shape: 'rectangle' },
    }
    const result = serialize({ nodes: [subgraphNode, childNode], edges: [] })
    const occurrences = (result.match(/A\[Node A\]/g) ?? []).length
    expect(occurrences).toBe(1)
  })
})

describe('nested subgraph serialization', () => {
  it('nested subgraph produces outer block containing inner block', () => {
    const outer: Node<FlowNodeData> = {
      id: 'OUTER',
      type: 'subgraphNode',
      position: { x: 0, y: 0 },
      data: { label: 'Outer Group', shape: 'subgraph', isSubgraph: true },
    }
    const inner: Node<FlowNodeData> = {
      id: 'INNER',
      type: 'subgraphNode',
      position: { x: 10, y: 10 },
      parentId: 'OUTER',
      extent: 'parent',
      data: { label: 'Inner Group', shape: 'subgraph', isSubgraph: true },
    }
    const result = serialize({ nodes: [outer, inner], edges: [] })
    expect(result).toContain('  subgraph OUTER [Outer Group]')
    expect(result).toContain('    subgraph INNER [Inner Group]')
    expect(result).toContain('    end')
    expect(result).toContain('  end')
    const lines = result.split('\n')
    const outerIdx = lines.findIndex(l => l.includes('subgraph OUTER'))
    const innerIdx = lines.findIndex(l => l.includes('subgraph INNER'))
    const innerEndIdx = lines.findIndex((l, i) => i > innerIdx && l.trim() === 'end')
    const outerEndIdx = lines.findIndex((l, i) => i > innerEndIdx && l.trim() === 'end')
    expect(outerIdx).toBeLessThan(innerIdx)
    expect(innerEndIdx).toBeLessThan(outerEndIdx)
  })

  it('regular node inside nested subgraph emits with 6-space indent', () => {
    const outer: Node<FlowNodeData> = {
      id: 'OUTER',
      type: 'subgraphNode',
      position: { x: 0, y: 0 },
      data: { label: 'Outer', shape: 'subgraph', isSubgraph: true },
    }
    const inner: Node<FlowNodeData> = {
      id: 'INNER',
      type: 'subgraphNode',
      position: { x: 10, y: 10 },
      parentId: 'OUTER',
      extent: 'parent',
      data: { label: 'Inner', shape: 'subgraph', isSubgraph: true },
    }
    const deepChild: Node<FlowNodeData> = {
      id: 'N1',
      type: 'flowNode',
      position: { x: 5, y: 5 },
      parentId: 'INNER',
      extent: 'parent',
      data: { label: 'Deep Node', shape: 'rectangle' },
    }
    const result = serialize({ nodes: [outer, inner, deepChild], edges: [] })
    expect(result).toContain('      N1[Deep Node]')
  })
})
