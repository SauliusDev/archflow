import { describe, expect, it, vi } from 'vitest'

vi.mock('zustand')

import { useStore } from '@/state/createStore'
import { flowchartCompatibilityAdapter, type FlowNodeData } from '@/features/flowchart'
import { makeEdge, makeNode } from '@/test/store-helpers'
import { createDocumentSession } from '@/lib/documentSession'
import type { LayoutStateV2 } from '@/shared/diagram-contracts'

describe('createFlowchartSlice lock guards', () => {
  it('blocks every newly guarded mutation before it can create history', () => {
    const node = {
      id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, selected: true,
      data: { label: 'Alpha', shape: 'rectangle' } satisfies FlowNodeData,
    }
    useStore.setState({
      isLocked: true,
      documentSession: { family: 'flowchart', conflict: null } as never,
      nodes: [node],
      edges: [],
      history: { past: [], future: [] },
      isDirty: false,
    })

    useStore.getState().addLane()
    useStore.getState().renameLane('Lane', 'Renamed')
    useStore.getState().reorderLane('Lane', 'Other')
    useStore.getState().deleteLane('Lane', 'promote')
    useStore.getState().setSubgraphDirection('Lane', 'LR')
    useStore.getState().updateNodeShape('A', 'diamond')
    useStore.getState().duplicateNode('A')
    useStore.getState().duplicateNodes(['A'])
    useStore.getState().toggleNodeLock('A')
    useStore.getState().updateNodeColors('A', { fillColor: '#123456' })
    useStore.getState().toggleNodeHandDrawn('A')

    expect(useStore.getState().nodes).toEqual([node])
    expect(useStore.getState().history).toEqual({ past: [], future: [] })
    expect(useStore.getState().isDirty).toBe(false)
  })
})

describe('createFlowchartSlice shape geometry', () => {
  it('turns legacy circle and diamond nodes into centered square bounds', () => {
    useStore.setState({
      nodes: [makeNode('A', { position: { x: 10, y: 20 }, width: 180, height: 80 })],
      edges: [],
      history: { past: [], future: [] },
      documentSession: null,
      isLocked: false,
    })

    useStore.getState().updateNodeShape('A', 'circle')

    expect(useStore.getState().nodes[0]).toMatchObject({
      position: { x: 60, y: 20 },
      width: 80,
      height: 80,
      data: { shape: 'circle' },
    })
  })

  it('keeps persisted circle bounds square after its Mermaid shape is changed', () => {
    const source = 'flowchart LR\n  A[Alpha]\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }
    useStore.getState().initializeDocumentSession(createDocumentSession('shape-geometry', 1, projection, layout))
    useStore.getState().importFromCode(projection.model)
    useStore.getState().resizeNode('A', { width: 180, height: 80 }, { x: 10, y: 20 })

    useStore.getState().updateNodeShape('A', 'diamond')

    expect(useStore.getState().nodes[0]).toMatchObject({
      position: { x: 60, y: 20 },
      width: 80,
      height: 80,
      data: { shape: 'diamond' },
    })
    expect(useStore.getState().documentSession?.layout.elements['node:A']).toMatchObject({
      x: 60,
      y: 20,
      width: 80,
      height: 80,
    })
  })
})

