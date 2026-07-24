import { describe, expect, it } from 'vitest'
import { findEdgeInsertionCandidate } from './edgeInsertion'

const nodes = [
  { id: 'A', position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: 'A', shape: 'rectangle' as const } },
  { id: 'B', position: { x: 300, y: 0 }, width: 100, height: 60, data: { label: 'B', shape: 'rectangle' as const } },
]

describe('findEdgeInsertionCandidate', () => {
  it('finds one nearby editable standard edge', () => {
    expect(findEdgeInsertionCandidate({ x: 200, y: 30 }, nodes, [{ id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' } }])?.id).toBe('e1')
  })

  it('rejects ambiguous and represented edge targets', () => {
    const edges = [
      { id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' as const } },
      { id: 'e2', source: 'A', target: 'B', data: { style: 'arrow' as const } },
    ]
    expect(findEdgeInsertionCandidate({ x: 200, y: 30 }, nodes, edges)).toBeNull()
    expect(findEdgeInsertionCandidate({ x: 200, y: 30 }, nodes, [{ ...edges[0], data: { style: 'arrow', ownership: 'represented' } }])).toBeNull()
    expect(findEdgeInsertionCandidate({ x: 200, y: 30 }, nodes, [{ ...edges[0], data: { style: 'arrow', ownership: 'preserved-only' } }])).toBeNull()
  })

  it('finds a curved edge at its rendered curve', () => {
    const diagonalNodes = [nodes[0], { ...nodes[1], position: { x: 300, y: 200 } }]
    const edge = { id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' as const, routeMode: 'curved' as const } }
    expect(findEdgeInsertionCandidate({ x: 200, y: 130 }, diagonalNodes, [edge]))?.toMatchObject({ id: 'e1' })
  })

  it('finds an orthogonal edge at a manual waypoint segment', () => {
    const edge = { id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' as const, routeMode: 'orthogonal' as const, waypoints: [{ x: 100, y: 140 }, { x: 300, y: 140 }] } }
    expect(findEdgeInsertionCandidate({ x: 200, y: 140 }, nodes, [edge]))?.toMatchObject({ id: 'e1' })
  })

  it('rejects edges attached to subgraphs and lanes', () => {
    const subgraph = { ...nodes[0], data: { label: 'Group', shape: 'subgraph' as const, isSubgraph: true } }
    const lane = { ...nodes[0], data: { label: 'Lane', shape: 'rectangle' as const, isLane: true } }
    expect(findEdgeInsertionCandidate({ x: 200, y: 30 }, [subgraph, nodes[1]], [{ id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' } }])).toBeNull()
    expect(findEdgeInsertionCandidate({ x: 200, y: 30 }, [lane, nodes[1]], [{ id: 'e1', source: 'A', target: 'B', data: { style: 'arrow' } }])).toBeNull()
  })
})
