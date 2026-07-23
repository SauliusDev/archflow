import React from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlowMiniMap } from './FlowMiniMap'

const canvasSize = { width: 400, height: 200 }
const viewport = { x: 0, y: 0, zoom: 1 }

describe('FlowMiniMap', () => {
  it('renders scaled nodes, directed connections, and a viewport affordance', () => {
    const { container } = render(<FlowMiniMap
      nodes={[
        { id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, width: 120, height: 48, data: { label: 'A', shape: 'rectangle' } },
        { id: 'B', type: 'flowNode', position: { x: 240, y: 120 }, width: 120, height: 48, data: { label: 'B', shape: 'diamond' } },
      ]}
      edges={[{ id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow' } }]}
      viewport={viewport}
      canvasSize={canvasSize}
    />)

    expect(screen.getByRole('img', { name: 'Diagram minimap' })).toBeTruthy()
    expect(container.querySelectorAll('.flow-minimap__node')).toHaveLength(2)
    expect(container.querySelectorAll('.flow-minimap__edge')).toHaveLength(1)
    expect(container.querySelector('.flow-minimap__edge')?.getAttribute('marker-end')).toMatch(/^url\(#flow-minimap-/)
    expect(container.querySelector('.flow-minimap__viewport')).toBeTruthy()
  })

  it('resolves nested node coordinates for bounds, node geometry, and edge endpoints', () => {
    const { container } = render(<FlowMiniMap
      nodes={[
        { id: 'group', type: 'subgraphNode', position: { x: 100, y: 50 }, width: 300, height: 200, data: { label: 'Group', shape: 'subgraph', isSubgraph: true } },
        { id: 'child', type: 'flowNode', parentId: 'group', position: { x: 40, y: 30 }, width: 100, height: 40, data: { label: 'Child', shape: 'rectangle' } },
        { id: 'target', type: 'flowNode', position: { x: 500, y: 100 }, width: 100, height: 40, data: { label: 'Target', shape: 'rectangle' } },
      ]}
      edges={[{ id: 'nested-edge', source: 'child', target: 'target', data: { style: 'arrow' } }]}
      viewport={viewport}
      canvasSize={canvasSize}
    />)

    const child = container.querySelector('[data-node-id="child"]')!
    expect(child.getAttribute('data-world-x')).toBe('140')
    expect(child.getAttribute('data-world-y')).toBe('80')
    const edge = container.querySelector('[data-edge-id="nested-edge"]')!
    expect(Number(edge.getAttribute('data-world-x1'))).toBeGreaterThan(140)
    expect(Number(edge.getAttribute('data-world-x2'))).toBe(500)
  })

  it('renders every supported node shape and honours node color overrides', () => {
    const shapes = ['rectangle', 'rounded', 'pill', 'diamond', 'circle', 'hexagon', 'cylinder', 'subgraph'] as const
    const { container } = render(<FlowMiniMap
      nodes={shapes.map((shape, index) => ({
        id: shape, type: 'flowNode', position: { x: index * 140, y: 0 }, width: 100, height: 60,
        data: { label: shape, shape, ...(shape === 'hexagon' ? { fillColor: '#123456', strokeColor: '#abcdef' } : {}) },
      }))}
      edges={[]}
      viewport={viewport}
      canvasSize={canvasSize}
    />)

    for (const shape of shapes) expect(container.querySelector(`.flow-minimap__node--${shape}`)).toBeTruthy()
    const hexagon = container.querySelector('[data-node-id="hexagon"]')!
    expect(hexagon.getAttribute('fill')).toBe('#123456')
    expect(hexagon.getAttribute('stroke')).toBe('#abcdef')
  })

  it('keeps endpoint directionality, endpoint markers, and self-loops meaningful', () => {
    const { container } = render(<FlowMiniMap
      nodes={[
        { id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: 'A', shape: 'rectangle' } },
        { id: 'B', type: 'flowNode', position: { x: 240, y: 0 }, width: 100, height: 60, data: { label: 'B', shape: 'rectangle' } },
      ]}
      edges={[
        { id: 'plain', source: 'A', target: 'B', data: { style: 'open', directionality: 'none' } },
        { id: 'backward', source: 'A', target: 'B', data: { style: 'arrow', directionality: 'backward' } },
        { id: 'both', source: 'A', target: 'B', data: { style: 'arrow', directionality: 'bidirectional', startEndpoint: 'circle', endEndpoint: 'cross' } },
        { id: 'loop', source: 'A', target: 'A', data: { style: 'arrow', directionality: 'forward' } },
      ]}
      viewport={viewport}
      canvasSize={canvasSize}
    />)

    expect(container.querySelector('[data-edge-id="plain"]')?.getAttribute('marker-end')).toBeNull()
    expect(container.querySelector('[data-edge-id="backward"]')?.getAttribute('marker-start')).toMatch(/^url\(#flow-minimap-/)
    const both = container.querySelector('[data-edge-id="both"]')!
    expect(both.getAttribute('marker-start')).toMatch(/^url\(#flow-minimap-.*-circle\)$/)
    expect(both.getAttribute('marker-end')).toMatch(/^url\(#flow-minimap-.*-cross\)$/)
    expect(container.querySelector('[data-edge-id="loop"]')?.tagName).toBe('path')
  })

  it('derives, clips, and omits the viewport indicator from actual canvas dimensions and pan/zoom', () => {
    const nodes = [{ id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, width: 400, height: 200, data: { label: 'A', shape: 'rectangle' as const } }]
    const { container, rerender } = render(<FlowMiniMap nodes={nodes} edges={[]} viewport={{ x: -100, y: -40, zoom: 2 }} canvasSize={{ width: 200, height: 100 }} />)
    const indicator = container.querySelector('.flow-minimap__viewport')!
    expect(indicator.getAttribute('data-world-x')).toBe('50')
    expect(indicator.getAttribute('data-world-y')).toBe('20')
    expect(indicator.getAttribute('data-world-width')).toBe('100')
    expect(indicator.getAttribute('data-world-height')).toBe('50')

    rerender(<FlowMiniMap nodes={nodes} edges={[]} viewport={{ x: -700, y: 0, zoom: 1 }} canvasSize={{ width: 100, height: 100 }} />)
    expect(container.querySelector('.flow-minimap__viewport')).toBeNull()
  })

  it('gives each mounted minimap unique marker ids', () => {
    const diagrams = <>
      <FlowMiniMap nodes={[{ id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } }]} edges={[]} viewport={viewport} canvasSize={canvasSize} />
      <FlowMiniMap nodes={[{ id: 'B', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'B', shape: 'rectangle' } }]} edges={[]} viewport={viewport} canvasSize={canvasSize} />
    </>
    const { container } = render(diagrams)
    const markerIds = [...container.querySelectorAll('marker')].map(marker => marker.id)
    expect(new Set(markerIds).size).toBe(markerIds.length)
  })

  it('keeps an empty or degenerate diagram finite and accessible', () => {
    const { container, rerender } = render(<FlowMiniMap nodes={[]} edges={[]} viewport={viewport} canvasSize={canvasSize} />)
    expect(screen.getByRole('img', { name: 'Diagram minimap' })).toBeTruthy()
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)

    rerender(<FlowMiniMap nodes={[{ id: 'A', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } }]} edges={[]} viewport={{ x: 0, y: 0, zoom: 0 }} canvasSize={{ width: 0, height: 0 }} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
  })
})