describe('createFlowchartSlice edge defaults', () => {
  it('retargets just the selected endpoint while preserving the edge route and other attachment', () => {
    useStore.setState({
      nodes: [],
      edges: [makeEdge('e1', 'A', 'B', { data: { style: 'arrow', routeMode: 'curved', sourceSide: 'bottom', targetSide: 'right' } })],
      history: { past: [], future: [] },
      documentSession: null,
      isLocked: false,
    })

    useStore.getState().retargetEdgeEndpoint('e1', 'target', 'C', 'left')

    expect(useStore.getState().edges[0]).toMatchObject({
      source: 'A', target: 'C',
      data: { style: 'arrow', routeMode: 'curved', sourceSide: 'bottom', targetSide: 'left' },
    })
    expect(useStore.getState().history.past).toHaveLength(1)
  })

  it('creates direct and spawned legacy edges with the requested route mode', () => {
    useStore.setState({
      nodes: [makeNode('A')],
      edges: [],
      history: { past: [], future: [] },
      documentSession: null,
      isLocked: false,
    })

    useStore.getState().addEdge({ source: 'A', target: 'B' }, 'orthogonal')
    useStore.getState().spawnConnectedNode('A', { x: 120, y: 80 }, 'orthogonal')

    expect(useStore.getState().edges).toEqual([
      expect.objectContaining({ source: 'A', target: 'B', data: expect.objectContaining({ routeMode: 'orthogonal' }) }),
      expect.objectContaining({ source: 'A', data: expect.objectContaining({ routeMode: 'orthogonal' }) }),
    ])
  })

  it('uses the requested mode in document-local layout without adding it to Mermaid', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n'
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('route-default', 1, projection, layout))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().addEdge({ source: 'A', target: 'B' }, 'straight')
    useStore.getState().spawnConnectedNode('A', { x: 120, y: 80 }, 'orthogonal')

    const state = useStore.getState()
    const spawned = state.edges.find(edge => edge.target !== 'B')!
    expect(state.documentSession?.layout.edges).toMatchObject({
      'edge:e1': { routeMode: 'straight' },
      [`edge:${spawned.id}`]: { routeMode: 'orthogonal' },
    })
    expect(state.codeSource).not.toContain('straight')
    expect(state.codeSource).not.toContain('orthogonal')
  })

  it('commits curved defaults with semantic edge creation without serializing route data into Mermaid', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n'
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('curved-default', 1, projection, layout))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().addEdge({ source: 'A', target: 'B' })
    useStore.getState().spawnConnectedNode('A', { x: 120, y: 80 })

    const state = useStore.getState()
    const spawned = state.edges.find(edge => edge.target !== 'B')!
    expect(state.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'e1', data: expect.objectContaining({ routeMode: 'curved' }) }),
      expect.objectContaining({ id: spawned.id, data: expect.objectContaining({ routeMode: 'curved' }) }),
    ]))
    expect(state.documentSession?.layout.edges).toMatchObject({
      'edge:e1': { routeMode: 'curved' },
      [`edge:${spawned.id}`]: { routeMode: 'curved' },
    })
    expect(state.codeSource).toContain('  A e1@--> B\n')
    expect(state.codeSource).toContain(`  A e2@--> ${spawned.target}\n`)
    expect(state.codeSource).not.toContain('curved')
  })

  it('uses the parser-assigned collision suffix without overwriting an existing edge route', () => {
    const source = 'flowchart LR\n  A-B[AB]\n  C[C]\n  A[A]\n  B-C[BC]\n  A-B --> C\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: { 'edge:e-A-B-C': { routeMode: 'straight' } }, constraints: [],
    }
    useStore.getState().initializeDocumentSession(createDocumentSession('curved-collision', 1, projection, layout))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().addEdge({ source: 'A', target: 'B-C' })

    expect(useStore.getState().documentSession?.layout.edges).toEqual({
      'edge:e-A-B-C': { routeMode: 'straight' },
      'edge:e2': { routeMode: 'curved' },
    })
    expect(useStore.getState().edges.find(edge => edge.id === 'e2')?.data?.routeMode).toBe('curved')
  })

  it.each(['straight', 'orthogonal', 'curved'] as const)('changes a legacy edge to %s routing', routeMode => {
    useStore.setState({
      nodes: [],
      edges: [makeEdge('e-a-b', 'a', 'b', { data: { style: 'arrow', routeMode: 'automatic' } })],
      history: { past: [], future: [] },
      documentSession: null,
      isLocked: false,
    })

    useStore.getState().setEdgeRouteMode('e-a-b', routeMode)

    expect(useStore.getState().edges[0].data?.routeMode).toBe(routeMode)
    expect(useStore.getState().history.past).toHaveLength(1)
  })

  it('preserves legacy orthogonal waypoints and removes them for non-orthogonal routes', () => {
    const waypoints = [{ x: 40, y: 60 }]
    useStore.setState({
      nodes: [],
      edges: [makeEdge('e-a-b', 'a', 'b', { data: { style: 'arrow', routeMode: 'manual', waypoints } })],
      history: { past: [], future: [] },
      documentSession: null,
      isLocked: false,
    })

    useStore.getState().setEdgeRouteMode('e-a-b', 'orthogonal')
    expect(useStore.getState().edges[0].data).toMatchObject({ routeMode: 'orthogonal', waypoints })

    useStore.getState().setEdgeRouteMode('e-a-b', 'curved')
    expect(useStore.getState().edges[0].data).toEqual({ style: 'arrow', routeMode: 'curved' })
    expect(useStore.getState().history.past).toHaveLength(2)
  })
})

