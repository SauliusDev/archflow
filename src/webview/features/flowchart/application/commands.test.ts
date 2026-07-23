import { describe, expect, it } from 'vitest'
import { createDocumentSession } from '../../../lib/documentSession'
import type { LayoutStateV2 } from '../../../../shared/diagram-contracts'
import { flowchartCompatibilityAdapter } from './adapter'
import {
  executeFlowchartAutoLayoutCommand,
  commitFlowchartGeometryTransaction,
  executeFlowchartCommand,
  executeFlowchartEdgeRoutingCommand,
  executeFlowchartNodeConnectionCommand,
  executeFlowchartTextAlignmentCommand,
  executeFlowchartLaneCommand,
  executeFlowchartSubgraphMembershipCommand,
  executeFlowchartSubgraphCommand,
  materializeFlowchartSourceImportLayout,
  withCurvedFlowchartRoute,
} from './commands'

const layout: LayoutStateV2 = {
  version: 2,
  diagramFamily: 'flowchart',
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: {},
  edges: {},
  constraints: [],
  adapterMetadata: {},
}

function session(source = 'flowchart LR\n  A[Alpha]\n'): ReturnType<typeof createDocumentSession> {
  return createDocumentSession('flowchart-command', 1, flowchartCompatibilityAdapter.parse(source, 1), layout)
}

const dependencies = { createId: () => 'flowchart-transaction' }

function node(id: string, x: number, y: number) {
  return { id, position: { x, y }, width: 80, height: 40, data: { label: id, shape: 'rectangle' as const } }
}

