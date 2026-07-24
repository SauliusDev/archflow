import { describe, it, expect } from 'vitest'
import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { parseMermaidFlowchart } from './parser'
import { serialize } from './serializer'
import legacyCompleteFixture from '../../../../../test/fixtures/flowchart-editing/legacy-complete.mmd?raw'
import labeledLinkFixture from '../../../../../test/fixtures/mermaid-docs/flowchart/examples/070-text-on-links.mmd?raw'
import multiDirectionalFixture from '../../../../../test/fixtures/mermaid-docs/flowchart/examples/089-multi-directional-arrows.mmd?raw'
import minimumLengthFixture from '../../../../../test/fixtures/mermaid-docs/flowchart/examples/090-minimum-length-of-a-link.mmd?raw'
import edgePropertiesFixture from '../../../../../test/fixtures/mermaid-docs/flowchart/examples/103-edge-level-curve-style-using-edge-ids-v11-10-0.mmd?raw'

type NodeShape = FlowNodeData['shape']
type EdgeStyle = FlowEdgeData['style']

function makeNode(id: string, label: string, shape: NodeShape): Node<FlowNodeData> {
  return { id, type: 'default', position: { x: 0, y: 0 }, data: { label, shape } }
}

function makeEdge(source: string, target: string, style: EdgeStyle = 'arrow', label?: string): Edge<FlowEdgeData> {
  return { id: `e-${source}-${target}`, source, target, data: { style, ...(label !== undefined ? { label } : {}) } }
}

function asSuccess(result: ReturnType<typeof parseMermaidFlowchart>) {
  if ('error' in result) throw new Error(`Expected success but got error: ${result.error}`)
  return result
}