describe('createFlowchartSlice visual identifiers', () => {
  it('allocates compact node and subgraph identifiers across the shared Mermaid namespace', () => {
    const source = [
      'flowchart LR',
      '  n1[Existing node]',
      '  g1[Existing node using a group prefix]',
      '  subgraph n2 [Existing group using a node prefix]',
      '  end',
      '',
    ].join('\n')
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('compact-visual-identifiers', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().addNode({
      id: '123e4567-e89b-12d3-a456-426614174000',
      type: 'flowNode',
      position: { x: 120, y: 80 },
      data: { label: 'Visual node', shape: 'rectangle' },
    })
    useStore.getState().addSubgraph({ x: 240, y: 80 })
    useStore.getState().addLane()

    const state = useStore.getState()
    expect(state.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['n3', 'g2', 'g3']))
    expect(state.codeSource).toContain('  n3[Visual node]')
    expect(state.codeSource).toContain('  subgraph g2 [Group]')
    expect(state.codeSource).toContain('  subgraph g3 [Lane]')
  })

  it('allocates the next compact identifier for spawned visual nodes', () => {
    const source = 'flowchart LR\n  A[Source]\n  n1[Existing node]\n  subgraph n2 [Existing group]\n  end\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('compact-spawned-node', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().spawnConnectedNode('A', { x: 120, y: 80 })

    expect(useStore.getState().nodes.some(node => node.id === 'n3')).toBe(true)
  })

  it('duplicates a document node through Mermaid with the next compact identifier', () => {
    const source = 'flowchart LR\n  n1[Alpha]\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('compact-duplicate-node', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().duplicateNode('n1')

    const state = useStore.getState()
    expect(state.nodes.some(node => node.id === 'n2')).toBe(true)
    expect(state.codeSource).toContain('  n2[Alpha]')
    expect(flowchartCompatibilityAdapter.parse(state.codeSource, 2).model.nodes.some(node => node.id === 'n2')).toBe(true)
  })

  it('preserves supported styles and text alignment when duplicating a document node', () => {
    const source = 'flowchart LR\n  n1[Alpha]\n  style n1 fill:#112233,stroke:#445566,stroke-width:3px,color:#778899\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('styled-duplicate-node', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
      adapterMetadata: { flowchart: { textAlignments: { n1: { horizontal: 'left', vertical: 'bottom' } } } },
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().duplicateNode('n1')

    const state = useStore.getState()
    expect(state.nodes.find(node => node.id === 'n2')?.data).toMatchObject({
      fillColor: '#112233', strokeColor: '#445566', strokeWidth: 3, textColor: '#778899',
      textHorizontalAlign: 'left', textVerticalAlign: 'bottom',
    })
    expect(state.codeSource).toContain('style n2 fill:#112233,stroke:#445566,stroke-width:3px,color:#778899')
    expect(state.documentSession?.layout.adapterMetadata.flowchart).toMatchObject({
      textAlignments: { n2: { horizontal: 'left', vertical: 'bottom' } },
    })
    expect(flowchartCompatibilityAdapter.parse(state.codeSource, 2).model.nodes.find(node => node.id === 'n2')?.data).toMatchObject({
      fillColor: '#112233', strokeColor: '#445566', strokeWidth: 3, textColor: '#778899',
    })
  })

  it('preserves each source style and alignment across multi-duplicates', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  style A fill:#112233,stroke:#445566\n  style B fill:#abcdef,color:#778899\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('styled-duplicate-nodes', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
      adapterMetadata: { flowchart: { textAlignments: {
        A: { horizontal: 'left', vertical: 'top' }, B: { horizontal: 'right', vertical: 'bottom' },
      } } },
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().duplicateNodes(['A', 'B'])

    const state = useStore.getState()
    expect(state.nodes.find(node => node.id === 'n1')?.data).toMatchObject({
      fillColor: '#112233', strokeColor: '#445566', textHorizontalAlign: 'left', textVerticalAlign: 'top',
    })
    expect(state.nodes.find(node => node.id === 'n2')?.data).toMatchObject({
      fillColor: '#abcdef', textColor: '#778899', textHorizontalAlign: 'right', textVerticalAlign: 'bottom',
    })
    expect(state.codeSource).toContain('style n1 fill:#112233,stroke:#445566')
    expect(state.codeSource).toContain('style n2 fill:#abcdef,color:#778899')
    expect(state.documentSession?.layout.adapterMetadata.flowchart).toMatchObject({
      textAlignments: { n1: { horizontal: 'left', vertical: 'top' }, n2: { horizontal: 'right', vertical: 'bottom' } },
    })
  })

  it('allocates each multi-duplicate identifier against previously allocated copies', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  subgraph n1 [Existing group]\n  end\n  n2[Existing node]\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('compact-duplicate-nodes', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().duplicateNodes(['A', 'B'])

    const state = useStore.getState()
    expect(state.nodes.map(node => node.id)).toEqual(expect.arrayContaining(['n3', 'n4']))
    expect(state.codeSource).toContain('  n3[Alpha]')
    expect(state.codeSource).toContain('  n4[Beta]')
  })
})

