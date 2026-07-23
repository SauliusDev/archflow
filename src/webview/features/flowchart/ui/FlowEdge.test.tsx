import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('zustand')

vi.mock('@xyflow/react', () => ({
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  getStraightPath: vi.fn(() => ['M0,0 L100,100', 50, 50]),
  getSmoothStepPath: vi.fn(() => ['M0,0 L0,100 L100,100', 50, 50]),
  getBezierPath: vi.fn(() => ['M0,0 C25,0 75,100 100,100', 50, 50]),
  useReactFlow: vi.fn(() => ({ screenToFlowPosition: (point: { x: number; y: number }) => point })),
  useInternalNode: vi.fn((id: string) => ({
    id,
    measured: { width: 100, height: 40 },
    internals: { positionAbsolute: id === 'A' ? { x: 0, y: 0 } : { x: 200, y: 200 } },
  })),
  BaseEdge: (props: {
    path: string
    className?: string
    markerEnd?: string
    id?: string
    onDoubleClick?: React.MouseEventHandler<SVGPathElement>
  }) =>
    React.createElement('path', {
      'data-testid': 'base-edge',
      'data-class': props.className ?? '',
      'data-marker-end': props.markerEnd ?? '',
      d: props.path,
      onDoubleClick: props.onDoubleClick,
    }),
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'edge-label-renderer' }, children),
}))

import FlowEdge from './FlowEdge'
import { useStore } from '@/state/createStore'
import { getBezierPath, getSmoothStepPath, getStraightPath, Position, useInternalNode } from '@xyflow/react'
import { mockReactFlow } from '../../../setupTests'
import { SmartRoutingContext } from './SmartRoutingContext'

mockReactFlow()

const baseProps = {
  id: 'e-A-B',
  source: 'A',
  target: 'B',
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 100,
  sourcePosition: 'right' as Position,
  targetPosition: 'left' as Position,
  data: { style: 'arrow' as const },
  selected: false,
}