describe('parseMermaidFlowchart', () => {
  it('characterizes the complete legacy shape, connector, repeated-edge, and nested-subgraph fixture', () => {
    const result = asSuccess(parseMermaidFlowchart(legacyCompleteFixture))

    expect(result.nodes.filter(node => !node.data.isSubgraph).map(node => node.data.shape)).toEqual([
      'rectangle', 'rounded', 'pill', 'diamond', 'circle', 'hexagon', 'cylinder', 'rectangle',
    ])
    expect(result.edges.map(edge => edge.data?.style)).toEqual(['arrow', 'dotted', 'thick', 'open'])
    expect(result.edges.map(edge => edge.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(result.nodes.find(node => node.id === 'INNER')?.parentId).toBe('OUTER')
    expect(result.nodes.find(node => node.id === 'H')?.parentId).toBe('INNER')
  })

  // All 8 bracket syntaxes map to correct shape values
  it.each([
    ['rectangle', 'A[Label]',     'Label'],
    ['rounded',   'A(Label)',     'Label'],
    ['pill',      'A([Label])',   'Label'],
    ['diamond',   'A{Label}',     'Label'],
    ['circle',    'A((Label))',   'Label'],
    ['hexagon',   'A{{Label}}',   'Label'],
    ['cylinder',  'A[(Label)]',   'Label'],
  ] as Array<[NodeShape, string, string]>)('bracket syntax for %s → correct shape and label', (shape, nodeDecl, expectedLabel) => {
    const result = asSuccess(parseMermaidFlowchart(`flowchart TD\n  ${nodeDecl}\n`))
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].data.shape).toBe(shape)
    expect(result.nodes[0].data.label).toBe(expectedLabel)
    expect(result.nodes[0].id).toBe('A')
  })

  it('subgraph block maps to shape subgraph', () => {
    const result = asSuccess(parseMermaidFlowchart('flowchart TD\n  subgraph H [MyGroup]\n  end\n'))
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].data.shape).toBe('subgraph')
    expect(result.nodes[0].data.label).toBe('MyGroup')
    expect(result.nodes[0].id).toBe('H')
  })

  // All 4 arrow syntaxes map to correct style values
  it.each([
    ['arrow',  'A --> B'],
    ['dotted', 'A -.-> B'],
    ['thick',  'A ==> B'],
    ['open',   'A --- B'],
  ] as Array<[EdgeStyle, string]>)('arrow %s → correct style', (style, edgeDecl) => {
    const result = asSuccess(parseMermaidFlowchart(`flowchart TD\n  ${edgeDecl}\n`))
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].data?.style).toBe(style)
    expect(result.edges[0].source).toBe('A')
    expect(result.edges[0].target).toBe('B')
  })

  it('pipe syntax populates edge data.label', () => {
    const result = asSuccess(parseMermaidFlowchart('flowchart TD\n  A -->|my label| B\n'))
    expect(result.edges[0].data?.label).toBe('my label')
  })

  it('projects pinned link labels, endpoint markers, directionality, length, IDs, and properties without treating properties as nodes', () => {
    const labeled = asSuccess(parseMermaidFlowchart(labeledLinkFixture))
    expect(labeled.edges).toEqual([expect.objectContaining({
      source: 'A', target: 'B', data: expect.objectContaining({ label: 'This is the text!', connector: '-- This is the text! ---', minimumLength: 3 }),
    })])

    const directional = asSuccess(parseMermaidFlowchart(multiDirectionalFixture))
    expect(directional.edges.map(edge => edge.data)).toEqual([
      expect.objectContaining({ startEndpoint: 'circle', endEndpoint: 'circle', directionality: 'none' }),
      expect.objectContaining({ directionality: 'bidirectional' }),
      expect.objectContaining({ startEndpoint: 'cross', endEndpoint: 'cross', directionality: 'none' }),
    ])

    const lengths = asSuccess(parseMermaidFlowchart(minimumLengthFixture))
    expect(lengths.edges.map(edge => [edge.source, edge.target, edge.data])).toContainEqual(['B', 'E', expect.objectContaining({ label: 'No', minimumLength: 2 })])

    const properties = asSuccess(parseMermaidFlowchart(edgePropertiesFixture))
    expect(properties.edges.map(edge => edge.data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ explicitId: 'e1', properties: { curve: 'linear' }, ownership: 'represented' }),
      expect.objectContaining({ explicitId: 'e2', properties: { curve: 'natural' }, ownership: 'represented' }),
    ]))
    expect(properties.nodes.find(node => node.id === 'e1')).toBeUndefined()
    expect(properties.nodes.find(node => node.id === 'e2')).toBeUndefined()
  })

  it('edge without pipes has no data.label', () => {
    const result = asSuccess(parseMermaidFlowchart('flowchart TD\n  A --> B\n'))
    expect(result.edges[0].data?.label).toBeUndefined()
  })

  it('empty string produces an editable blank flowchart', () => {
    const result = asSuccess(parseMermaidFlowchart(''))
    expect(result).toEqual({ nodes: [], edges: [], passthroughLines: [] })
  })

  it('non-flowchart text returns { error }', () => {
    const result = parseMermaidFlowchart('this is not a flowchart')
    expect('error' in result).toBe(true)
  })

  it('never throws — returns { error } on failure', () => {
    expect(() => parseMermaidFlowchart('')).not.toThrow()
    expect(() => parseMermaidFlowchart('garbage input ###')).not.toThrow()
  })

  it('click and classDef lines appear in passthroughLines', () => {
    const input = 'flowchart TD\n  A[Label]\n  click A href "example.com"\n  classDef foo fill:#f00\n'
    const result = asSuccess(parseMermaidFlowchart(input))
    expect(result.passthroughLines).toContain('click A href "example.com"')
    expect(result.passthroughLines).toContain('classDef foo fill:#f00')
    expect(result.nodes).toHaveLength(1)
  })

  it('hydrates only supported node-specific style colors while preserving style source as passthrough', () => {
    const source = 'flowchart TD\n  A[Label]\n  style A fill:#112233,stroke:#445566,color:#778899\n  style A opacity:0.5\n'
    const result = asSuccess(parseMermaidFlowchart(source))
    expect(result.nodes[0].data).toMatchObject({ fillColor: '#112233', strokeColor: '#445566', textColor: '#778899' })
    expect(result.passthroughLines).toContain('style A opacity:0.5')
  })

  it('treats shorthand and repeated node style directives as source-owned rather than hydrating an arbitrary color', () => {
    const shorthand = asSuccess(parseMermaidFlowchart('flowchart TD\n  A[Label]\n  style A fill:#abc\n'))
    expect(shorthand.nodes[0].data.fillColor).toBeUndefined()

    const repeated = asSuccess(parseMermaidFlowchart('flowchart TD\n  A[Label]\n  style A fill:#112233\n  style A fill:#445566\n'))
    expect(repeated.nodes[0].data.fillColor).toBeUndefined()
  })

  it('nodes have position { x: 0, y: 0 } and type "flowNode"', () => {
    const result = asSuccess(parseMermaidFlowchart('flowchart TD\n  A[Label]\n'))
    expect(result.nodes[0].position).toEqual({ x: 0, y: 0 })
    expect(result.nodes[0].type).toBe('flowNode')
  })

  it('duplicate edges get unique compact ids', () => {
    const input = 'flowchart TD\n  A --> B\n  A --> B\n'
    const result = asSuccess(parseMermaidFlowchart(input))
    expect(result.edges).toHaveLength(2)
    const ids = result.edges.map(e => e.id)
    expect(new Set(ids).size).toBe(2)
    expect(ids).toEqual(['e1', 'e2'])
  })

  it('assigns compact inferred edge identities in source order, including duplicates', () => {
    const result = asSuccess(parseMermaidFlowchart('flowchart TD\n  A --> B\n  A --> B\n  B --> A\n'))

    expect(result.edges.map(edge => edge.id)).toEqual(['e1', 'e2', 'e3'])
  })

  it('preserves explicit Mermaid edge identities while allocating inferred identities around them', () => {
    const result = asSuccess(parseMermaidFlowchart('flowchart TD\n  A e1@--> B\n  B --> C\n  C e8@--> A\n  A --> C\n'))

    expect(result.edges.map(edge => edge.id)).toEqual(['e1', 'e2', 'e8', 'e3'])
  })

  it('round-trip: serialize then parse preserves ids, shapes, labels, and styles', () => {
    const nodes: Node<FlowNodeData>[] = [
      makeNode('A', 'Start', 'rectangle'),
      makeNode('B', 'Process', 'rounded'),
      makeNode('C', 'Decision', 'diamond'),
      makeNode('H', 'Group', 'subgraph'),
    ]
    const edges: Edge<FlowEdgeData>[] = [
      makeEdge('A', 'B', 'arrow'),
      makeEdge('B', 'C', 'dotted', 'condition'),
    ]

    const result = asSuccess(parseMermaidFlowchart(serialize({ nodes, edges })))

    expect(result.nodes).toHaveLength(4)
    expect(result.edges).toHaveLength(2)

    const nodeA = result.nodes.find(n => n.id === 'A')
    expect(nodeA?.data.shape).toBe('rectangle')
    expect(nodeA?.data.label).toBe('Start')

    const nodeB = result.nodes.find(n => n.id === 'B')
    expect(nodeB?.data.shape).toBe('rounded')

    const nodeC = result.nodes.find(n => n.id === 'C')
    expect(nodeC?.data.shape).toBe('diamond')

    const nodeH = result.nodes.find(n => n.id === 'H')
    expect(nodeH?.data.shape).toBe('subgraph')
    expect(nodeH?.data.label).toBe('Group')

    const edgeAB = result.edges.find(e => e.source === 'A' && e.target === 'B')
    expect(edgeAB?.data?.style).toBe('arrow')
    expect(edgeAB?.data?.label).toBeUndefined()

    const edgeBC = result.edges.find(e => e.source === 'B' && e.target === 'C')
    expect(edgeBC?.data?.style).toBe('dotted')
    expect(edgeBC?.data?.label).toBe('condition')
  })

  it('round-trip with passthroughLines survives intact', () => {
    const passthrough = ['click A href "example.com"']
    const serialized = serialize({ nodes: [makeNode('A', 'Label', 'rectangle')], edges: [], passthroughLines: passthrough })
    const result = asSuccess(parseMermaidFlowchart(serialized))
    expect(result.passthroughLines).toContain('click A href "example.com"')
  })
})