describe('createFlowchartSlice node connection settings', () => {
  it('persists connection policy and attachment sides as layout-only document commands', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('node-connections', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().setNodeConnectionPolicy({ mode: 'side', autoReassign: true })
    let state = useStore.getState()
    expect(state.documentSession?.layout.adapterMetadata.flowchart).toMatchObject({
      nodeConnections: { mode: 'side', autoReassign: true },
    })
    expect(state.documentSession?.history.past).toHaveLength(1)
    expect(state.documentSession?.history.past[0]?.forward).toEqual([])
    expect(state.codeSource).toBe(source)

    useStore.getState().setEdgeAttachmentSide('e1', 'source', 'bottom')
    state = useStore.getState()
    expect(state.documentSession?.layout.edges['edge:e1']).toMatchObject({ sourceSide: 'bottom' })
    expect(state.edges[0].data).toMatchObject({ sourceSide: 'bottom' })
    expect(state.documentSession?.history.past).toHaveLength(2)
    expect(state.documentSession?.history.past[1]?.forward).toEqual([])
    expect(state.codeSource).toBe(source)

    useStore.getState().setEdgeAttachmentSide('e1', 'target', 'left')
    state = useStore.getState()
    expect(state.documentSession?.layout.edges['edge:e1']).toEqual({
      routeMode: 'straight', sourceSide: 'bottom', targetSide: 'left',
    })
    expect(state.edges[0].data).toMatchObject({ sourceSide: 'bottom', targetSide: 'left' })
    expect(state.documentSession?.history.past).toHaveLength(3)
    expect(state.documentSession?.history.past[2]?.forward).toEqual([])
    expect(state.codeSource).toBe(source)
  })

  it('does not mutate connection settings when locked, conflicted, or not a flowchart session', () => {
    useStore.setState({
      isLocked: true,
      documentSession: { family: 'flowchart', conflict: null } as never,
      history: { past: [], future: [] },
    })
    useStore.getState().setNodeConnectionPolicy({ mode: 'side', autoReassign: false })
    useStore.getState().setEdgeAttachmentSide('e1', 'target', 'left')
    expect(useStore.getState().history).toEqual({ past: [], future: [] })

    useStore.setState({
      isLocked: false,
      documentSession: { family: 'class', conflict: null } as never,
      history: { past: [], future: [] },
    })
    useStore.getState().setNodeConnectionPolicy({ mode: 'side', autoReassign: false })
    expect(useStore.getState().history).toEqual({ past: [], future: [] })

    useStore.setState({
      documentSession: { family: 'flowchart', conflict: { content: 'external' } } as never,
      history: { past: [], future: [] },
    })
    useStore.getState().setEdgeAttachmentSide('e1', 'target', 'left')
    expect(useStore.getState().history).toEqual({ past: [], future: [] })
  })

  it('projects auto-reassigned sides to rendered edges immediately after moving a node', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('auto-reassign-render', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: { 'node:A': { x: 0, y: 0, width: 80, height: 40 }, 'node:B': { x: 240, y: 0, width: 80, height: 40 } },
      edges: { 'edge:e1': { routeMode: 'straight', sourceSide: 'bottom', targetSide: 'bottom' } }, constraints: [],
      adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: true } } },
    }))
    useStore.getState().importFromCode(projection.model)

    useStore.getState().moveNodes([{ id: 'B', position: { x: 0, y: 240 } }])

    expect(useStore.getState().documentSession?.layout.edges['edge:e1']).toMatchObject({ sourceSide: 'bottom', targetSide: 'top' })
    expect(useStore.getState().edges.find(edge => edge.id === 'e1')?.data).toMatchObject({ sourceSide: 'bottom', targetSide: 'top' })
  })
})
