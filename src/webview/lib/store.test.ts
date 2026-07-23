import { describe, it, expect, vi } from 'vitest'
import type { Edge, Node } from '@xyflow/react'

// vi.mock() is hoisted by Vitest — must appear before source imports.
// This activates src/webview/__mocks__/zustand.ts which resets ALL stores in afterEach.
vi.mock('zustand')

import { useStore } from '@/state/createStore'
import { MAX_HISTORY, GRID_SNAP } from '@/state/types'
import { commitFlowchartSemanticOperations } from '@/features/flowchart'
import type { FlowEdgeData, FlowNodeData } from '@/features/flowchart'
import { makeEdge } from '@/test/store-helpers'
import { createDocumentSession } from './documentSession'
import { flowchartCompatibilityAdapter } from '@/features/flowchart'
import { serialize } from '@/features/flowchart'
import type { LayoutStateV2 } from '../../shared/diagram-contracts'
import { embedLayoutInMermaid } from './embeddedLayout'

function makeNode(id: string, overrides: Partial<Node<FlowNodeData>> = {}): Node<FlowNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: `Node ${id}`, shape: 'rectangle' },
    type: 'default',
    ...overrides,
  }
}

describe('useStore', () => {
  describe('revisioned lossless source integration', () => {
    const exactSource = [
      '---',
      'title: Preserve',
      '---',
      '%%{init: {"flowchart": {"curve": "basis"}}}%%',
      'flowchart LR',
      '  A[Alpha]',
      '%% untouched',
      '',
    ].join('\r\n')
    const layout: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: {},
      edges: {},
      constraints: [],
      adapterMetadata: {},
    }

    function initialize(): void {
      const projection = flowchartCompatibilityAdapter.parse(exactSource, 1)
      useStore.getState().initializeDocumentSession(createDocumentSession('session-1', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)
      useStore.getState().clearDirty()
    }

    it('routes routine rename, add, and delete through targeted source operations', () => {
      initialize()
      useStore.getState().updateNodeLabel('A', 'Beta')
      expect(useStore.getState().codeSource).toBe(exactSource.replace('A[Alpha]', 'A[Beta]'))

      useStore.getState().addNode(makeNode('B', { data: { label: 'Bravo', shape: 'rectangle' } }))
      expect(useStore.getState().codeSource).toContain('  B[Bravo]')
      expect(useStore.getState().codeSource).toContain('%% untouched')

      useStore.getState().removeNode('B')
      expect(useStore.getState().codeSource).not.toContain('B[Bravo]')
      expect(useStore.getState().codeSource).toContain('%% untouched')
    })

    it('persists a multiline node label through the document session', () => {
      initialize()

      useStore.getState().updateNodeLabel('A', 'First line\nSecond line')

      expect(useStore.getState().codeSource).toContain('A["First line<br/>Second line"]')
      expect(useStore.getState().documentSession?.projection.model.nodes[0]?.data.label).toBe('First line\nSecond line')
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('commits node colors as canonical, reversible source transactions that reopen intact', () => {
      initialize()
      useStore.getState().updateNodeColors('A', { fillColor: '#112233', strokeColor: '#445566', textColor: '#778899' })

      const changed = useStore.getState()
      expect(changed.codeSource).toBe(exactSource.replace('%% untouched', '  style A fill:#112233,stroke:#445566,color:#778899\r\n%% untouched'))
      expect(changed.documentSession).toMatchObject({ dirty: true })
      expect(changed.documentSession?.history.past).toHaveLength(1)
      expect(flowchartCompatibilityAdapter.parse(changed.codeSource, 2).model.nodes[0].data).toMatchObject({
        fillColor: '#112233', strokeColor: '#445566', textColor: '#778899',
      })

      useStore.getState().updateNodeColors('A', { fillColor: '#abcdef' })
      expect(useStore.getState().codeSource).toContain('style A fill:#abcdef,stroke:#445566,color:#778899')
      expect(useStore.getState().nodes[0].data).toMatchObject({ fillColor: '#abcdef', strokeColor: '#445566', textColor: '#778899' })
      expect(useStore.getState().documentSession?.history.past).toHaveLength(2)

      useStore.getState().undo()
      expect(useStore.getState().codeSource).toContain('style A fill:#112233,stroke:#445566,color:#778899')
      useStore.getState().redo()
      expect(useStore.getState().nodes[0].data).toMatchObject({ fillColor: '#abcdef', strokeColor: '#445566', textColor: '#778899' })

      useStore.getState().updateNodeColors('A', { fillColor: undefined, strokeColor: undefined, textColor: undefined })
      expect(useStore.getState().codeSource).toBe(exactSource)
    })

    it('does not create a canonical transaction for unchanged colors', () => {
      initialize()
      useStore.getState().updateNodeColors('A', { fillColor: '#112233' })
      const before = useStore.getState().documentSession
      useStore.getState().updateNodeColors('A', { fillColor: '#112233' })
      expect(useStore.getState().documentSession).toBe(before)
      expect(useStore.getState().codeSource).toContain('style A fill:#112233')
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('reprojects supported node colors after a Code-only source edit', () => {
      initialize()
      useStore.getState().applyCodeSource(exactSource.replace('%% untouched', '  style A fill:#112233,stroke:#445566,color:#778899\r\n%% untouched'))

      expect(useStore.getState().nodes[0].data).toMatchObject({
        fillColor: '#112233', strokeColor: '#445566', textColor: '#778899',
      })
    })

    it('adopts embedded layout when Mermaid source is pasted into the Code panel', () => {
      initialize()
      const pasted = embedLayoutInMermaid('flowchart LR\n  n1[Compact node]\n', {
        version: 2,
        diagramFamily: 'flowchart',
        viewport: { x: 240, y: 180, zoom: 0.8 },
        elements: { 'node:n1': { x: 640, y: 360, width: 180, height: 64 } },
        edges: {},
        constraints: [],
        adapterMetadata: {},
      })

      useStore.getState().applyCodeSource(pasted)

      expect(useStore.getState().nodes).toEqual([
        expect.objectContaining({ id: 'n1', position: { x: 640, y: 360 }, width: 180, height: 64 }),
      ])
      expect(useStore.getState().documentSession?.layout).toMatchObject({
        viewport: { x: 240, y: 180, zoom: 0.8 },
        elements: { 'node:n1': { x: 640, y: 360, width: 180, height: 64 } },
      })
    })

    it('canonicalizes source-owned shorthand colors through the document session', () => {
      const source = 'flowchart TD\n  A[Alpha]\n  style A fill:#abc\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      useStore.getState().initializeDocumentSession(createDocumentSession('source-owned-color', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)
      useStore.getState().clearDirty()

      useStore.getState().updateNodeColors('A', { fillColor: '#112233', strokeWidth: 3 })

      expect(useStore.getState().codeSource).toBe('flowchart TD\n  A[Alpha]\n  style A fill:#112233,stroke-width:3px\n')
      expect(useStore.getState().nodes[0]?.data).toMatchObject({ fillColor: '#112233', strokeWidth: 3 })
      expect(useStore.getState().documentSession).toMatchObject({ dirty: true })
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('routes normal edge and shape edits through the same canonical source transaction path', () => {
      const edgeSource = 'flowchart LR\r\n  A[Alpha]\r\n  B[Bravo]\r\n  A --> B\r\n%% untouched\r\n'
      const projection = flowchartCompatibilityAdapter.parse(edgeSource, 3)
      useStore.getState().initializeDocumentSession(createDocumentSession('edge-session', 3, projection, layout))
      useStore.getState().importFromCode(projection.model)
      useStore.getState().clearDirty()

      const direct = commitFlowchartSemanticOperations(
        useStore.getState().documentSession!,
        [{ kind: 'update-edge', id: 'e-A-B', label: 'next' }],
        'diagnostic',
      )
      if (!direct.success) throw new Error(direct.error)
      expect(direct).toMatchObject({ success: true })

      useStore.getState().updateEdgeLabel('e-A-B', 'next')
      useStore.getState().setEdgeStyle('e-A-B', 'thick')
      useStore.getState().updateNodeShape('A', 'diamond')

      expect(useStore.getState().codeSource).toBe(
        'flowchart LR\r\n  A{Alpha}\r\n  B[Bravo]\r\n  A ==>|next| B\r\n%% untouched\r\n',
      )
      expect(useStore.getState().documentSession?.history.past).toHaveLength(3)
    })

    it('creates a connected node and edge as one source transaction with immediate reprojection', () => {
      initialize()
      useStore.getState().spawnConnectedNode('A', { x: 240, y: 120 })

      const state = useStore.getState()
      const created = state.nodes.find(node => node.id !== 'A')
      expect(created).toBeDefined()
      expect(created?.position).toEqual({ x: 240, y: 120 })
      expect(created?.selected).toBe(true)
      expect(state.edges).toEqual([
        expect.objectContaining({ source: 'A', target: created?.id }),
      ])
      expect(state.codeSource).toContain(`  ${created?.id}[Node]`)
      expect(state.codeSource).toContain(`  A --> ${created?.id}`)
      expect(state.codeSource).toContain('%% untouched')
      expect(state.documentSession?.history.past).toHaveLength(1)
    })

    it('deletes multiple connected nodes through one deduplicated source transaction', () => {
      const multiSource = 'flowchart LR\n  A[Alpha]\n  B[Bravo]\n  A --> B\n%% keep\n'
      const projection = flowchartCompatibilityAdapter.parse(multiSource, 1)
      useStore.getState().initializeDocumentSession(createDocumentSession('multi-delete', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)

      useStore.getState().removeNodes(['A', 'B'])

      expect(useStore.getState().nodes).toEqual([])
      expect(useStore.getState().edges).toEqual([])
      expect(useStore.getState().codeSource).toBe('flowchart LR\n%% keep\n')
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('isolates malformed Code from the accepted session and immediately reprojects after recovery', () => {
      initialize()
      const nodesBefore = useStore.getState().nodes
      useStore.getState().applyCodeSource('not mermaid')
      expect(useStore.getState().codeSource).toBe('not mermaid')
      expect(useStore.getState().documentSession?.source).toBe(exactSource)
      expect(useStore.getState().documentSession?.projection.diagnostics).toEqual([])
      expect(useStore.getState().nodes).toBe(nodesBefore)
      expect(useStore.getState().announcement).toMatch(/last valid diagram/i)

      useStore.getState().applyCodeSource('flowchart LR\n  A[Recovered]\n')
      expect(useStore.getState().documentSession?.projection.diagnostics).toEqual([])
      expect(useStore.getState().nodes[0].data.label).toBe('Recovered')
      expect(useStore.getState().codeSource).toBe('flowchart LR\n  A[Recovered]\n')
    })

    it('does not create a source transaction while a flowchart canvas is locked', () => {
      initialize()
      const before = useStore.getState()
      useStore.setState({ isLocked: true })

      useStore.getState().applyCodeSource('flowchart LR\n  A[Locked edit]\n')

      expect(useStore.getState()).toMatchObject({
        codeSource: before.codeSource,
        documentSession: before.documentSession,
        nodes: before.nodes,
        edges: before.edges,
        isDirty: before.isDirty,
      })
      expect(useStore.getState().announcement).toBe('Canvas is locked; unlock it to edit source.')
    })

    it('does not alter canonical source for geometry-only edits or normalized export', () => {
      initialize()
      useStore.getState().moveNodes([{ id: 'A', position: { x: 120, y: 80 } }])
      const canonical = useStore.getState().documentSession?.source
      expect(canonical).toBe(exactSource)
      serialize({ nodes: useStore.getState().nodes, edges: useStore.getState().edges })
      expect(useStore.getState().documentSession?.source).toBe(canonical)
    })

    it('records geometry as one source-preserving transaction with atomic undo and redo', () => {
      initialize()
      const original = useStore.getState().nodes[0].position
      useStore.getState().moveNodes([{ id: 'A', position: { x: 120, y: 80 } }])
      const transaction = useStore.getState().documentSession?.history.past.at(-1)
      expect(transaction).toMatchObject({
        description: 'Move nodes',
        forward: [],
        inverse: [],
        layoutBefore: { elements: { 'node:A': { x: original.x, y: original.y } } },
        layoutAfter: { elements: { 'node:A': { x: 120, y: 80 } } },
      })
      expect(useStore.getState().codeSource).toBe(exactSource)

      useStore.getState().undo()
      expect(useStore.getState().nodes[0].position).toEqual(original)
      useStore.getState().redo()
      expect(useStore.getState().nodes[0].position).toEqual({ x: 120, y: 80 })
    })

    it('records drag-stop geometry after React Flow already updated the controlled node', () => {
      initialize()
      const moved = useStore.getState().nodes.map(node => node.id === 'A'
        ? { ...node, position: { x: 160, y: 96 } }
        : node)
      useStore.setState({ nodes: moved })

      useStore.getState().moveNodes([{ id: 'A', position: { x: 160, y: 96 } }])

      expect(useStore.getState().documentSession).toMatchObject({ dirty: true })
      expect(useStore.getState().documentSession?.layout.elements['node:A']).toMatchObject({ x: 160, y: 96 })
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('undoes and redoes source, projection, selection, and description through session history', () => {
      initialize()
      useStore.getState().updateNodeLabel('A', 'Beta')
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)

      useStore.getState().undo()
      expect(useStore.getState().codeSource).toBe(exactSource)
      expect(useStore.getState().nodes[0].data.label).toBe('Alpha')
      expect(useStore.getState().announcement).toBe('Undo Rename node A')
      expect(useStore.getState().documentSession?.history.future).toHaveLength(1)

      useStore.getState().redo()
      expect(useStore.getState().codeSource).toBe(exactSource.replace('A[Alpha]', 'A[Beta]'))
      expect(useStore.getState().nodes[0].data.label).toBe('Beta')
      expect(useStore.getState().announcement).toBe('Redo Rename node A')
    })
  })

  describe('collision-safe node moves', () => {
    it('clamps an arrow-key move at the edge of a neighbouring node', () => {
      const left = makeNode('A', { position: { x: 88, y: 72 }, width: 160, height: 64 })
      const right = makeNode('E', { position: { x: 250, y: 80 }, width: 160, height: 64 })
      useStore.setState({ nodes: [left, right], edges: [], history: { past: [], future: [] } })

      useStore.getState().moveNodes([{ id: 'A', position: { x: 96, y: 72 } }])

      const moved = useStore.getState().nodes.find(node => node.id === 'A')!
      expect(moved.position.x).toBeGreaterThan(88)
      expect(moved.position.x + 160).toBeLessThanOrEqual(249)
    })
  })

  describe('explicit swimlane transactions', () => {
    const layout: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: {},
      edges: {},
      constraints: [],
      adapterMetadata: {},
    }

    it('exposes a lane-only deterministic reorder command', () => {
      expect(useStore.getState()).toHaveProperty('reorderLane')
    })

    it('classifies only explicitly ordered top-level subgraphs as lanes', () => {
      const source = [
        'flowchart TD',
        '  subgraph Top [Top]',
        '    subgraph Nested [Nested]',
        '      A[Alpha]',
        '    end',
        '  end',
        '  subgraph Generic [Generic]',
        '    B[Beta]',
        '  end',
        '',
      ].join('\n')
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      useStore.getState().initializeDocumentSession(createDocumentSession('lane-classification', 1, projection, {
        ...layout,
        adapterMetadata: { flowchart: { laneOrder: ['Top', 'Nested'] } },
      }))
      useStore.getState().acceptExternalDocument(projection, {
        ...layout,
        adapterMetadata: { flowchart: { laneOrder: ['Top', 'Nested'] } },
      }, 2, 'lane-classification-load')

      expect(useStore.getState().nodes.filter(node => node.data.isLane).map(node => node.id)).toEqual(['Top'])
      expect(useStore.getState().nodes.find(node => node.id === 'Generic')?.data.isLane).toBe(false)
      expect(useStore.getState().nodes.find(node => node.id === 'Nested')?.data.isLane).toBe(false)
    })

    it('reorders lanes in one revisioned source and metadata transaction with undo and redo', () => {
      const source = 'flowchart TD\n  subgraph First [First]\n    A[Alpha]\n  end\n  subgraph Second [Second]\n    B[Beta]\n  end\n%% preserve\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const laneLayout = { ...layout, adapterMetadata: { flowchart: { laneOrder: ['First', 'Second'] } } }
      useStore.getState().initializeDocumentSession(createDocumentSession('lane-order', 1, projection, laneLayout))
      useStore.getState().acceptExternalDocument(projection, laneLayout, 2, 'lane-order-load')

      useStore.getState().reorderLane('Second', 'First')
      expect(useStore.getState().codeSource).toBe('flowchart TD\n  subgraph Second [Second]\n    B[Beta]\n  end\n  subgraph First [First]\n    A[Alpha]\n  end\n%% preserve\n')
      expect(useStore.getState().documentSession?.layout.adapterMetadata).toEqual({ flowchart: { laneOrder: ['Second', 'First'] } })
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)

      useStore.getState().undo()
      expect(useStore.getState().codeSource).toBe(source)
      useStore.getState().redo()
      expect(useStore.getState().codeSource).toContain('subgraph Second [Second]\n    B[Beta]\n  end\n  subgraph First')
    })

    it('creates, renames, and directs a lane as targeted source transactions', () => {
      const source = 'flowchart TD\n  A[Alpha]\n%% preserve\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      useStore.getState().initializeDocumentSession(createDocumentSession('lane-edit', 1, projection, layout))
      useStore.getState().acceptExternalDocument(projection, layout, 2, 'lane-edit-load')

      useStore.getState().addLane()
      const lane = useStore.getState().nodes.find(node => node.data.isLane)
      expect(lane).toBeDefined()
      if (!lane) return
      expect(useStore.getState().documentSession?.layout.adapterMetadata).toEqual({ flowchart: { laneOrder: [lane.id] } })

      useStore.getState().renameLane(lane.id, 'Operations')
      useStore.getState().setSubgraphDirection(lane.id, 'LR')
      expect(useStore.getState().codeSource).toContain(`subgraph ${lane.id} [Operations]\n    direction LR\n  end`)
      expect(useStore.getState().codeSource).toContain('%% preserve')
      expect(useStore.getState().documentSession?.history.past).toHaveLength(3)
    })

    it('moves a node out of a nested generic group into a lane without classifying the group', () => {
      const source = 'flowchart TD\n  subgraph Lane [Lane]\n  end\n  subgraph Generic [Generic]\n    subgraph Nested [Nested]\n      A[Alpha]\n    end\n  end\n%% preserve\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const laneLayout = { ...layout, adapterMetadata: { flowchart: { laneOrder: ['Lane'] } } }
      useStore.getState().initializeDocumentSession(createDocumentSession('lane-move', 1, projection, laneLayout))
      useStore.getState().acceptExternalDocument(projection, laneLayout, 2, 'lane-move-load')

      useStore.getState().assignToSubgraph('A', 'Lane', { x: 20, y: 30 })
      expect(useStore.getState().codeSource).toBe('flowchart TD\n  subgraph Lane [Lane]\n    A[Alpha]\n  end\n  subgraph Generic [Generic]\n    subgraph Nested [Nested]\n    end\n  end\n%% preserve\n')
      expect(useStore.getState().nodes.find(node => node.id === 'Generic')?.data.isLane).toBe(false)
      expect(useStore.getState().nodes.find(node => node.id === 'Nested')?.data.isLane).toBe(false)
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('removes nested lane contents and their geometry in one explicit delete-contents transaction', () => {
      const source = 'flowchart TD\n  subgraph Lane [Lane]\n    subgraph Nested [Nested]\n      A[Alpha]\n    end\n  end\n  B[Beta]\n%% preserve\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const laneLayout = {
        ...layout,
        elements: {
          'node:Lane': { x: 0, y: 0 }, 'node:Nested': { x: 10, y: 10 },
          'node:A': { x: 20, y: 20 }, 'node:B': { x: 30, y: 30 },
        },
        adapterMetadata: { flowchart: { laneOrder: ['Lane'] } },
      }
      useStore.getState().initializeDocumentSession(createDocumentSession('lane-delete', 1, projection, laneLayout))
      useStore.getState().acceptExternalDocument(projection, laneLayout, 2, 'lane-delete-load')

      useStore.getState().deleteLane('Lane', 'delete-contents')
      expect(useStore.getState().codeSource).toBe('flowchart TD\n  B[Beta]\n%% preserve\n')
      expect(useStore.getState().documentSession?.layout.elements).toEqual({ 'node:B': { x: 30, y: 30 } })
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })

    it('keeps a lane’s nested contents when explicitly promoting them', () => {
      const source = 'flowchart TD\n  subgraph Lane [Lane]\n    subgraph Nested [Nested]\n      A[Alpha]\n    end\n  end\n  B[Beta]\n%% preserve\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const laneLayout = { ...layout, adapterMetadata: { flowchart: { laneOrder: ['Lane'] } } }
      useStore.getState().initializeDocumentSession(createDocumentSession('lane-promote', 1, projection, laneLayout))
      useStore.getState().acceptExternalDocument(projection, laneLayout, 2, 'lane-promote-load')

      useStore.getState().deleteLane('Lane', 'promote')
      expect(useStore.getState().codeSource).toBe('flowchart TD\n    subgraph Nested [Nested]\n      A[Alpha]\n    end\n  B[Beta]\n%% preserve\n')
      expect(useStore.getState().documentSession?.layout.adapterMetadata).toEqual({ flowchart: { laneOrder: [] } })
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    })
  })

  describe('edge route persistence', () => {
    it('stores route modes and waypoint edits in LayoutStateV2 without rewriting Mermaid', () => {
      const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const layout: LayoutStateV2 = {
        version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
        elements: {}, edges: {}, constraints: [], adapterMetadata: {},
      }
      useStore.getState().initializeDocumentSession(createDocumentSession('edge-route', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)
      const edgeId = projection.model.edges[0].id

      useStore.getState().setEdgeRouteMode(edgeId, 'orthogonal')
      useStore.getState().addEdgeWaypoint(edgeId, { x: 80, y: 40 })
      useStore.getState().moveEdgeWaypoint(edgeId, 0, { x: 96, y: 48 })

      expect(useStore.getState().codeSource).toBe(source)
      expect(useStore.getState().documentSession?.layout.edges[`edge:${edgeId}`]).toEqual({
        routeMode: 'orthogonal', waypoints: [{ x: 96, y: 48 }],
      })
      expect(useStore.getState().edges[0].data).toMatchObject({ routeMode: 'orthogonal', waypoints: [{ x: 96, y: 48 }] })

      useStore.getState().removeEdgeWaypoint(edgeId, 0)
      expect(useStore.getState().documentSession?.layout.edges[`edge:${edgeId}`]).toEqual({ routeMode: 'orthogonal' })
    })

    it('uses stable identities for repeated and explicitly identified edges, drops unmatched route metadata, and preserves Mermaid semantics', () => {
      const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n  A --> B\n  A e42@--> B\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const layout: LayoutStateV2 = {
        version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
        edges: {
          'edge:e-A-B': { routeMode: 'straight' },
          'edge:e-A-B-1': { routeMode: 'curved' },
          'edge:e42': { routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }] },
          'edge:missing': { routeMode: 'orthogonal', waypoints: [{ x: 1, y: 2 }] },
        },
        adapterMetadata: {},
      }
      useStore.getState().initializeDocumentSession(createDocumentSession('edge-identities', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)

      expect(useStore.getState().codeSource).toBe(source)
      expect(useStore.getState().edges.map(edge => [edge.id, edge.data?.routeMode, edge.data?.waypoints])).toEqual([
        ['e-A-B', 'straight', undefined],
        ['e-A-B-1', 'curved', undefined],
        ['e42', 'orthogonal', [{ x: 80, y: 40 }]],
      ])
    })

    it('removes waypoints atomically on straight, supports undo/redo, and refuses route edits while locked', () => {
      const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const layout: LayoutStateV2 = { version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {} }
      useStore.getState().initializeDocumentSession(createDocumentSession('edge-route-history', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)
      const edgeId = projection.model.edges[0].id

      useStore.getState().setEdgeRouteMode(edgeId, 'orthogonal')
      useStore.getState().addEdgeWaypoint(edgeId, { x: 80, y: 40 })
      useStore.getState().setEdgeRouteMode(edgeId, 'straight')
      expect(useStore.getState().documentSession?.layout.edges[`edge:${edgeId}`]).toEqual({ routeMode: 'straight' })

      useStore.getState().undo()
      expect(useStore.getState().documentSession?.layout.edges[`edge:${edgeId}`]).toEqual({ routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }] })
      useStore.getState().redo()
      expect(useStore.getState().documentSession?.layout.edges[`edge:${edgeId}`]).toEqual({ routeMode: 'straight' })

      useStore.getState().toggleLock()
      useStore.getState().setEdgeRouteMode(edgeId, 'curved')
      useStore.getState().addEdgeWaypoint(edgeId, { x: 96, y: 48 })
      expect(useStore.getState().documentSession?.layout.edges[`edge:${edgeId}`]).toEqual({ routeMode: 'straight' })
      expect(useStore.getState().codeSource).toBe(source)
    })

    it('resets route geometry to automatic together with explicit auto-layout without touching Mermaid', () => {
      const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const edgeId = projection.model.edges[0].id
      const layout: LayoutStateV2 = {
        version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, constraints: [], adapterMetadata: {},
        elements: { 'node:A': { x: 0, y: 0 }, 'node:B': { x: 400, y: 100 } },
        edges: { [`edge:${edgeId}`]: { routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }] } },
      }
      useStore.getState().initializeDocumentSession(createDocumentSession('edge-route-layout', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)

      ;(useStore.getState() as unknown as { applyAutoLayout: () => void }).applyAutoLayout()
      expect(useStore.getState().documentSession?.layout.edges).toEqual({})
      expect(useStore.getState().codeSource).toBe(source)
    })
  })

  describe('addNode', () => {
    it('appends a node to nodes array', () => {
      useStore.getState().addNode(makeNode('a'))
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().nodes[0].id).toBe('a')
    })

    it('creates one history entry', () => {
      useStore.getState().addNode(makeNode('a'))
      expect(useStore.getState().history.past).toHaveLength(1)
    })
  })

  describe('removeNode', () => {
    it('removes the node with the given id', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().removeNode('a')
      expect(useStore.getState().nodes).toHaveLength(0)
    })

    it('removes edges connected to the deleted node', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().addNode(makeNode('b'))
      // Set edges directly — no addEdge action yet (Story 3.x)
      useStore.setState({
        edges: [{ id: 'e1', source: 'a', target: 'b' }] as Edge<FlowEdgeData>[],
      })
      useStore.getState().removeNode('a')
      expect(useStore.getState().edges).toHaveLength(0)
    })

    it('does not create a history entry when id is not found', () => {
      const before = useStore.getState().history.past.length
      useStore.getState().removeNode('nonexistent')
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('removeNodes', () => {
    it('removes multiple nodes matching ids', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().addNode(makeNode('b'))
      useStore.getState().removeNodes(['a', 'b'])
      expect(useStore.getState().nodes).toHaveLength(0)
    })

    it('removes only specified nodes, keeps others', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().addNode(makeNode('b'))
      useStore.getState().addNode(makeNode('c'))
      useStore.getState().removeNodes(['a'])
      expect(useStore.getState().nodes).toHaveLength(2)
      expect(useStore.getState().nodes.every(n => n.id !== 'a')).toBe(true)
    })

    it('removes edges connected to any deleted node', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().addNode(makeNode('b'))
      useStore.setState({
        edges: [{ id: 'e1', source: 'a', target: 'b' }] as Edge<FlowEdgeData>[],
      })
      useStore.getState().removeNodes(['a'])
      expect(useStore.getState().edges).toHaveLength(0)
    })

    it('creates exactly one history entry for multi-node deletion', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().addNode(makeNode('b'))
      const before = useStore.getState().history.past.length
      useStore.getState().removeNodes(['a', 'b'])
      expect(useStore.getState().history.past.length).toBe(before + 1)
    })

    it('no-op when no ids match', () => {
      useStore.getState().addNode(makeNode('a'))
      const before = useStore.getState().history.past.length
      useStore.getState().removeNodes(['z'])
      expect(useStore.getState().history.past.length).toBe(before)
      expect(useStore.getState().nodes).toHaveLength(1)
    })

    it('undo restores deleted nodes and edges', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().addNode(makeNode('b'))
      useStore.setState({
        edges: [{ id: 'e1', source: 'a', target: 'b' }] as Edge<FlowEdgeData>[],
      })
      useStore.getState().removeNodes(['a', 'b'])
      useStore.getState().undo()
      expect(useStore.getState().nodes).toHaveLength(2)
      expect(useStore.getState().edges).toHaveLength(1)
    })
  })

  describe('updateNodeLabel', () => {
    it('updates the label for the matching node', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().updateNodeLabel('a', 'Updated')
      expect(useStore.getState().nodes[0].data.label).toBe('Updated')
    })

    it('does not create a history entry when label is unchanged', () => {
      useStore.getState().addNode(makeNode('a'))  // label is 'Node a'
      const before = useStore.getState().history.past.length
      useStore.getState().updateNodeLabel('a', 'Node a')  // same label
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('moveNodes', () => {
    it('updates positions for matching nodes', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().moveNodes([{ id: 'a', position: { x: 100, y: 200 } }])
      expect(useStore.getState().nodes[0].position).toEqual({ x: 100, y: 200 })
    })

    it('does not create a history entry when positions are unchanged', () => {
      useStore.getState().addNode(makeNode('a'))  // position { x: 0, y: 0 }
      const before = useStore.getState().history.past.length
      useStore.getState().moveNodes([{ id: 'a', position: { x: 0, y: 0 } }])
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('undo', () => {
    it('restores the previous state', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      expect(useStore.getState().nodes).toHaveLength(0)
    })

    it('moves the current state to history.future', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      expect(useStore.getState().history.future).toHaveLength(1)
    })

    it('does nothing when history.past is empty', () => {
      useStore.getState().undo()
      expect(useStore.getState().nodes).toHaveLength(0)
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('redo', () => {
    it('re-applies the undone state', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      useStore.getState().redo()
      expect(useStore.getState().nodes).toHaveLength(1)
    })

    it('clears the re-applied snapshot from history.future', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      useStore.getState().redo()
      expect(useStore.getState().history.future).toHaveLength(0)
    })

    it('does nothing when history.future is empty', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().redo()
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().history.future).toHaveLength(0)
    })
  })

  describe('resizeNode', () => {
    it('updates width and height for matching node', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().resizeNode('a', { width: 200, height: 80 })
      expect(useStore.getState().nodes[0].width).toBe(200)
      expect(useStore.getState().nodes[0].height).toBe(80)
    })

    it('updates position when position argument provided', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().resizeNode('a', { width: 200, height: 80 }, { x: 10, y: 20 })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 10, y: 20 })
    })

    it('creates a history entry', () => {
      useStore.getState().addNode(makeNode('a'))
      const before = useStore.getState().history.past.length
      useStore.getState().resizeNode('a', { width: 200, height: 80 })
      expect(useStore.getState().history.past.length).toBe(before + 1)
    })

    it('does not create a history entry when id not found', () => {
      const before = useStore.getState().history.past.length
      useStore.getState().resizeNode('nonexistent', { width: 200, height: 80 })
      expect(useStore.getState().history.past.length).toBe(before)
    })

    it('does not create a history entry when dimensions are unchanged', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().resizeNode('a', { width: 200, height: 80 })
      const before = useStore.getState().history.past.length
      useStore.getState().resizeNode('a', { width: 200, height: 80 })
      expect(useStore.getState().history.past.length).toBe(before)
    })

    it('creates a history entry when only position changes', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().resizeNode('a', { width: 200, height: 80 })
      const before = useStore.getState().history.past.length
      useStore.getState().resizeNode('a', { width: 200, height: 80 }, { x: 10, y: 20 })
      expect(useStore.getState().history.past.length).toBe(before + 1)
    })
  })

  describe('GRID_SNAP constant', () => {
    it('equals 24 (matches Background dot grid gap)', () => {
      expect(GRID_SNAP).toBe(24)
    })
  })

  describe('MAX_HISTORY cap', () => {
    it('history.past never exceeds MAX_HISTORY entries', () => {
      for (let i = 0; i < 105; i++) {
        useStore.getState().addNode(makeNode(`n${i}`))
      }
      expect(useStore.getState().history.past.length).toBeLessThanOrEqual(MAX_HISTORY)
    })
  })

  describe('deselectAll', () => {
    it('clears selected state on all selected nodes', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.setState({ nodes: [{ ...useStore.getState().nodes[0], selected: true }] })
      useStore.getState().deselectAll()
      expect(useStore.getState().nodes[0].selected).toBeFalsy()
    })

    it('is a no-op when no nodes are selected', () => {
      useStore.getState().addNode(makeNode('a'))
      const nodesBefore = useStore.getState().nodes
      useStore.getState().deselectAll()
      expect(useStore.getState().nodes).toBe(nodesBefore)
    })

    it('does not create a history entry', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.setState({ nodes: [{ ...useStore.getState().nodes[0], selected: true }] })
      const historyLengthBefore = useStore.getState().history.past.length
      useStore.getState().deselectAll()
      expect(useStore.getState().history.past.length).toBe(historyLengthBefore)
    })
  })

  describe('addEdge', () => {
    it('creates an edge with correct source, target, id, and style', () => {
      useStore.getState().addEdge({ source: 'a', target: 'b' })
      const edges = useStore.getState().edges
      expect(edges).toHaveLength(1)
      expect(edges[0].id).toBe('e-a-b')
      expect(edges[0].source).toBe('a')
      expect(edges[0].target).toBe('b')
      expect(edges[0].data?.style).toBe('arrow')
    })

    it('creates exactly one history entry', () => {
      const before = useStore.getState().history.past.length
      useStore.getState().addEdge({ source: 'a', target: 'b' })
      expect(useStore.getState().history.past.length).toBe(before + 1)
    })

    it('undo removes the created edge', () => {
      useStore.getState().addEdge({ source: 'a', target: 'b' })
      useStore.getState().undo()
      expect(useStore.getState().edges).toHaveLength(0)
    })

    it('does not create a duplicate when called twice with same source/target', () => {
      useStore.getState().addEdge({ source: 'a', target: 'b' })
      useStore.getState().addEdge({ source: 'a', target: 'b' })
      expect(useStore.getState().edges).toHaveLength(1)
      expect(useStore.getState().history.past.length).toBe(1)
    })

    it('announces duplicate-edge validation without mutating document state', () => {
      useStore.getState().addEdge({ source: 'a', target: 'b' })
      const before = useStore.getState().history
      useStore.setState({ announcement: null })

      useStore.getState().addEdge({ source: 'a', target: 'b' })

      expect(useStore.getState()).toMatchObject({
        announcement: 'An edge between these nodes already exists.',
        history: before,
      })
    })

    it('prevents self-loops (source === target)', () => {
      const before = useStore.getState().history.past.length
      useStore.getState().addEdge({ source: 'a', target: 'a' })
      expect(useStore.getState().edges).toHaveLength(0)
      expect(useStore.getState().history.past.length).toBe(before)
      expect(useStore.getState().announcement).toBe('A node cannot connect to itself.')
    })

    it.each([
      ['add node', (state: ReturnType<typeof useStore.getState>) => state.addNode(makeNode('new'))],
      ['add subgraph', (state: ReturnType<typeof useStore.getState>) => state.addSubgraph({ x: 40, y: 40 })],
      ['add lane', (state: ReturnType<typeof useStore.getState>) => state.addLane()],
      ['rename lane', (state: ReturnType<typeof useStore.getState>) => state.renameLane('lane', 'Renamed')],
      ['reorder lane', (state: ReturnType<typeof useStore.getState>) => state.reorderLane('lane', 'before')],
      ['delete lane', (state: ReturnType<typeof useStore.getState>) => state.deleteLane('lane', 'promote')],
      ['set subgraph direction', (state: ReturnType<typeof useStore.getState>) => state.setSubgraphDirection('lane', 'LR')],
      ['remove nodes', (state: ReturnType<typeof useStore.getState>) => state.removeNodes(['a'])],
      ['remove edges', (state: ReturnType<typeof useStore.getState>) => state.removeEdges(['e-a-b'])],
      ['update edge label', (state: ReturnType<typeof useStore.getState>) => state.updateEdgeLabel('e-a-b', 'next')],
      ['set edge style', (state: ReturnType<typeof useStore.getState>) => state.setEdgeStyle('e-a-b', 'thick')],
      ['add edge', (state: ReturnType<typeof useStore.getState>) => state.addEdge({ source: 'a', target: 'b' })],
      ['update node label', (state: ReturnType<typeof useStore.getState>) => state.updateNodeLabel('a', 'Renamed')],
      ['update node colors', (state: ReturnType<typeof useStore.getState>) => state.updateNodeColors('a', { fillColor: '#112233' })],
      ['move nodes', (state: ReturnType<typeof useStore.getState>) => state.moveNodes([{ id: 'a', position: { x: 48, y: 48 } }])],
      ['auto-layout', (state: ReturnType<typeof useStore.getState>) => state.applyAutoLayout()],
      ['resize node', (state: ReturnType<typeof useStore.getState>) => state.resizeNode('a', { width: 240, height: 96 })],
      ['assign to subgraph', (state: ReturnType<typeof useStore.getState>) => state.assignToSubgraph('a', 'lane', { x: 20, y: 20 })],
      ['remove from subgraph', (state: ReturnType<typeof useStore.getState>) => state.removeFromSubgraph('a', { x: 80, y: 80 })],
      ['spawn connected node', (state: ReturnType<typeof useStore.getState>) => state.spawnConnectedNode('a', { x: 80, y: 80 })],
      ['update node shape', (state: ReturnType<typeof useStore.getState>) => state.updateNodeShape('a', 'diamond')],
    ])('reports %s session guards without mutating document state', (_name, action) => {
      const nodes = [makeNode('a'), makeNode('b', { position: { x: 240, y: 0 } })]
      const edges = [makeEdge('e-a-b', 'a', 'b')]
      const history = { past: [], future: [] }

      for (const [session, announcement] of [
        [{ family: 'class', conflict: null }, 'This action is unavailable for this diagram.'],
        [{ family: 'flowchart', conflict: { eventId: 'external' } }, 'Resolve external changes before editing.'],
      ] as const) {
        useStore.setState({ documentSession: session as never, nodes, edges, history, codeSource: 'unchanged', announcement: null, isLocked: false })
        action(useStore.getState())

        const after = useStore.getState()
        expect(after).toMatchObject({ announcement, codeSource: 'unchanged' })
        expect(after.documentSession).toBe(session)
        expect(after.nodes).toBe(nodes)
        expect(after.edges).toBe(edges)
        expect(after.history).toBe(history)
      }
    })

    it.each([
      ['add lane', (state: ReturnType<typeof useStore.getState>) => state.addLane()],
      ['rename lane', (state: ReturnType<typeof useStore.getState>) => state.renameLane('lane', 'Renamed')],
      ['reorder lane', (state: ReturnType<typeof useStore.getState>) => state.reorderLane('lane', 'before')],
      ['delete lane', (state: ReturnType<typeof useStore.getState>) => state.deleteLane('lane', 'promote')],
      ['set lane direction', (state: ReturnType<typeof useStore.getState>) => state.setSubgraphDirection('lane', 'LR')],
      ['change node shape', (state: ReturnType<typeof useStore.getState>) => state.updateNodeShape('a', 'diamond')],
      ['duplicate node', (state: ReturnType<typeof useStore.getState>) => state.duplicateNode('a')],
      ['duplicate nodes', (state: ReturnType<typeof useStore.getState>) => state.duplicateNodes(['a'])],
      ['style node colors', (state: ReturnType<typeof useStore.getState>) => state.updateNodeColors('a', { fillColor: '#123456' })],
      ['toggle node hand-drawn state', (state: ReturnType<typeof useStore.getState>) => state.toggleNodeHandDrawn('a')],
    ])('blocks %s before it can create a transaction while locked', (_name, action) => {
      const nodes = [makeNode('a', { selected: true })]
      const edges = []
      const history = { past: [], future: [] }
      const documentSession = { family: 'flowchart', conflict: null }
      useStore.setState({ documentSession: documentSession as never, nodes, edges, history, codeSource: 'unchanged', announcement: null, isDirty: false, isLocked: true })

      action(useStore.getState())

      expect(useStore.getState()).toMatchObject({ documentSession, nodes, edges, history, codeSource: 'unchanged', isDirty: false, announcement: null })
    })
  })

  describe('pendingConnect / setPendingConnect', () => {
    it('setPendingConnect sets sourceId', () => {
      useStore.setState({ pendingConnect: null, history: { past: [], future: [] } })
      useStore.getState().setPendingConnect('node-1')
      expect(useStore.getState().pendingConnect?.sourceId).toBe('node-1')
    })

    it('setPendingConnect(null) clears pendingConnect', () => {
      useStore.setState({ pendingConnect: { sourceId: 'node-1' }, history: { past: [], future: [] } })
      useStore.getState().setPendingConnect(null)
      expect(useStore.getState().pendingConnect).toBeNull()
    })

    it('setPendingConnect does NOT create a history entry', () => {
      useStore.setState({ pendingConnect: null, history: { past: [], future: [] } })
      useStore.getState().setPendingConnect('node-1')
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('spawnConnectedNode', () => {
    it('creates a new node with the same shape as the source node', () => {
      useStore.setState({
        nodes: [makeNode('src', { data: { label: 'Src', shape: 'diamond' } })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().spawnConnectedNode('src', { x: 200, y: 300 })
      const { nodes } = useStore.getState()
      const newNode = nodes.find(n => n.id !== 'src')!
      expect(newNode.data.shape).toBe('diamond')
      expect(newNode.data.label).toBe('Node')
      expect(newNode.position).toEqual({ x: 200, y: 300 })
      expect(newNode.type).toBe('flowNode')
    })

    it('creates an edge from source to new node with style arrow', () => {
      useStore.setState({
        nodes: [makeNode('src')],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().spawnConnectedNode('src', { x: 100, y: 100 })
      const { edges, nodes } = useStore.getState()
      const newNodeId = nodes.find(n => n.id !== 'src')!.id
      expect(edges).toHaveLength(1)
      expect(edges[0].source).toBe('src')
      expect(edges[0].target).toBe(newNodeId)
      expect(edges[0].data?.style).toBe('arrow')
    })

    it('creates exactly ONE history entry (node + edge atomic)', () => {
      useStore.setState({
        nodes: [makeNode('src')],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().spawnConnectedNode('src', { x: 100, y: 100 })
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('undo() removes both the spawned node and edge', () => {
      useStore.setState({
        nodes: [makeNode('src')],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().spawnConnectedNode('src', { x: 100, y: 100 })
      useStore.getState().undo()
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().edges).toHaveLength(0)
    })

    it('non-existent sourceId is a no-op — no history entry', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().spawnConnectedNode('nonexistent', { x: 0, y: 0 })
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('removeEdge / removeEdges', () => {
    it('removeEdge removes the edge by id and records one history entry', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().removeEdge('e1')
      expect(useStore.getState().edges).toHaveLength(0)
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('undo() after removeEdge restores the edge', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().removeEdge('e1')
      useStore.getState().undo()
      expect(useStore.getState().edges).toHaveLength(1)
      expect(useStore.getState().edges[0].id).toBe('e1')
    })

    it('removeEdge with non-existent id is a no-op — no history entry', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeEdge('nonexistent')
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('removeEdges removes multiple edges in a single history entry', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B'), makeEdge('e2', 'B', 'C')],
        history: { past: [], future: [] },
      })
      useStore.getState().removeEdges(['e1', 'e2'])
      expect(useStore.getState().edges).toHaveLength(0)
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('removeEdges with empty ids array is a no-op', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().removeEdges([])
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('updateEdgeLabel', () => {
    it('sets label on edge and creates one history entry', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().updateEdgeLabel('e1', 'yes')
      expect(useStore.getState().edges[0].data?.label).toBe('yes')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('undo() after updateEdgeLabel restores previous label', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B', { data: { style: 'arrow', label: 'old' } })],
        history: { past: [], future: [] },
      })
      useStore.getState().updateEdgeLabel('e1', 'new')
      useStore.getState().undo()
      expect(useStore.getState().edges[0].data?.label).toBe('old')
    })

    it('same label is a no-op — no history entry', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B', { data: { style: 'arrow', label: 'text' } })],
        history: { past: [], future: [] },
      })
      useStore.getState().updateEdgeLabel('e1', 'text')
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('empty string stores undefined and creates one history entry when previous was set', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B', { data: { style: 'arrow', label: 'text' } })],
        history: { past: [], future: [] },
      })
      useStore.getState().updateEdgeLabel('e1', '')
      expect(useStore.getState().edges[0].data?.label).toBeUndefined()
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('empty string on edge with no label is a no-op', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().updateEdgeLabel('e1', '  ')
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('non-existent id is a no-op', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateEdgeLabel('nonexistent', 'text')
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('addSubgraph', () => {
    it('creates a node with shape subgraph, type subgraphNode, isSubgraph true', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().addSubgraph()
      const { nodes } = useStore.getState()
      expect(nodes).toHaveLength(1)
      expect(nodes[0].type).toBe('subgraphNode')
      expect(nodes[0].data.shape).toBe('subgraph')
      expect(nodes[0].data.isSubgraph).toBe(true)
    })

    it('creates node with default dimensions width=300 height=200', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().addSubgraph()
      const node = useStore.getState().nodes[0]
      expect(node.width).toBe(300)
      expect(node.height).toBe(200)
    })

    it('creates exactly one history entry', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().addSubgraph()
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('undo removes the created subgraph', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().addSubgraph()
      useStore.getState().undo()
      expect(useStore.getState().nodes).toHaveLength(0)
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('groups eligible top-level nodes in one local history entry', () => {
      const alpha = makeNode('A', { position: { x: 120, y: 144 }, width: 80, height: 40 })
      const bravo = makeNode('B', { position: { x: 264, y: 192 }, width: 80, height: 40 })
      useStore.setState({ documentSession: null, nodes: [alpha, bravo], edges: [], history: { past: [], future: [] } })

      useStore.getState().addSubgraph({ x: 96, y: 96 })

      const state = useStore.getState()
      const created = state.nodes.find(node => node.data.isSubgraph)
      if (!created) throw new Error('Expected group to be created')
      expect(state.nodes.find(node => node.id === 'A')).toMatchObject({ parentId: created.id, position: { x: 24, y: 48 }, extent: 'parent' })
      expect(state.nodes.find(node => node.id === 'B')).toMatchObject({ parentId: created.id, position: { x: 168, y: 96 }, extent: 'parent' })
      expect(state.nodes.findIndex(node => node.id === created.id)).toBeLessThan(state.nodes.findIndex(node => node.id === 'A'))
      expect(state.nodes.findIndex(node => node.id === created.id)).toBeLessThan(state.nodes.findIndex(node => node.id === 'B'))
      expect(state.history.past).toHaveLength(1)

      useStore.getState().undo()
      expect(useStore.getState().nodes).toEqual([alpha, bravo])
    })

    it('is a no-op while the canvas is locked', () => {
      const alpha = makeNode('A', { position: { x: 120, y: 144 }, width: 80, height: 40 })
      useStore.setState({ documentSession: null, isLocked: true, nodes: [alpha], edges: [], history: { past: [], future: [] } })

      useStore.getState().addSubgraph({ x: 96, y: 96 })

      expect(useStore.getState().nodes).toEqual([alpha])
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('is a no-op for a conflicted flowchart session', () => {
      const alpha = makeNode('A', { position: { x: 120, y: 144 }, width: 80, height: 40 })
      useStore.setState({
        documentSession: { family: 'flowchart', conflict: { content: 'external edit' } } as never,
        nodes: [alpha],
        edges: [],
        history: { past: [], future: [] },
      })

      useStore.getState().addSubgraph({ x: 96, y: 96 })

      expect(useStore.getState().nodes).toEqual([alpha])
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('is a no-op for a non-flowchart document session', () => {
      const alpha = makeNode('A', { position: { x: 120, y: 144 }, width: 80, height: 40 })
      useStore.setState({
        documentSession: { family: 'class', conflict: null } as never,
        nodes: [alpha],
        edges: [],
        history: { past: [], future: [] },
      })

      useStore.getState().addSubgraph({ x: 96, y: 96 })

      expect(useStore.getState().nodes).toEqual([alpha])
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('creates a positioned group and atomically nests enclosed top-level nodes in the session', () => {
      const source = 'flowchart LR\n  A[Alpha]\n  B[Bravo]\n  OUT[Outside]\n%% preserve\n'
      const projection = flowchartCompatibilityAdapter.parse(source, 1)
      const layout: LayoutStateV2 = {
        version: 2,
        diagramFamily: 'flowchart',
        viewport: { x: 0, y: 0, zoom: 1 },
        elements: {
          'node:A': { x: 120, y: 144, width: 80, height: 40 },
          'node:B': { x: 264, y: 192, width: 80, height: 40 },
          'node:OUT': { x: 432, y: 144, width: 80, height: 40 },
        },
        edges: {}, constraints: [], adapterMetadata: {},
      }
      useStore.getState().initializeDocumentSession(createDocumentSession('positioned-group', 1, projection, layout))
      useStore.getState().importFromCode(projection.model)

      useStore.getState().addSubgraph({ x: 96, y: 96 })

      const created = useStore.getState().nodes.find(node => node.data.isSubgraph)
      expect(created).toMatchObject({ position: { x: 96, y: 96 }, width: 300, height: 200 })
      if (!created) throw new Error('Expected group to be created')
      const state = useStore.getState()
      expect(state.nodes.find(node => node.id === 'A')).toMatchObject({ parentId: created.id, position: { x: 24, y: 48 }, extent: 'parent' })
      expect(state.nodes.find(node => node.id === 'B')).toMatchObject({ parentId: created.id, position: { x: 168, y: 96 }, extent: 'parent' })
      expect(state.nodes.find(node => node.id === 'OUT')?.parentId).toBeUndefined()
      expect(state.nodes.findIndex(node => node.id === created.id)).toBeLessThan(state.nodes.findIndex(node => node.id === 'A'))
      expect(state.nodes.findIndex(node => node.id === created.id)).toBeLessThan(state.nodes.findIndex(node => node.id === 'B'))
      expect(state.documentSession?.layout.elements[`node:${created.id}`]).toEqual({ x: 96, y: 96, width: 300, height: 200 })
      expect(state.documentSession?.layout.elements['node:A']).toMatchObject({ x: 24, y: 48 })
      expect(state.documentSession?.layout.elements['node:B']).toMatchObject({ x: 168, y: 96 })
      expect(state.documentSession?.history.past).toHaveLength(1)
      expect(state.codeSource).toContain(`subgraph ${created.id} [Group]`)
      expect(state.codeSource).toContain('    A[Alpha]')
      expect(state.codeSource).toContain('    B[Bravo]')

      useStore.getState().undo()
      expect(useStore.getState().codeSource).toBe(source)
      expect(useStore.getState().nodes.find(node => node.id === created.id)).toBeUndefined()
      expect(useStore.getState().nodes.find(node => node.id === 'A')).toMatchObject({ position: { x: 120, y: 144 } })
      expect(useStore.getState().nodes.find(node => node.id === 'A')?.parentId).toBeUndefined()
      expect(useStore.getState().documentSession?.history.past).toHaveLength(0)
    })
  })

  describe('assignToSubgraph', () => {
    const makeSubgraph = (id: string, pos = { x: 100, y: 100 }) =>
      makeNode(id, {
        type: 'subgraphNode',
        data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
        position: pos,
        width: 300,
        height: 200,
      })

    it('sets parentId on the node', () => {
      const sg = makeSubgraph('SG1')
      const node = makeNode('A', { position: { x: 150, y: 150 } })
      useStore.setState({ nodes: [sg, node], edges: [], history: { past: [], future: [] } })
      useStore.getState().assignToSubgraph('A', 'SG1', { x: 50, y: 50 })
      const updated = useStore.getState().nodes.find(n => n.id === 'A')
      expect(updated?.parentId).toBe('SG1')
    })

    it('sets position to provided relative coords', () => {
      const sg = makeSubgraph('SG1')
      const node = makeNode('A')
      useStore.setState({ nodes: [sg, node], edges: [], history: { past: [], future: [] } })
      useStore.getState().assignToSubgraph('A', 'SG1', { x: 50, y: 50 })
      const updated = useStore.getState().nodes.find(n => n.id === 'A')
      expect(updated?.position).toEqual({ x: 50, y: 50 })
    })

    it('sets extent: "parent" for containment', () => {
      const sg = makeSubgraph('SG1')
      const node = makeNode('A')
      useStore.setState({ nodes: [sg, node], edges: [], history: { past: [], future: [] } })
      useStore.getState().assignToSubgraph('A', 'SG1', { x: 50, y: 50 })
      const updated = useStore.getState().nodes.find(n => n.id === 'A')
      expect(updated?.extent).toBe('parent')
    })

    it('parent subgraph appears before child in nodes array', () => {
      const sg = makeSubgraph('SG1')
      const node = makeNode('A')
      useStore.setState({ nodes: [sg, node], edges: [], history: { past: [], future: [] } })
      useStore.getState().assignToSubgraph('A', 'SG1', { x: 50, y: 50 })
      const { nodes } = useStore.getState()
      const sgIdx = nodes.findIndex(n => n.id === 'SG1')
      const nodeIdx = nodes.findIndex(n => n.id === 'A')
      expect(sgIdx).toBeLessThan(nodeIdx)
    })

    it('no-op when node already has same parentId (no history entry)', () => {
      const sg = makeSubgraph('SG1')
      const node = { ...makeNode('A'), parentId: 'SG1' }
      useStore.setState({ nodes: [sg, node], edges: [], history: { past: [], future: [] } })
      useStore.getState().assignToSubgraph('A', 'SG1', { x: 50, y: 50 })
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('removeFromSubgraph', () => {
    it('clears parentId from the node', () => {
      const sg = makeNode('SG1', {
        type: 'subgraphNode',
        data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
        position: { x: 100, y: 100 },
      })
      const child = { ...makeNode('A', { position: { x: 50, y: 50 } }), parentId: 'SG1' }
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeFromSubgraph('A', { x: 420, y: 150 })
      const updated = useStore.getState().nodes.find(n => n.id === 'A')
      expect(updated?.parentId).toBeUndefined()
    })

    it('sets absolute position to provided coords', () => {
      const sg = makeNode('SG1', { data: { label: 'G', shape: 'subgraph', isSubgraph: true }, position: { x: 100, y: 100 } })
      const child = { ...makeNode('A', { position: { x: 50, y: 50 } }), parentId: 'SG1' }
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeFromSubgraph('A', { x: 420, y: 180 })
      const updated = useStore.getState().nodes.find(n => n.id === 'A')
      expect(updated?.position).toEqual({ x: 420, y: 180 })
    })

    it('creates exactly one history entry', () => {
      const sg = makeNode('SG1', { data: { label: 'G', shape: 'subgraph', isSubgraph: true }, position: { x: 0, y: 0 } })
      const child = { ...makeNode('A'), parentId: 'SG1' }
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeFromSubgraph('A', { x: 400, y: 0 })
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('no-op when node has no parentId (no history entry)', () => {
      const node = makeNode('A')
      useStore.setState({ nodes: [node], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeFromSubgraph('A', { x: 0, y: 0 })
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('keeps a child in its group header until its center leaves the full group bounds', () => {
      const group = makeNode('SG1', {
        type: 'subgraphNode',
        data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
        position: { x: 100, y: 100 },
        width: 300,
        height: 200,
      })
      const child = { ...makeNode('A', { position: { x: 80, y: 0 }, width: 80, height: 40 }), parentId: 'SG1', extent: 'parent' as const }
      useStore.setState({ nodes: [group, child], edges: [], history: { past: [], future: [] } })

      useStore.getState().removeFromSubgraph('A', { x: 180, y: 100 })
      expect(useStore.getState().nodes.find(node => node.id === 'A')?.parentId).toBe('SG1')
      expect(useStore.getState().history.past).toHaveLength(0)

      useStore.getState().removeFromSubgraph('A', { x: 420, y: 100 })
      const promoted = useStore.getState().nodes.find(node => node.id === 'A')
      expect(promoted?.parentId).toBeUndefined()
      expect(promoted?.position).toEqual({ x: 420, y: 100 })
      expect(useStore.getState().history.past).toHaveLength(1)
    })
  })

  describe('removeNodes — subgraph deletion with child promotion', () => {
    function makeSubgraph(id: string, pos = { x: 100, y: 100 }): Node<FlowNodeData> {
      return makeNode(id, {
        type: 'subgraphNode',
        data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
        position: pos,
        width: 300,
        height: 200,
      })
    }

    function makeChild(id: string, parentId: string, pos = { x: 50, y: 50 }): Node<FlowNodeData> {
      return { ...makeNode(id, { position: pos }), parentId, extent: 'parent' as const }
    }

    it('deleting subgraph promotes child regular node to top-level (parentId cleared)', () => {
      const sg = makeSubgraph('SG1', { x: 100, y: 100 })
      const child = makeChild('A', 'SG1', { x: 50, y: 50 })
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeNodes(['SG1'])
      const promoted = useStore.getState().nodes.find(n => n.id === 'A')
      expect(promoted?.parentId).toBeUndefined()
    })

    it('promoted child position is absolute (parent.pos + child.pos)', () => {
      const sg = makeSubgraph('SG1', { x: 100, y: 100 })
      const child = makeChild('A', 'SG1', { x: 50, y: 60 })
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeNodes(['SG1'])
      const promoted = useStore.getState().nodes.find(n => n.id === 'A')
      expect(promoted?.position).toEqual({ x: 150, y: 160 })
    })

    it('promoted child has extent cleared', () => {
      const sg = makeSubgraph('SG1', { x: 0, y: 0 })
      const child = makeChild('A', 'SG1', { x: 20, y: 20 })
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeNodes(['SG1'])
      const promoted = useStore.getState().nodes.find(n => n.id === 'A')
      expect(promoted?.extent).toBeUndefined()
    })

    it('deleting subgraph that contains a nested subgraph promotes the nested subgraph to top-level', () => {
      const outer = makeSubgraph('OUTER', { x: 0, y: 0 })
      const inner = { ...makeSubgraph('INNER', { x: 10, y: 10 }), parentId: 'OUTER', extent: 'parent' as const }
      useStore.setState({ nodes: [outer, inner], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeNodes(['OUTER'])
      const promotedInner = useStore.getState().nodes.find(n => n.id === 'INNER')
      expect(promotedInner).toBeDefined()
      expect(promotedInner?.parentId).toBeUndefined()
    })

    it('deletion + promotion creates exactly one undo-able history entry', () => {
      const sg = makeSubgraph('SG1', { x: 0, y: 0 })
      const child = makeChild('A', 'SG1', { x: 20, y: 20 })
      useStore.setState({ nodes: [sg, child], edges: [], history: { past: [], future: [] } })
      const before = useStore.getState().history.past.length
      useStore.getState().removeNodes(['SG1'])
      expect(useStore.getState().history.past.length).toBe(before + 1)
      useStore.getState().undo()
      expect(useStore.getState().nodes.find(n => n.id === 'SG1')).toBeDefined()
      expect(useStore.getState().nodes.find(n => n.id === 'A')?.parentId).toBe('SG1')
    })

    it('edges connected to deleted subgraph are removed but edges between promoted children are preserved', () => {
      const sg = makeSubgraph('SG1', { x: 0, y: 0 })
      const childA = makeChild('A', 'SG1', { x: 20, y: 20 })
      const childB = makeChild('B', 'SG1', { x: 60, y: 20 })
      useStore.setState({
        nodes: [sg, childA, childB],
        edges: [
          makeEdge('e-sg-a', 'SG1', 'A'),
          makeEdge('e-a-b', 'A', 'B'),
        ],
        history: { past: [], future: [] },
      })
      useStore.getState().removeNodes(['SG1'])
      const { edges } = useStore.getState()
      expect(edges.find(e => e.id === 'e-sg-a')).toBeUndefined()
      expect(edges.find(e => e.id === 'e-a-b')).toBeDefined()
    })
  })

  describe('setEdgeStyle', () => {
    it('changes edge style and records one history entry', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().setEdgeStyle('e1', 'dotted')
      expect(useStore.getState().edges[0].data?.style).toBe('dotted')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('undo() after setEdgeStyle reverts to previous style', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().setEdgeStyle('e1', 'thick')
      useStore.getState().undo()
      expect(useStore.getState().edges[0].data?.style).toBe('arrow')
    })

    it('setting same style is a no-op — no history entry created', () => {
      useStore.setState({
        nodes: [],
        edges: [makeEdge('e1', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().setEdgeStyle('e1', 'arrow')
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('non-existent edge id is a no-op — no history entry created', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().setEdgeStyle('nonexistent', 'dotted')
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('updateNodeShape', () => {
    it('changes the node shape and creates a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateNodeShape('a', 'diamond')
      expect(useStore.getState().nodes[0].data.shape).toBe('diamond')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('is a no-op when shape is unchanged (same shape reference)', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      const before = useStore.getState().history.past.length
      useStore.getState().updateNodeShape('a', 'rectangle')
      expect(useStore.getState().history.past.length).toBe(before)
    })

    it('is a no-op while the canvas is locked', () => {
      useStore.setState({ isLocked: true, nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateNodeShape('a', 'diamond')
      expect(useStore.getState().nodes[0].data.shape).toBe('rectangle')
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('duplicateNode', () => {
    it('creates a new node at GRID_SNAP offset from original', () => {
      useStore.setState({
        nodes: [makeNode('a', { position: { x: 100, y: 200 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().duplicateNode('a')
      const { nodes } = useStore.getState()
      const copy = nodes.find(n => n.id !== 'a')!
      expect(copy.position).toEqual({ x: 100 + GRID_SNAP, y: 200 + GRID_SNAP })
    })

    it('new node has a different id from original', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().duplicateNode('a')
      const { nodes } = useStore.getState()
      expect(nodes).toHaveLength(2)
      expect(nodes[0].id).toBe('a')
      expect(nodes[1].id).not.toBe('a')
    })

    it('duplicated node is selected, original is deselected', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().duplicateNode('a')
      const { nodes } = useStore.getState()
      const original = nodes.find(n => n.id === 'a')!
      const copy = nodes.find(n => n.id !== 'a')!
      expect(original.selected).toBe(false)
      expect(copy.selected).toBe(true)
    })

    it('is a no-op for unknown node id', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().duplicateNode('nonexistent')
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('creates one history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().duplicateNode('a')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('is a no-op while the canvas is locked', () => {
      useStore.setState({ isLocked: true, nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().duplicateNode('a')
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('updateNodeColors', () => {
    it('updates fillColor and creates a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateNodeColors('a', { fillColor: '#1e2a3a' })
      expect(useStore.getState().nodes[0].data.fillColor).toBe('#1e2a3a')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('updates strokeColor and creates a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateNodeColors('a', { strokeColor: '#3a6a8a' })
      expect(useStore.getState().nodes[0].data.strokeColor).toBe('#3a6a8a')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('updates textColor and creates a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateNodeColors('a', { textColor: '#79b3d3' })
      expect(useStore.getState().nodes[0].data.textColor).toBe('#79b3d3')
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('reset (all undefined) clears color overrides', () => {
      useStore.setState({
        nodes: [makeNode('a', { data: { label: 'Node a', shape: 'rectangle', fillColor: '#1e2a3a', strokeColor: '#3a6a8a', textColor: '#79b3d3' } })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().updateNodeColors('a', { fillColor: undefined, strokeColor: undefined, textColor: undefined })
      const d = useStore.getState().nodes[0].data
      expect(d.fillColor).toBeUndefined()
      expect(d.strokeColor).toBeUndefined()
      expect(d.textColor).toBeUndefined()
      expect(useStore.getState().history.past).toHaveLength(1)
    })

    it('is a no-op when colors are unchanged', () => {
      useStore.setState({
        nodes: [makeNode('a', { data: { label: 'Node a', shape: 'rectangle', fillColor: '#1e2a3a' } })],
        edges: [],
        history: { past: [], future: [] },
      })
      const before = useStore.getState().history.past.length
      useStore.getState().updateNodeColors('a', { fillColor: '#1e2a3a' })
      expect(useStore.getState().history.past.length).toBe(before)
    })

    it('is a no-op for unknown node id', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().updateNodeColors('nonexistent', { fillColor: '#1e2a3a' })
      expect(useStore.getState().history.past).toHaveLength(0)
    })
  })

  describe('updateNodeStrokeWidth', () => {
    it('updates the node stroke width and creates a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })

      useStore.getState().updateNodeStrokeWidth('a', 4)

      expect(useStore.getState().nodes[0].data.strokeWidth).toBe(4)
      expect(useStore.getState().history.past).toHaveLength(1)
    })
  })

  describe('updateNodeTextAlignment', () => {
    it('updates horizontal and vertical text alignment in one history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })

      useStore.getState().updateNodeTextAlignment('a', { horizontal: 'right', vertical: 'top' })

      expect(useStore.getState().nodes[0].data).toMatchObject({ textHorizontalAlign: 'right', textVerticalAlign: 'top' })
      expect(useStore.getState().history.past).toHaveLength(1)
    })
  })

  describe('toggleNodeLock', () => {
    it('sets draggable to false when node is draggable (unlocked)', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().toggleNodeLock('a')
      expect(useStore.getState().nodes[0].draggable).toBe(false)
    })

    it('sets draggable to true when node is locked (draggable: false)', () => {
      useStore.setState({
        nodes: [makeNode('a', { draggable: false })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().toggleNodeLock('a')
      expect(useStore.getState().nodes[0].draggable).toBe(true)
    })

    it('creates one history entry per toggle', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      useStore.getState().toggleNodeLock('a')
      expect(useStore.getState().history.past).toHaveLength(1)
      useStore.getState().toggleNodeLock('a')
      expect(useStore.getState().history.past).toHaveLength(2)
    })
  })

  describe('setFilename', () => {
    it('updates filename in the store', () => {
      useStore.getState().setFilename('my-diagram.mmd')
      expect(useStore.getState().filename).toBe('my-diagram.mmd')
    })

    it('does not create a history entry when filename is set', () => {
      const before = useStore.getState().history.past.length
      useStore.getState().setFilename('another.mmd')
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('setSyncDirection', () => {
    it('sets syncDirection to "canvas"', () => {
      useStore.getState().setSyncDirection('canvas')
      expect(useStore.getState().syncDirection).toBe('canvas')
    })

    it('does not create a history entry', () => {
      const historyBefore = useStore.getState().history.past.length
      useStore.getState().setSyncDirection('canvas')
      expect(useStore.getState().history.past.length).toBe(historyBefore)
    })
  })

  describe('importFromCode', () => {
    function makeParsedNode(id: string, label = id) {
      return {
        id,
        type: 'flowNode' as const,
        position: { x: 0, y: 0 },
        data: { label, shape: 'rectangle' as const },
      }
    }

    it('adds new nodes from parsed result', () => {
      useStore.setState({ nodes: [], edges: [], history: { past: [], future: [] } })
      useStore.getState().importFromCode({
        nodes: [makeParsedNode('A'), makeParsedNode('B')],
        edges: [],
        passthroughLines: [],
      })
      expect(useStore.getState().nodes).toHaveLength(2)
    })

    it('preserves positions of existing nodes by ID', () => {
      const existing = makeNode('A', { position: { x: 100, y: 200 } })
      useStore.setState({ nodes: [existing], edges: [], history: { past: [], future: [] } })
      useStore.getState().importFromCode({
        nodes: [makeParsedNode('A')],
        edges: [],
        passthroughLines: [],
      })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 100, y: 200 })
    })

    it('preserves fill/stroke/textColor of existing nodes', () => {
      const existing = makeNode('A', {
        data: { label: 'A', shape: 'rectangle', fillColor: '#111', strokeColor: '#222', textColor: '#333' },
      })
      useStore.setState({ nodes: [existing], edges: [], history: { past: [], future: [] } })
      useStore.getState().importFromCode({
        nodes: [makeParsedNode('A')],
        edges: [],
        passthroughLines: [],
      })
      const updated = useStore.getState().nodes[0]
      expect(updated.data.fillColor).toBe('#111')
      expect(updated.data.strokeColor).toBe('#222')
      expect(updated.data.textColor).toBe('#333')
    })

    it('replaces edges with parsed edges', () => {
      useStore.setState({
        nodes: [makeNode('A'), makeNode('B')],
        edges: [makeEdge('e-old', 'A', 'B')],
        history: { past: [], future: [] },
      })
      useStore.getState().importFromCode({
        nodes: [makeParsedNode('A'), makeParsedNode('B')],
        edges: [{ id: 'e-new', source: 'A', target: 'B', type: 'default', data: { style: 'arrow' as const } }],
        passthroughLines: [],
      })
      expect(useStore.getState().edges).toHaveLength(1)
      expect(useStore.getState().edges[0].id).toBe('e-new')
    })

    it('is a no-op when nodes and edges are semantically unchanged — no history entry', () => {
      const existing = makeNode('A', { data: { label: 'A', shape: 'rectangle' } })
      useStore.setState({ nodes: [existing], edges: [], history: { past: [], future: [] } })
      const before = useStore.getState().history.past.length
      useStore.getState().importFromCode({
        nodes: [makeParsedNode('A', 'A')],
        edges: [],
        passthroughLines: [],
      })
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('isDirty', () => {
    it('defaults to false', () => {
      expect(useStore.getState().isDirty).toBe(false)
    })

    it('is set to true after any withHistory() mutation (e.g. addNode)', () => {
      useStore.getState().addNode(makeNode('a'))
      expect(useStore.getState().isDirty).toBe(true)
    })

    it('clearDirty() resets isDirty to false', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().clearDirty()
      expect(useStore.getState().isDirty).toBe(false)
    })
  })

  describe('fitViewRequested', () => {
    it('defaults to false', () => {
      expect(useStore.getState().fitViewRequested).toBe(false)
    })

    it('requestFitView() sets fitViewRequested to true', () => {
      useStore.getState().requestFitView()
      expect(useStore.getState().fitViewRequested).toBe(true)
    })

    it('clearFitViewRequest() sets fitViewRequested to false', () => {
      useStore.getState().requestFitView()
      useStore.getState().clearFitViewRequest()
      expect(useStore.getState().fitViewRequested).toBe(false)
    })
  })

  describe('command palette transient state', () => {
    it('commandPaletteOpen is false by default', () => {
      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })

    it('openCommandPalette sets commandPaletteOpen to true', () => {
      useStore.getState().openCommandPalette()
      expect(useStore.getState().commandPaletteOpen).toBe(true)
    })

    it('closeCommandPalette sets commandPaletteOpen to false', () => {
      useStore.getState().openCommandPalette()
      useStore.getState().closeCommandPalette()
      expect(useStore.getState().commandPaletteOpen).toBe(false)
    })

    it('requestAddNode sets pendingAddNode with the given shape', () => {
      useStore.getState().requestAddNode('diamond')
      expect(useStore.getState().pendingAddNode).toEqual({ shape: 'diamond' })
    })

    it('clearPendingAddNode sets pendingAddNode to null', () => {
      useStore.getState().requestAddNode('circle')
      useStore.getState().clearPendingAddNode()
      expect(useStore.getState().pendingAddNode).toBeNull()
    })

    it('dispatchZoomAction sets pendingZoomAction to the given type', () => {
      useStore.getState().dispatchZoomAction('fit')
      expect(useStore.getState().pendingZoomAction).toBe('fit')
    })

    it('clearPendingZoomAction sets pendingZoomAction to null', () => {
      useStore.getState().dispatchZoomAction('in')
      useStore.getState().clearPendingZoomAction()
      expect(useStore.getState().pendingZoomAction).toBeNull()
    })

    it('openCommandPalette and closeCommandPalette do NOT create history entries', () => {
      const before = useStore.getState().history.past.length
      useStore.getState().openCommandPalette()
      useStore.getState().closeCommandPalette()
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('keyboard shortcut actions', () => {
    it('selectAll sets selected: true on all nodes including subgraph nodes', () => {
      useStore.setState({
        nodes: [makeNode('a'), makeNode('b', { data: { label: 'b', shape: 'subgraph', isSubgraph: true } })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().selectAll()
      expect(useStore.getState().nodes.every(n => n.selected)).toBe(true)
    })

    it('selectAll does not create a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      const before = useStore.getState().history.past.length
      useStore.getState().selectAll()
      expect(useStore.getState().history.past.length).toBe(before)
    })

    it('duplicateNodes creates copies with new IDs at +48px offset', () => {
      useStore.setState({
        nodes: [makeNode('a', { position: { x: 100, y: 200 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().duplicateNodes(['a'])
      const { nodes } = useStore.getState()
      expect(nodes).toHaveLength(2)
      const copy = nodes.find(n => n.id !== 'a')!
      expect(copy.position).toEqual({ x: 148, y: 248 })
    })

    it('duplicateNodes skips nodes with parentId', () => {
      useStore.setState({
        nodes: [makeNode('a', { parentId: 'sg1' })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().duplicateNodes(['a'])
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('duplicateNodes skips subgraph nodes (data.isSubgraph: true)', () => {
      useStore.setState({
        nodes: [makeNode('a', { data: { label: 'Group', shape: 'subgraph', isSubgraph: true } })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().duplicateNodes(['a'])
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().history.past).toHaveLength(0)
    })

    it('duplicateNodes selects copies and deselects originals', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true })],
        edges: [],
        history: { past: [], future: [] },
      })
      useStore.getState().duplicateNodes(['a'])
      const { nodes } = useStore.getState()
      const original = nodes.find(n => n.id === 'a')!
      const copy = nodes.find(n => n.id !== 'a')!
      expect(original.selected).toBe(false)
      expect(copy.selected).toBe(true)
    })

    it('duplicateNodes creates a history entry', () => {
      useStore.setState({ nodes: [makeNode('a')], edges: [], history: { past: [], future: [] } })
      const before = useStore.getState().history.past.length
      useStore.getState().duplicateNodes(['a'])
      expect(useStore.getState().history.past.length).toBe(before + 1)
    })

    it('duplicateNodes is a no-op when no eligible nodes', () => {
      useStore.setState({
        nodes: [makeNode('a', { parentId: 'sg1' })],
        edges: [],
        history: { past: [], future: [] },
      })
      const before = useStore.getState().history.past.length
      useStore.getState().duplicateNodes(['a'])
      expect(useStore.getState().history.past.length).toBe(before)
      expect(useStore.getState().nodes).toHaveLength(1)
    })

    it('announce sets announcement string', () => {
      useStore.getState().announce('test message')
      expect(useStore.getState().announcement).toBe('test message')
    })

    it('clearAnnouncement sets announcement to null', () => {
      useStore.getState().announce('hello')
      useStore.getState().clearAnnouncement()
      expect(useStore.getState().announcement).toBeNull()
    })

    it('addNode sets announcement to "Node added"', () => {
      useStore.getState().addNode(makeNode('a'))
      expect(useStore.getState().announcement).toBe('Node added')
    })

    it('removeNodes sets announcement with correct deletion count', () => {
      useStore.setState({ nodes: [makeNode('a'), makeNode('b')], edges: [], history: { past: [], future: [] } })
      useStore.getState().removeNodes(['a', 'b'])
      expect(useStore.getState().announcement).toBe('Deleted 2 nodes')
    })

    it('undo sets announcement to "Undo"', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      expect(useStore.getState().announcement).toBe('Undo')
    })

    it('redo sets announcement to "Redo"', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      useStore.getState().redo()
      expect(useStore.getState().announcement).toBe('Redo')
    })

    it('undo is silent (no announcement) when nothing to undo', () => {
      useStore.getState().undo()
      expect(useStore.getState().announcement).toBeNull()
    })
  })
  describe('edge selection', () => {
    // Regression: edges were rendered from a controlled prop with no onEdgesChange
    // handler and no selection state, so no edge could ever become selected and the
    // selected-edge toolbar (style, route mode, waypoints) was unreachable in the
    // real app. FlowEdge's own tests passed because they force `selected` directly.
    it('applyEdgeFlowChanges stores edge selection', () => {
      useStore.setState({ edges: [{ id: 'e1', source: 'a', target: 'b' }] })
      const selected = useStore.getState().edges.map(e => ({ ...e, selected: true }))
      useStore.getState().applyEdgeFlowChanges(selected)
      expect(useStore.getState().edges[0].selected).toBe(true)
    })

    it('deselectAll clears edge selection as well as node selection', () => {
      useStore.setState({
        nodes: [{ ...makeNode('a'), selected: true }],
        edges: [{ id: 'e1', source: 'a', target: 'b', selected: true }],
      })
      useStore.getState().deselectAll()
      expect(useStore.getState().nodes[0].selected).toBe(false)
      expect(useStore.getState().edges[0].selected).toBe(false)
    })
  })
})