describe('subgraph parsing with children', () => {
  it('subgraph block creates subgraphNode with isSubgraph true', () => {
    const result = parseMermaidFlowchart('flowchart TD\n  subgraph SG1 [My Group]\n  end\n')
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const sg = result.nodes.find(n => n.id === 'SG1')
    expect(sg?.type).toBe('subgraphNode')
    expect(sg?.data.shape).toBe('subgraph')
    expect(sg?.data.isSubgraph).toBe(true)
  })

  it('child node inside subgraph block gets parentId and extent parent', () => {
    const mmd = 'flowchart TD\n  subgraph SG1 [Group]\n    A[Node A]\n  end\n'
    const result = parseMermaidFlowchart(mmd)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const child = result.nodes.find(n => n.id === 'A')
    expect(child?.type).toBe('flowNode')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((child as any).parentId).toBe('SG1')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((child as any).extent).toBe('parent')
    expect(child?.data.label).toBe('Node A')
  })

  it('regular node outside subgraph gets type flowNode', () => {
    const result = parseMermaidFlowchart('flowchart TD\n  A[Node A]\n')
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.nodes[0].type).toBe('flowNode')
  })

  it('edge inside subgraph block is added to edges array', () => {
    const mmd = 'flowchart TD\n  subgraph SG1 [Group]\n    A[Node A]\n    B[Node B]\n    A --> B\n  end\n'
    const result = parseMermaidFlowchart(mmd)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.edges.length).toBeGreaterThan(0)
    const edge = result.edges.find(e => e.source === 'A' && e.target === 'B')
    expect(edge).toBeDefined()
  })
})