describe('executeFlowchartCommand', () => {
  it('keeps surviving edge routes with their connections when deleting an earlier edge', () => {
    const source = [
      'flowchart TD',
      '  User([User]) --> Web[Web App]',
      '  Web -->|API request| Service[Application Service]',
      '  Service e3@==> Database[(Database)]',
      '  Service -->|Send notification| Email[Email Provider]',
      '  Email -->|Delivery status| DeliveryStatus[Delivery Status]',
      '  Web e6@-->|API response| Response[Response]',
      '  Response --> User',
      '  DeliveryStatus e8@--> Email',
      '',
    ].join('\n')
    const current = {
      ...createDocumentSession('delete-edge-layout', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      elements: {
        'node:Database': { x: 400, y: 300, width: 137, height: 135 },
        'node:Ghost': { x: 0, y: 0, width: 10, height: 10 },
      },
      edges: {
        'edge:e3': { routeMode: 'curved', sourceSide: 'right', targetSide: 'left' },
        'edge:e4': { routeMode: 'curved', sourceSide: 'bottom', targetSide: 'top' },
        'edge:e5': { routeMode: 'curved', sourceSide: 'bottom', targetSide: 'top' },
        'edge:e6': { routeMode: 'curved', sourceSide: 'right', targetSide: 'bottom' },
        'edge:e7': { routeMode: 'curved', sourceSide: 'left', targetSide: 'right' },
        'edge:e8': { routeMode: 'curved', sourceSide: 'top', targetSide: 'bottom' },
      },
      }),
      selection: ['edge:e3'] as const,
    }

    const result = executeFlowchartCommand(current, {
      operations: [{ kind: 'delete-edge', id: 'e3' }], description: 'Delete edge e3',
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.edges).toEqual({
      'edge:e3': { routeMode: 'curved', sourceSide: 'bottom', targetSide: 'top' },
      'edge:e4': { routeMode: 'curved', sourceSide: 'bottom', targetSide: 'top' },
      'edge:e5': { routeMode: 'curved', sourceSide: 'left', targetSide: 'right' },
      'edge:e6': { routeMode: 'curved', sourceSide: 'right', targetSide: 'bottom' },
      'edge:e8': { routeMode: 'curved', sourceSide: 'top', targetSide: 'bottom' },
    })
    expect(result.value.layout.elements).toHaveProperty('node:Database')
    expect(result.value.layout.elements).not.toHaveProperty('node:Ghost')
    expect(result.value.selection).toEqual([])
  })

  it('persists text alignment as a layout-only transaction without rewriting Mermaid', () => {
    const current = session()
    const result = executeFlowchartTextAlignmentCommand(current, 'A', { horizontal: 'right', vertical: 'bottom' }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toBe(current.source)
    expect(result.value.layout.adapterMetadata).toEqual({ flowchart: { textAlignments: { A: { horizontal: 'right', vertical: 'bottom' } } } })
    expect(result.value.history.past).toEqual([expect.objectContaining({ description: 'Align text in A' })])
  })

  it('persists node connection policy as a layout-only transaction', () => {
    const source = 'flowchart LR\n  A[Alpha]\n'
    const current = createDocumentSession('node-connection-policy', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      adapterMetadata: { flowchart: { unknown: { preserved: true } } },
    })
    const result = executeFlowchartNodeConnectionCommand(current, {
      kind: 'set-policy',
      policy: { mode: 'side', autoReassign: true },
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toBe(current.source)
    expect(result.value.layout.adapterMetadata).toEqual({
      flowchart: { unknown: { preserved: true }, nodeConnections: { mode: 'side', autoReassign: true } },
    })
    expect(result.value.history.past[0]).toMatchObject({ forward: [], inverse: [] })
  })

  it('assigns an endpoint side without replacing the route or waypoints', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const current = createDocumentSession('edge-side-command', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      edges: { 'edge:e1': { routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }] } },
    })
    const result = executeFlowchartNodeConnectionCommand(current, {
      kind: 'set-edge-side', edgeId: 'e1', endpoint: 'source', side: 'right',
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toBe(source)
    expect(result.value.layout.edges['edge:e1']).toEqual({
      routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }], sourceSide: 'right',
    })
  })

  it('retargets one edge endpoint while preserving the edge id and route layout', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  C[Charlie]\n  A e1@--> B\n'
    const current = createDocumentSession('edge-retarget-command', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      edges: { 'edge:e1': { routeMode: 'curved', sourceSide: 'bottom', targetSide: 'right' } },
    })
    const result = executeFlowchartNodeConnectionCommand(current, {
      kind: 'retarget-edge', edgeId: 'e1', endpoint: 'target', nodeId: 'C', side: 'left',
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toContain('A e1@--> C')
    expect(result.value.layout.edges['edge:e1']).toEqual({ routeMode: 'curved', sourceSide: 'bottom', targetSide: 'left' })
  })

  it('adds a curved route default to the layout-only portion of a semantic edge transaction', () => {
    const current = session('flowchart LR\n  A[Alpha]\n  B[Beta]\n')
    const result = executeFlowchartCommand(current, {
      operations: [{ kind: 'add-edge', id: 'e2', source: 'A', target: 'B', style: 'arrow' }],
      description: 'Add edge e2',
      layout: withCurvedFlowchartRoute(current.layout, 'e2'),
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.edges['edge:e2']).toEqual({ routeMode: 'curved' })
    expect(result.value.source).toBe('flowchart LR\n  A[Alpha]\n  B[Beta]\n  A e2@--> B\n')
    expect(result.value.source).not.toContain('curved')
  })

  it('preserves opaque source while committing selection, layout, revision, and history atomically', () => {
    const source = '%% keep\nflowchart LR\n  A[Alpha]\n'
    const result = executeFlowchartCommand(session(source), {
      operations: [{ kind: 'rename-node', id: 'A', label: 'Beta' }],
      description: 'Rename A',
      selection: ['node:A'],
      layout: { ...layout, elements: { 'node:A': { x: 80, y: 48 } } },
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toBe('%% keep\nflowchart LR\n  A[Beta]\n')
    expect(result.value.selection).toEqual(['node:A'])
    expect(result.value.layout.elements['node:A']).toEqual({ x: 80, y: 48 })
    expect(result.value.workingRevision).toBe(2)
    expect(result.value.history.past).toHaveLength(1)
    expect(result.value.history.past[0]).toMatchObject({ id: 'flowchart-transaction', description: 'Rename A' })
  })

  it('groups a new subgraph and its member moves into one source transaction', () => {
    const result = executeFlowchartCommand(session('flowchart LR\n  A[Alpha]\n  B[Bravo]\n  OUT[Outside]\n'), {
      operations: [
        { kind: 'add-subgraph', id: 'Group', label: 'Group' },
        { kind: 'move-node-to-subgraph', id: 'A', subgraphId: 'Group' },
        { kind: 'move-node-to-subgraph', id: 'B', subgraphId: 'Group' },
      ],
      description: 'Add group',
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toContain('subgraph Group [Group]\n      A[Alpha]\n      B[Bravo]\n  end')
    expect(result.value.history.past).toHaveLength(1)
  })

  it('rejects a non-flowchart session', () => {
    const wrongFamily = { ...session(), family: 'class' as const }
    expect(executeFlowchartCommand(wrongFamily, { operations: [], description: 'No-op' }, dependencies)).toMatchObject({
      ok: false,
      code: 'unsupported-family',
    })
  })

  it('rejects unresolved external conflicts and invalid source operations without mutation', () => {
    const conflicted = { ...session(), conflict: { eventId: 'external', content: '', hostRevision: 2, projection: session().projection, layout } }
    expect(executeFlowchartCommand(conflicted, { operations: [], description: 'No-op' }, dependencies)).toMatchObject({
      ok: false,
      code: 'external-conflict',
    })
    expect(executeFlowchartCommand(session(), {
      operations: [{ kind: 'rename-node', id: 'missing', label: 'Beta' }],
      description: 'Invalid rename',
    }, dependencies)).toMatchObject({ ok: false, code: 'invalid-operation' })
    const current = session()
    const stale = { ...current, projection: { ...current.projection, concrete: { ...current.projection.concrete, revision: 7 } } }
    expect(executeFlowchartCommand(stale, {
      operations: [{ kind: 'rename-node', id: 'A', label: 'Beta' }],
      description: 'Stale rename',
    }, dependencies)).toMatchObject({ ok: false, code: 'stale-transaction' })
  })

  it('classifies unexpected executor exceptions as safe internal failures', () => {
    const result = executeFlowchartCommand(
      session(),
      { operations: [{ kind: 'rename-node', id: 'A', label: 'Beta' }], description: 'Rename A' },
      { createId: () => { throw new Error('credential=super-secret') } },
    )

    expect(result).toMatchObject({ ok: false, code: 'internal-error' })
    if (result.ok) return
    expect(result.message).not.toContain('super-secret')
  })

  it('does not misclassify arbitrary semantic planning exceptions as validation failures', () => {
    const explosiveOperation = Object.defineProperty({}, 'kind', {
      get: () => { throw new Error('credential=super-secret already exists') },
    })
    const result = executeFlowchartCommand(
      session(),
      { operations: [explosiveOperation] as never, description: 'Explosive operation' },
      dependencies,
    )

    expect(result).toMatchObject({ ok: false, code: 'internal-error' })
    if (result.ok) return
    expect(result.message).not.toContain('super-secret')
  })

  it('commits auto-layout geometry and route reset as one deterministic layout transaction', () => {
    const current = createDocumentSession('auto-layout', 1, flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n', 1), {
      ...layout,
      elements: { 'node:A': { x: 0, y: 0 }, 'node:B': { x: 400, y: 100 } },
      edges: { 'edge:A:B:0': { routeMode: 'orthogonal' } },
    })
    const result = executeFlowchartAutoLayoutCommand(current, [node('A', 0, 0), node('B', 400, 100)], [{ id: 'edge', source: 'A', target: 'B' }], dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.session.layout.edges).toEqual({})
    expect(result.value.session.history.past).toEqual([expect.objectContaining({ id: 'flowchart-transaction', description: 'Apply auto-layout and reset routes' })])
    expect(result.value.session.source).toBe(current.source)
    expect(result.value.nodes).not.toEqual([node('A', 0, 0), node('B', 400, 100)])
  })

  it('derives lane order and deletion geometry inside a lane command', () => {
    const source = 'flowchart TD\n  subgraph Lane [Lane]\n    subgraph Nested [Nested]\n      A[Alpha]\n    end\n  end\n  B[Beta]\n'
    const current = createDocumentSession('lane-command', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      elements: { 'node:Lane': { x: 0, y: 0 }, 'node:Nested': { x: 10, y: 10 }, 'node:A': { x: 20, y: 20 }, 'node:B': { x: 30, y: 30 } },
      adapterMetadata: { flowchart: { laneOrder: ['Lane'] } },
    })
    const result = executeFlowchartLaneCommand(current, { kind: 'delete', id: 'Lane', disposition: 'delete-contents' }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toBe('flowchart TD\n  B[Beta]\n')
    expect(result.value.layout.elements).toEqual({ 'node:B': { x: 30, y: 30 } })
    expect(result.value.layout.adapterMetadata).toEqual({ flowchart: { laneOrder: [] } })
  })

  it('creates a positioned subgraph and moves enclosed top-level nodes in one command', () => {
    const result = executeFlowchartSubgraphCommand(session('flowchart LR\n  A[Alpha]\n  OUT[Outside]\n'), {
      id: 'Group',
      position: { x: 96, y: 96 },
      nodes: [node('A', 120, 144), node('OUT', 432, 144)],
    }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.nodes.find(item => item.id === 'A')).toMatchObject({ parentId: 'Group', position: { x: 24, y: 48 }, extent: 'parent' })
    expect(result.value.session.source).toContain('subgraph Group [Group]')
    expect(result.value.session.layout.elements['node:Group']).toEqual({ x: 96, y: 96, width: 300, height: 200 })
  })

  it('moves a node into a subgraph with its relative geometry in one command', () => {
    const current = createDocumentSession('membership-command', 1, flowchartCompatibilityAdapter.parse('flowchart LR\n  subgraph Group [Group]\n  end\n  A[Alpha]\n', 1), {
      ...layout,
      elements: { 'node:Group': { x: 96, y: 96, width: 300, height: 200 }, 'node:A': { x: 120, y: 144, width: 80, height: 40 } },
    })
    const result = executeFlowchartSubgraphMembershipCommand(current, [
      { ...node('Group', 96, 96), type: 'subgraphNode', width: 300, height: 200, data: { label: 'Group', shape: 'subgraph', isSubgraph: true } },
      node('A', 120, 144),
    ], { kind: 'assign', nodeId: 'A', subgraphId: 'Group', position: { x: 24, y: 48 } }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.nodes.find(item => item.id === 'A')).toMatchObject({ parentId: 'Group', position: { x: 24, y: 48 }, extent: 'parent' })
    expect(result.value.session.layout.elements['node:A']).toMatchObject({ x: 24, y: 48 })
    expect(result.value.session.source).toContain('    A[Alpha]')
  })

  it('commits route-mode and waypoint mutations as deterministic layout transactions', () => {
    const current = createDocumentSession('edge-route-command', 1, flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n', 1), layout)
    const ids = ['route-mode', 'route-add', 'route-move', 'route-remove']
    const routeDependencies = { createId: () => ids.shift()! }
    const edgeId = (current.projection.model as { edges: Array<{ id: string }> }).edges[0].id

    const mode = executeFlowchartEdgeRoutingCommand(current, { kind: 'set-mode', id: edgeId, routeMode: 'manual' }, routeDependencies)
    expect(mode).toMatchObject({ ok: true })
    if (!mode.ok) return
    const add = executeFlowchartEdgeRoutingCommand(mode.value, { kind: 'add-waypoint', id: edgeId, point: { x: 80, y: 40 } }, routeDependencies)
    expect(add).toMatchObject({ ok: true })
    if (!add.ok) return
    const move = executeFlowchartEdgeRoutingCommand(add.value, { kind: 'move-waypoint', id: edgeId, index: 0, point: { x: 96, y: 48 } }, routeDependencies)
    expect(move).toMatchObject({ ok: true })
    if (!move.ok) return
    const remove = executeFlowchartEdgeRoutingCommand(move.value, { kind: 'remove-waypoint', id: edgeId, index: 0 }, routeDependencies)

    expect(remove).toMatchObject({ ok: true })
    if (!remove.ok) return
    expect(remove.value.source).toBe(current.source)
    expect(remove.value.layout.edges[`edge:${edgeId}`]).toEqual({ routeMode: 'orthogonal' })
    expect(remove.value.history.past.map(transaction => transaction.id)).toEqual(['route-mode', 'route-add', 'route-move', 'route-remove'])
    expect(remove.value.history.past.map(transaction => transaction.description)).toEqual([
      `Route edge ${edgeId} as orthogonal`,
      `Add waypoint to ${edgeId}`,
      `Move waypoint on ${edgeId}`,
      `Remove waypoint from ${edgeId}`,
    ])
  })

  it('replaces legacy automatic metadata through an explicit layout-only route transaction', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const initial = createDocumentSession('legacy-automatic-route', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      edges: { 'edge:e1': { routeMode: 'automatic' } },
    })
    const result = executeFlowchartEdgeRoutingCommand(initial, { kind: 'set-mode', id: 'e1', routeMode: 'curved' }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.edges['edge:e1']).toEqual({ routeMode: 'curved' })
    expect(result.value.source).toBe(source)
  })

  it('preserves fixed endpoint sides when changing a route mode', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const current = createDocumentSession('route-preserves-sides', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      edges: { 'edge:e1': { routeMode: 'straight', sourceSide: 'right', targetSide: 'left' } },
    })

    const result = executeFlowchartEdgeRoutingCommand(current, { kind: 'set-mode', id: 'e1', routeMode: 'curved' }, dependencies)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.edges['edge:e1']).toEqual({ routeMode: 'curved', sourceSide: 'right', targetSide: 'left' })
  })

  it('routes all edges in one layout-only transaction while preserving compatible edge metadata', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  C[Charlie]\n  A e1@--> B\n  B e2@--> C\n'
    const current = createDocumentSession('bulk-edge-route-command', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      edges: {
        'edge:e1': { routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }], sourceSide: 'right', targetSide: 'left' },
        'edge:e2': { routeMode: 'curved', waypoints: [{ x: 160, y: 40 }], sourceSide: 'bottom', targetSide: 'top' },
      },
    })
    const ids = ['bulk-orthogonal', 'bulk-curved']
    const routeDependencies = { createId: () => ids.shift()! }

    const orthogonal = executeFlowchartEdgeRoutingCommand(current, { kind: 'set-all-modes', routeMode: 'orthogonal' }, routeDependencies)

    expect(orthogonal).toMatchObject({ ok: true })
    if (!orthogonal.ok) return
    expect(orthogonal.value.source).toBe(source)
    expect(orthogonal.value.selection).toEqual(current.selection)
    expect(orthogonal.value.layout.edges).toEqual({
      'edge:e1': { routeMode: 'orthogonal', waypoints: [{ x: 80, y: 40 }], sourceSide: 'right', targetSide: 'left' },
      'edge:e2': { routeMode: 'orthogonal', waypoints: [{ x: 160, y: 40 }], sourceSide: 'bottom', targetSide: 'top' },
    })
    expect(orthogonal.value.history.past).toEqual([expect.objectContaining({ description: 'Route all edges as orthogonal', forward: [], inverse: [] })])

    const curved = executeFlowchartEdgeRoutingCommand(orthogonal.value, { kind: 'set-all-modes', routeMode: 'curved' }, routeDependencies)
    expect(curved).toMatchObject({ ok: true })
    if (!curved.ok) return
    expect(curved.value.source).toBe(source)
    expect(curved.value.layout.edges).toEqual({
      'edge:e1': { routeMode: 'curved', sourceSide: 'right', targetSide: 'left' },
      'edge:e2': { routeMode: 'curved', sourceSide: 'bottom', targetSide: 'top' },
    })

    const noOp = executeFlowchartEdgeRoutingCommand(curved.value, { kind: 'set-all-modes', routeMode: 'curved' }, routeDependencies)
    expect(noOp).toMatchObject({ ok: false, code: 'invalid-operation' })
    expect(curved.value.history.past).toHaveLength(2)
  })

  it('treats a persisted matching bulk route layout as a no-op regardless of property order', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A e1@--> B\n'
    const current = createDocumentSession('bulk-edge-route-property-order', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      edges: { 'edge:e1': { sourceSide: 'right', routeMode: 'curved', targetSide: 'left' } },
    })

    const result = executeFlowchartEdgeRoutingCommand(current, { kind: 'set-all-modes', routeMode: 'curved' }, dependencies)

    expect(result).toMatchObject({ ok: false, code: 'invalid-operation' })
    expect(current.history.past).toHaveLength(0)
  })

  it('materializes source-import geometry and keeps a clean session base layout aligned', () => {
    const current = session()
    const materialized = materializeFlowchartSourceImportLayout(current, [node('A', 72, 48), node('B', 216, 48)])

    expect(materialized.layout.elements).toEqual({
      'node:A': { x: 72, y: 48, width: 80, height: 40 },
      'node:B': { x: 216, y: 48, width: 80, height: 40 },
    })
    expect(materialized.baseLayout).toEqual(materialized.layout)
    expect(materialized.dirty).toBe(false)
  })

  it('auto-reassigns only affected edge attachments after geometry moves in Side mode', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const current = createDocumentSession('auto-reassign-enabled', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      elements: { 'node:A': { x: 0, y: 0, width: 80, height: 40 }, 'node:B': { x: 240, y: 0, width: 80, height: 40 } },
      edges: { 'edge:e1': { routeMode: 'straight', sourceSide: 'bottom', targetSide: 'bottom' } },
      adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: true } } },
    })

    const result = commitFlowchartGeometryTransaction(current, [node('A', 0, 0), node('B', 240, 0)], [node('A', 0, 0), node('B', 0, 240)], 'Move B', dependencies)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toBe(source)
    expect(result.value.layout.edges['edge:e1']).toMatchObject({ sourceSide: 'bottom', targetSide: 'top' })
    expect(result.value.history.past[0]).toMatchObject({ forward: [], inverse: [] })
  })

  it('retains attachment sides after geometry moves when auto-reassign is disabled', () => {
    const current = createDocumentSession('auto-reassign-disabled', 1, flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n', 1), {
      ...layout,
      elements: { 'node:A': { x: 0, y: 0, width: 80, height: 40 }, 'node:B': { x: 240, y: 0, width: 80, height: 40 } },
      edges: { 'edge:e1': { routeMode: 'straight', sourceSide: 'bottom', targetSide: 'bottom' } },
      adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: false } } },
    })

    const result = commitFlowchartGeometryTransaction(current, [node('A', 0, 0), node('B', 240, 0)], [node('A', 0, 0), node('B', 0, 240)], 'Move B', dependencies)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.edges['edge:e1']).toMatchObject({ sourceSide: 'bottom', targetSide: 'bottom' })
  })

  it('uses absolute nested-node bounds when auto-reassigning a top-level connection', () => {
    const source = 'flowchart LR\n  subgraph Group [Group]\n    A[Alpha]\n  end\n  B[Beta]\n  A --> B\n'
    const current = createDocumentSession('nested-auto-reassign', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      ...layout,
      elements: {
        'node:Group': { x: 400, y: 0, width: 240, height: 400 },
        'node:A': { x: 0, y: 0, width: 80, height: 40 },
        'node:B': { x: 700, y: 0, width: 80, height: 40 },
      },
      edges: { 'edge:e1': { routeMode: 'straight' } },
      adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: true } } },
    })
    const before = [
      { ...node('Group', 400, 0), width: 240, height: 400, data: { label: 'Group', shape: 'subgraph' as const, isSubgraph: true } },
      { ...node('A', 0, 0), parentId: 'Group' },
      node('B', 700, 0),
    ]
    const after = before.map(item => item.id === 'A' ? { ...item, position: { x: 0, y: 300 } } : item)

    const result = commitFlowchartGeometryTransaction(current, before, after, 'Move nested A', dependencies)
    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.edges['edge:e1']).toMatchObject({ sourceSide: 'top', targetSide: 'bottom' })
  })
})