describe('FlowEdge', () => {
  beforeEach(() => {
    useStore.setState({ edges: [], nodes: [], history: { past: [], future: [] }, isLocked: false, updateEdgeLabel: vi.fn() } as never)
    vi.mocked(useInternalNode).mockImplementation((id: string) => ({
      id,
      measured: { width: 100, height: 40 },
      internals: { positionAbsolute: id === 'A' ? { x: 0, y: 0 } : { x: 200, y: 200 } },
    }) as never)
    vi.mocked(getBezierPath).mockReturnValue(['M0,0 C25,0 75,100 100,100', 50, 50])
    vi.mocked(getSmoothStepPath).mockReturnValue(['M0,0 L0,100 L100,100', 50, 50])
    vi.mocked(getStraightPath).mockReturnValue(['M0,0 L100,100', 50, 50])
  })

  it('renders BaseEdge with flow-edge__path--arrow class for arrow style', () => {
    render(<FlowEdge {...baseProps} />)
    expect(screen.getByTestId('base-edge').getAttribute('data-class')).toContain('flow-edge__path--arrow')
  })

  it('renders flow-edge__path--dotted class for dotted style', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'dotted' }} />)
    expect(screen.getByTestId('base-edge').getAttribute('data-class')).toContain('flow-edge__path--dotted')
  })

  it('renders flow-edge__path--thick class for thick style', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'thick' }} />)
    expect(screen.getByTestId('base-edge').getAttribute('data-class')).toContain('flow-edge__path--thick')
  })

  it('open style: BaseEdge has no markerEnd', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'open' }} />)
    expect(screen.getByTestId('base-edge').getAttribute('data-marker-end')).toBe('')
  })

  it('non-selected edge does not render style toolbar buttons', () => {
    render(<FlowEdge {...baseProps} selected={false} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('selected edge renders all style buttons alongside routing controls', () => {
    render(<FlowEdge {...baseProps} selected={true} />)
    for (const title of ['Solid arrow', 'Dotted arrow', 'Thick arrow', 'Open link']) {
      expect(screen.getByTitle(title)).toBeTruthy()
    }
  })

  it('offers only named explicit route controls with distinct vector previews', () => {
    render(<FlowEdge {...baseProps} selected />)

    const previewPaths = {
      Straight: 'M2 12H22',
      Orthogonal: 'M2 5H12V19H22',
      Curved: 'M2 19C8 3 16 3 22 19',
    }
    for (const [mode, expectedPath] of Object.entries(previewPaths)) {
      const button = screen.getByRole('button', { name: `${mode} edge routing` })
      expect(button.getAttribute('title')).toBe(`${mode} routing`)
      expect(button.querySelector('svg path')?.getAttribute('d')).toBe(expectedPath)
    }
    expect(screen.queryByRole('button', { name: /automatic edge routing/i })).toBeNull()
  })

  it.each(['straight', 'orthogonal', 'curved'] as const)('dispatches %s routing from the unlocked toolbar', routeMode => {
    const setEdgeRouteMode = vi.fn()
    useStore.setState({ isLocked: false, setEdgeRouteMode } as never)
    render(<FlowEdge {...baseProps} selected />)

    fireEvent.click(screen.getByRole('button', { name: `${routeMode[0].toUpperCase()}${routeMode.slice(1)} edge routing` }))
    expect(setEdgeRouteMode).toHaveBeenCalledWith('e-A-B', routeMode)
  })

  it.each([undefined, 'automatic'] as const)('shows the straight fallback as selected for %s metadata', routeMode => {
    render(<FlowEdge {...baseProps} selected data={{ style: 'arrow', ...(routeMode ? { routeMode } : {}) }} />)

    expect(screen.getByRole('button', { name: 'Straight edge routing' }).getAttribute('aria-pressed')).toBe('true')
  })

  it.each([
    ['straight', 'M0,0 L100,100'],
    ['orthogonal', 'M0,0 L0,100 L100,100'],
    ['curved', 'M0,0 C25,0 75,100 100,100'],
    ['manual', 'M0,0 L0,100 L100,100'],
    ['automatic', 'M0,0 L100,100'],
  ] as const)('renders %s with its intended geometry', (routeMode, path) => {
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode }} />)
    expect(screen.getByTestId('base-edge').getAttribute('d')).toBe(path)
  })

  it('draws reciprocal edges as paired curves with separated label lanes', () => {
    useStore.setState({
      edges: [
        { id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow', routeMode: 'straight' } },
        { id: 'e-B-A', source: 'B', target: 'A', data: { style: 'arrow', routeMode: 'straight' } },
      ],
    } as never)

    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'straight' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).toMatch(/^M .* C /)
  })

  it('uses the floating attachment sides for curved geometry', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'curved' }} />)

    expect(getBezierPath).toHaveBeenCalledWith(expect.objectContaining({
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }))
  })

  it('uses persisted fixed attachment sides for curved geometry in Side mode', () => {
    useStore.setState({
      documentSession: { family: 'flowchart', layout: { adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: false } } } } },
    } as never)
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'curved', sourceSide: 'right', targetSide: 'left' }} />)

    expect(getBezierPath).toHaveBeenCalledWith(expect.objectContaining({
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    }))
  })

  it('snaps legacy Side-mode edges without saved sides to the four handle midpoints', () => {
    useStore.setState({
      documentSession: { family: 'flowchart', layout: { adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: false } } } } },
    } as never)
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'curved' }} />)

    expect(getBezierPath).toHaveBeenCalledWith(expect.objectContaining({
      sourceX: 50,
      sourceY: 40,
      targetX: 250,
      targetY: 200,
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
    }))
  })

  it('starts source endpoint reassignment from a pointer drag', () => {
    const setPendingConnect = vi.fn()
    useStore.setState({
      documentSession: { family: 'flowchart', layout: { adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: false } } } } },
      setPendingConnect,
    } as never)

    render(<FlowEdge {...baseProps} selected />)
    const endpoint = screen.getByRole('button', { name: 'Drag source endpoint' })
    fireEvent.pointerDown(endpoint)
    expect(setPendingConnect).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'reassign', edgeId: 'e-A-B', endpoint: 'source', fixedNodeId: 'B',
      cursor: expect.any(Object), awaitingInitialRelease: true,
    }))
  })

  it('offers endpoint reassignment for a selected edge in Free mode', () => {
    render(<FlowEdge {...baseProps} selected />)

    expect(screen.getByRole('button', { name: 'Drag source endpoint' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Drag target endpoint' })).toBeTruthy()
  })

  it('starts endpoint reassignment from the keyboard', () => {
    const setPendingConnect = vi.fn()
    useStore.setState({
      documentSession: { family: 'flowchart', layout: { adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: false } } } } },
      setPendingConnect,
    } as never)

    render(<FlowEdge {...baseProps} selected />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Drag source endpoint' }), { key: 'Enter' })
    expect(setPendingConnect).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'reassign', edgeId: 'e-A-B', endpoint: 'source', fixedNodeId: 'B',
    }))
  })

  it('does not offer reassignment for a subgraph endpoint without side targets', () => {
    vi.mocked(useInternalNode).mockImplementation((id: string) => ({
      id,
      data: id === 'A' ? { isSubgraph: true } : {},
      measured: { width: 100, height: 40 },
      internals: { positionAbsolute: id === 'A' ? { x: 0, y: 0 } : { x: 200, y: 200 } },
    }) as never)
    useStore.setState({
      documentSession: { family: 'flowchart', layout: { adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: false } } } } },
    } as never)

    render(<FlowEdge {...baseProps} selected />)
    expect(screen.queryByRole('button', { name: 'Drag source endpoint' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Drag target endpoint' })).toBeTruthy()
  })

  it('keeps a clear normal curved Bézier instead of replacing it with a straight segment', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'curved' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).toBe('M0,0 C25,0 75,100 100,100')
  })

  it('smart-routes a curved edge when its Bézier geometry, but not its chord, intersects a node', () => {
    vi.mocked(getBezierPath).mockReturnValue(['M0 0 C 0 200 100 200 100 0', 50, 100])
    useStore.setState({
      nodes: [{ id: 'blocking', position: { x: 40, y: 130 }, data: { label: 'Blocking', shape: 'rectangle' }, measured: { width: 20, height: 10 } }],
    } as never)

    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'curved' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).not.toBe('M0 0 C 0 200 100 200 100 0')
  })

  it('smart-routes an orthogonal edge when its smooth-step geometry, but not its chord, intersects a node', () => {
    useStore.setState({
      nodes: [{ id: 'blocking', position: { x: -10, y: 50 }, data: { label: 'Blocking', shape: 'rectangle' }, measured: { width: 10, height: 20 } }],
    } as never)

    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'orthogonal' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).not.toBe('M0,0 L0,100 L100,100')
  })

  it('keeps the existing geometry when Smart routing is disabled', () => {
    useStore.setState({
      nodes: [{ id: 'blocking', position: { x: 80, y: 40 }, data: { label: 'Blocking', shape: 'rectangle' }, measured: { width: 80, height: 80 } }],
    } as never)
    render(<SmartRoutingContext.Provider value={false}><FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'straight' }} /></SmartRoutingContext.Provider>)

    expect(screen.getByTestId('base-edge').getAttribute('d')).toBe('M0,0 L100,100')
  })

  it('derives a detour from node geometry without mutating canvas data', () => {
    const nodes = [{ id: 'blocking', position: { x: 80, y: 40 }, data: { label: 'Blocking', shape: 'rectangle' }, measured: { width: 80, height: 80 } }]
    const edges = [{ id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow' as const, routeMode: 'straight' as const } }]
    useStore.setState({ nodes, edges } as never)

    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'straight' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).not.toBe('M0,0 L100,100')
    expect(useStore.getState().nodes).toBe(nodes)
    expect(useStore.getState().edges).toBe(edges)
  })

  it('keeps manual orthogonal waypoints exact while Smart routing is enabled', () => {
    useStore.setState({
      nodes: [{ id: 'blocking', position: { x: 80, y: 40 }, data: { label: 'Blocking', shape: 'rectangle' }, measured: { width: 80, height: 80 } }],
    } as never)
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'orthogonal', waypoints: [{ x: 40, y: 50 }] }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).toContain('40 50')
  })

  it('uses absolute nested-node geometry and excludes endpoint ancestor subgraphs from obstacles', () => {
    const positions: Record<string, { x: number; y: number }> = { A: { x: 120, y: 150 }, B: { x: 360, y: 150 } }
    vi.mocked(useInternalNode).mockImplementation((id: string) => ({
      id, measured: { width: 100, height: 40 }, internals: { positionAbsolute: positions[id] },
    }) as never)
    useStore.setState({
      nodes: [
        { id: 'group', position: { x: 100, y: 100 }, width: 400, height: 200, data: { label: 'Group', shape: 'subgraph', isSubgraph: true } },
        { id: 'A', parentId: 'group', position: { x: 20, y: 50 }, data: { label: 'A', shape: 'rectangle' }, measured: { width: 100, height: 40 } },
        { id: 'B', parentId: 'group', position: { x: 260, y: 50 }, data: { label: 'B', shape: 'rectangle' }, measured: { width: 100, height: 40 } },
      ],
    } as never)

    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'straight' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).toBe('M0,0 L100,100')
  })

  it('avoids the explicit manual path of a prior edge rather than its center chord', () => {
    vi.mocked(getStraightPath).mockReturnValue(['M 100 20 L 300 20', 200, 20])
    const positions: Record<string, { x: number; y: number }> = {
      A: { x: 0, y: 0 }, B: { x: 300, y: 0 }, C: { x: 50, y: -120 }, D: { x: 250, y: -120 },
    }
    vi.mocked(useInternalNode).mockImplementation((id: string) => ({
      id, measured: { width: 100, height: 40 }, internals: { positionAbsolute: positions[id] },
    }) as never)
    useStore.setState({
      nodes: Object.entries(positions).map(([nodeId, position]) => ({ id: nodeId, position, data: { label: nodeId, shape: 'rectangle' }, measured: { width: 100, height: 40 } })),
      edges: [
        { id: 'a-existing', source: 'C', target: 'D', data: { style: 'arrow', routeMode: 'orthogonal', waypoints: [{ x: 150, y: 20 }] } },
        { id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow', routeMode: 'straight' } },
      ],
    } as never)

    render(<FlowEdge {...baseProps} data={{ style: 'arrow', routeMode: 'straight' }} />)

    expect(screen.getByTestId('base-edge').getAttribute('d')).not.toBe('M0,0 L100,100')
  })

  it('clicking a style button calls setEdgeStyle with edge id and style', () => {
    const mockSetEdgeStyle = vi.fn()
    useStore.setState({ setEdgeStyle: mockSetEdgeStyle } as never)
    render(<FlowEdge {...baseProps} selected={true} />)
    act(() => { fireEvent.click(screen.getByTitle('Dotted arrow')) })
    expect(mockSetEdgeStyle).toHaveBeenCalledWith('e-A-B', 'dotted')
  })

  it('provides pointer and keyboard waypoint editing only when the canvas is unlocked', () => {
    const setEdgeRouteMode = vi.fn()
    const addEdgeWaypoint = vi.fn()
    const moveEdgeWaypoint = vi.fn()
    const removeEdgeWaypoint = vi.fn()
    useStore.setState({ isLocked: false, setEdgeRouteMode, addEdgeWaypoint, moveEdgeWaypoint, removeEdgeWaypoint } as never)
    render(<FlowEdge {...baseProps} selected data={{ style: 'arrow', routeMode: 'orthogonal', waypoints: [{ x: 40, y: 50 }] }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add edge waypoint' }))
    fireEvent.keyDown(screen.getByRole('button', { name: 'Waypoint 1 of 1' }), { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(screen.getByRole('button', { name: 'Waypoint 1 of 1' }), { key: 'Delete' })
    expect(addEdgeWaypoint).toHaveBeenCalledWith('e-A-B', { x: 40, y: 50 })
    expect(moveEdgeWaypoint).toHaveBeenCalledWith('e-A-B', 0, { x: 50, y: 50 })
    expect(removeEdgeWaypoint).toHaveBeenCalledWith('e-A-B', 0)

    setEdgeRouteMode.mockClear()
    act(() => { useStore.setState({ isLocked: true } as never) })
    fireEvent.click(screen.getByRole('button', { name: 'Straight edge routing' }))
    expect((screen.getByRole('button', { name: 'Straight edge routing' }) as HTMLButtonElement).disabled).toBe(true)
    expect(setEdgeRouteMode).not.toHaveBeenCalled()
  })

  it('renders label text when data.label is set', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', label: 'yes' }} />)
    expect(screen.getByText('yes')).toBeTruthy()
  })

  it('renders pencil affordance when selected=true and no label', () => {
    render(<FlowEdge {...baseProps} selected={true} data={{ style: 'arrow' }} />)
    expect(screen.getByText('✎')).toBeTruthy()
  })

  it('does not render pencil when not selected and no label', () => {
    render(<FlowEdge {...baseProps} selected={false} data={{ style: 'arrow' }} />)
    expect(screen.queryByText('✎')).toBeNull()
  })

  it('double-click on label area activates editing mode (input appears)', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', label: 'old' }} />)
    const labelArea = screen.getByText('old').parentElement!
    fireEvent.doubleClick(labelArea)
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('double-click on the visible edge line activates editing mode', () => {
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', label: 'old' }} />)
    fireEvent.doubleClick(screen.getByTestId('base-edge'))
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('Enter in input calls updateEdgeLabel and closes editing', () => {
    const mockUpdateEdgeLabel = vi.fn()
    useStore.setState({ updateEdgeLabel: mockUpdateEdgeLabel } as never)
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', label: 'old' }} />)
    fireEvent.doubleClick(screen.getByText('old').parentElement!)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'new' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(mockUpdateEdgeLabel).toHaveBeenCalledWith('e-A-B', 'new')
  })

  it('Escape in input cancels without calling updateEdgeLabel', () => {
    const mockUpdateEdgeLabel = vi.fn()
    useStore.setState({ updateEdgeLabel: mockUpdateEdgeLabel } as never)
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', label: 'old' }} />)
    fireEvent.doubleClick(screen.getByText('old').parentElement!)
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' })
    expect(mockUpdateEdgeLabel).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('onBlur on input calls updateEdgeLabel', () => {
    const mockUpdateEdgeLabel = vi.fn()
    useStore.setState({ updateEdgeLabel: mockUpdateEdgeLabel } as never)
    render(<FlowEdge {...baseProps} data={{ style: 'arrow', label: 'old' }} />)
    fireEvent.doubleClick(screen.getByText('old').parentElement!)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'blurred' } })
    fireEvent.blur(input)
    expect(mockUpdateEdgeLabel).toHaveBeenCalledWith('e-A-B', 'blurred')
  })
})