describe('nested subgraph parsing', () => {
  const nestedMmd = [
    'flowchart TD',
    '  subgraph OUTER [Outer Group]',
    '    subgraph INNER [Inner Group]',
    '      N1[Deep Node]',
    '    end',
    '  end',
    '',
  ].join('\n')

  it('inner subgraph node has parentId pointing to outer subgraph and extent: parent', () => {
    const result = parseMermaidFlowchart(nestedMmd)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const inner = result.nodes.find(n => n.id === 'INNER')
    expect(inner).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((inner as any).parentId).toBe('OUTER')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((inner as any).extent).toBe('parent')
  })

  it('children of inner subgraph have parentId pointing to inner subgraph', () => {
    const result = parseMermaidFlowchart(nestedMmd)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    const deepNode = result.nodes.find(n => n.id === 'N1')
    expect(deepNode).toBeDefined()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((deepNode as any).parentId).toBe('INNER')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((deepNode as any).extent).toBe('parent')
  })

  it('round-trip: serialize(parse(nestedMmd)) produces identical output', () => {
    const parseResult = parseMermaidFlowchart(nestedMmd)
    expect('error' in parseResult).toBe(false)
    if ('error' in parseResult) return
    const serialized = serialize({ nodes: parseResult.nodes, edges: parseResult.edges })
    const reParseResult = parseMermaidFlowchart(serialized)
    expect('error' in reParseResult).toBe(false)
    if ('error' in reParseResult) return
    const outer1 = parseResult.nodes.find(n => n.id === 'OUTER')
    const outer2 = reParseResult.nodes.find(n => n.id === 'OUTER')
    expect(outer2?.data.label).toBe(outer1?.data.label)
    const inner1 = parseResult.nodes.find(n => n.id === 'INNER')
    const inner2 = reParseResult.nodes.find(n => n.id === 'INNER')
    expect(inner2?.data.label).toBe(inner1?.data.label)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((inner2 as any).parentId).toBe('OUTER')
    const deep2 = reParseResult.nodes.find(n => n.id === 'N1')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((deep2 as any).parentId).toBe('INNER')
  })
})
