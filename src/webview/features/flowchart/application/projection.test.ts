import { describe, expect, it } from 'vitest'
import { createDocumentSession } from '../../../lib/documentSession'
import type { LayoutStateV2 } from '../../../../shared/diagram-contracts'
import { flowchartCompatibilityAdapter } from './adapter'
import { projectFlowchartSession } from './projection'

describe('projectFlowchartSession', () => {
  it('applies durable layout, selection, and source-owned node styling', () => {
    const layout: LayoutStateV2 = {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: { 'node:Lane': { x: 40, y: 20, width: 300, height: 240 }, 'node:A': { x: 24, y: 32, width: 180, height: 80 } },
      edges: { 'edge:e-A-B': { routeMode: 'orthogonal', waypoints: [{ x: 120, y: 48 }], sourceSide: 'bottom', targetSide: 'left' } },
      constraints: [],
      adapterMetadata: { flowchart: { laneOrder: ['Lane'] } },
    }
    const source = 'flowchart LR\n  subgraph Lane [Lane]\n    A[Alpha]\n  end\n  B[Beta]\n  A --> B\n  style A fill:#112233,stroke:#445566,color:#778899\n'
    const session = { ...createDocumentSession('projection', 1, flowchartCompatibilityAdapter.parse(source, 1), layout), selection: ['node:A', 'edge:e-A-B'] }
    const current = [{ id: 'A', position: { x: 0, y: 0 }, data: { label: 'Alpha', shape: 'rectangle', fillColor: '#fff' }, type: 'default' as const }]

    const projected = projectFlowchartSession(session, current)

    expect(projected.nodes.find(node => node.id === 'Lane')).toMatchObject({ position: { x: 40, y: 20 }, data: { isLane: true }, zIndex: 0 })
    expect(projected.nodes.find(node => node.id === 'A')).toMatchObject({ position: { x: 24, y: 32 }, selected: true, data: { fillColor: '#112233', strokeColor: '#445566', textColor: '#778899' } })
    expect(projected.edges[0]).toMatchObject({ selected: true, data: { routeMode: 'orthogonal', waypoints: [{ x: 120, y: 48 }], sourceSide: 'bottom', targetSide: 'left' } })
  })

  it('retains legacy automatic metadata for the straight-path fallback', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const session = createDocumentSession('projection-legacy-route', 1, flowchartCompatibilityAdapter.parse(source, 1), {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: {},
      edges: { 'edge:e-A-B': { routeMode: 'automatic' } },
      constraints: [],
    })

    expect(projectFlowchartSession(session, []).edges[0].data?.routeMode).toBe('automatic')
  })

  it('projects persisted text alignment independently on both axes', () => {
    const session = createDocumentSession('projection-alignment', 1, flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1), {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: {},
      edges: {},
      constraints: [],
      adapterMetadata: { flowchart: { textAlignments: { A: { horizontal: 'left', vertical: 'top' } } } },
    })

    expect(projectFlowchartSession(session, []).nodes[0].data).toMatchObject({ textHorizontalAlign: 'left', textVerticalAlign: 'top' })
  })
})
