import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('zustand')

const mockZoomIn = vi.fn()
const mockZoomOut = vi.fn()
const mockZoomTo = vi.fn()
const mockFitView = vi.fn()
const mockScreenToFlowPosition = vi.fn((pos: { x: number; y: number }) => pos)

// Module-level captured props (accessible from tests)
let capturedSnapToGrid: boolean | undefined
let capturedSnapGrid: [number, number] | undefined
let capturedPanOnDrag: boolean | undefined
let capturedPanOnScroll: boolean | undefined
let capturedZoomOnScroll: boolean | undefined
let capturedZoomOnPinch: boolean | undefined
let capturedSelectionOnDrag: boolean | undefined
let capturedElementsSelectable: boolean | undefined
let capturedMinZoom: number | undefined
let capturedMaxZoom: number | undefined
let capturedOnNodeDragStart: ((...args: unknown[]) => void) | undefined
let capturedOnNodeDragStop: ((...args: unknown[]) => void) | undefined
let _capturedOnNodesDelete: ((...args: unknown[]) => void) | undefined
let capturedOnConnect: ((connection: unknown) => void) | undefined
let capturedEdgeTypes: unknown
let capturedOnNodeClick: ((e: unknown, node: { id: string }) => void) | undefined
let capturedEdges: unknown[] | undefined
let capturedNodes: unknown[] | undefined


vi.mock('@xyflow/react', () => ({
  ReactFlow: (props: {
    snapToGrid?: boolean
    snapGrid?: [number, number]
    panOnDrag?: boolean
    panOnScroll?: boolean
    zoomOnScroll?: boolean
    zoomOnPinch?: boolean
    selectionOnDrag?: boolean
    elementsSelectable?: boolean
    minZoom?: number
    maxZoom?: number
    onNodeDragStart?: (...args: unknown[]) => void
    onNodeDragStop?: (...args: unknown[]) => void
    onNodesDelete?: (...args: unknown[]) => void
    onConnect?: (connection: unknown) => void
    edgeTypes?: unknown
    nodes?: unknown[]
    edges?: unknown[]
    onNodeClick?: (e: unknown, node: { id: string }) => void
    onPaneClick?: (e: React.MouseEvent) => void
    children?: React.ReactNode
  }) => {
    capturedSnapToGrid = props.snapToGrid
    capturedSnapGrid = props.snapGrid
    capturedPanOnDrag = props.panOnDrag
    capturedPanOnScroll = props.panOnScroll
    capturedZoomOnScroll = props.zoomOnScroll
    capturedZoomOnPinch = props.zoomOnPinch
    capturedSelectionOnDrag = props.selectionOnDrag
    capturedElementsSelectable = props.elementsSelectable
    capturedMinZoom = props.minZoom
    capturedMaxZoom = props.maxZoom
    capturedOnNodeDragStart = props.onNodeDragStart
    capturedOnNodeDragStop = props.onNodeDragStop
    _capturedOnNodesDelete = props.onNodesDelete
    capturedOnConnect = props.onConnect
    capturedEdgeTypes = props.edgeTypes
    capturedNodes = props.nodes
    capturedEdges = props.edges
    capturedOnNodeClick = props.onNodeClick
    return React.createElement('div', { 'data-testid': 'react-flow-mock' },
      React.createElement('div', { className: 'react-flow__pane', 'data-testid': 'react-flow-pane' }),
      props.children,
    )
  },
  Background: (props: { id?: string; gap?: number; lineWidth?: number; color?: string; bgColor?: string }) => React.createElement('div', {
    'data-testid': 'rf-background-mock',
    'data-background-id': props.id,
    'data-gap': props.gap,
    'data-line-width': props.lineWidth,
    'data-color': props.color,
    'data-background-color': props.bgColor,
  }),
  BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  SelectionMode: { Partial: 'partial', Full: 'full' },
  ConnectionMode: { Loose: 'loose', Strict: 'strict' },
  applyNodeChanges: vi.fn((_changes: unknown, nodes: unknown) => nodes),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  useReactFlow: vi.fn(() => ({
    screenToFlowPosition: mockScreenToFlowPosition,
    setViewport: vi.fn(),
    fitView: mockFitView,
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
    zoomTo: mockZoomTo,
  })),
  useViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  useStore: vi.fn((selector: (state: { width: number; height: number; transform: [number, number, number] }) => unknown) => selector({ width: 800, height: 600, transform: [0, 0, 1] })),
}))

import Canvas from '../features/canvas-shell'
import { useStore } from '@/state/createStore'
import type { Node } from '@xyflow/react'
import type { FlowNodeData } from '@/features/flowchart'
import { mockReactFlow } from '../setupTests'
import { makeNode, makeEdge } from '@/test/store-helpers'
import { NewEdgeRouteModeContext } from '@/features/flowchart/ui/NewEdgeRouteModeContext'

mockReactFlow()

describe('Canvas', () => {
  beforeEach(() => {
    capturedSnapToGrid = undefined
    capturedSnapGrid = undefined
    capturedPanOnDrag = undefined
    capturedPanOnScroll = undefined
    capturedZoomOnScroll = undefined
    capturedZoomOnPinch = undefined
    capturedSelectionOnDrag = undefined
    capturedElementsSelectable = undefined
    capturedMinZoom = undefined
    capturedMaxZoom = undefined
    capturedOnNodeDragStart = undefined
    capturedOnNodeDragStop = undefined
    _capturedOnNodesDelete = undefined
    capturedOnConnect = undefined
    capturedEdgeTypes = undefined
    capturedNodes = undefined
    capturedEdges = undefined

    capturedOnNodeClick = undefined
    mockZoomIn.mockClear()
    mockZoomOut.mockClear()
    mockZoomTo.mockClear()
    mockFitView.mockClear()
    mockScreenToFlowPosition.mockReset()
    mockScreenToFlowPosition.mockImplementation((pos: { x: number; y: number }) => pos)
    useStore.setState({ isLocked: false, minimapOpen: false })
  })

  it('renders canvas-container div', () => {
    const { container } = render(<Canvas />)
    expect(container.querySelector('.canvas-container')).toBeTruthy()
  })

  it('renders the Paper major and minor grids when selected', () => {
    const { container } = render(<Canvas layoutStyle="modern" />)
    expect(container.querySelector('.canvas-container--modern')).toBeTruthy()
    const backgrounds = screen.getAllByTestId('rf-background-mock')
    expect(backgrounds).toHaveLength(2)
    expect(backgrounds[0].getAttribute('data-background-id')).toBe('workflow-paper-minor-grid')
    expect(backgrounds[0].getAttribute('data-gap')).toBe('44')
    expect(backgrounds[0].getAttribute('data-line-width')).toBe('1')
    expect(backgrounds[0].getAttribute('data-color')).toBe('rgba(255, 255, 255, 0.018)')
    expect(backgrounds[0].getAttribute('data-background-color')).toBe('transparent')
    expect(backgrounds[1].getAttribute('data-background-id')).toBe('workflow-paper-major-grid')
    expect(backgrounds[1].getAttribute('data-gap')).toBe('220')
    expect(backgrounds[1].getAttribute('data-color')).toBe('rgba(255, 255, 255, 0.035)')
    expect(backgrounds[1].getAttribute('data-background-color')).toBe('transparent')
  })

  it('uses subdued neutral Paper grid lines in light mode', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const { unmount } = render(<Canvas layoutStyle="modern" />)
    const backgrounds = screen.getAllByTestId('rf-background-mock')
    expect(backgrounds[0].getAttribute('data-color')).toBe('rgba(36, 36, 36, 0.04)')
    expect(backgrounds[1].getAttribute('data-color')).toBe('rgba(36, 36, 36, 0.05)')
    unmount()
    document.documentElement.removeAttribute('data-theme')
  })

  it('renders mocked ReactFlow', () => {
    render(<Canvas />)
    expect(screen.getByTestId('react-flow-mock')).toBeTruthy()
  })

  it('does not render the obsolete workspace-view surface', () => {
    render(<Canvas />)
    expect(screen.queryByRole('button', { name: 'Open workspace views' })).toBeNull()
    expect(screen.queryByLabelText('Workspace views')).toBeNull()
    expect(screen.queryByText('Outline')).toBeNull()
    expect(screen.queryByText('Lanes')).toBeNull()
    expect(screen.queryByText('Issues')).toBeNull()
  })

  it('pressing Escape key deselects all selected nodes', () => {
    const node: Node<FlowNodeData> = {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: { label: 'A', shape: 'rectangle' },
      type: 'flowNode',
      selected: true,
    }
    useStore.setState({ nodes: [node] })
    render(<Canvas />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })

    expect(useStore.getState().nodes[0].selected).toBeFalsy()
  })

  it('passes the configured snap-to-grid setting and snapGrid=[24,24] to ReactFlow', () => {
    render(<Canvas snapToGrid={false} />)
    expect(capturedSnapToGrid).toBe(false)
    expect(capturedSnapGrid).toEqual([24, 24])
  })

  it('onNodeDragStop calls moveNodes with final node positions', () => {
    const node: Node<FlowNodeData> = {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: { label: 'A', shape: 'rectangle' },
      type: 'flowNode',
    }
    useStore.setState({ nodes: [node] })
    render(<Canvas />)

    const draggedNode = { ...node, position: { x: 48, y: 72 } }
    act(() => {
      capturedOnNodeDragStop?.({}, draggedNode, [draggedNode])
    })

    expect(useStore.getState().nodes[0].position).toEqual({ x: 48, y: 72 })
  })

  it('pressing Delete with a selected node removes it from the store', () => {
    const node: Node<FlowNodeData> = {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: { label: 'A', shape: 'rectangle' },
      type: 'flowNode',
      selected: true,
    }
    useStore.setState({ nodes: [node] })
    render(<Canvas />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Delete' })
    })

    expect(useStore.getState().nodes).toHaveLength(0)
  })

  it('pressing Backspace with a selected node removes it from the store', () => {
    const node: Node<FlowNodeData> = {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: { label: 'A', shape: 'rectangle' },
      type: 'flowNode',
      selected: true,
    }
    useStore.setState({ nodes: [node] })
    render(<Canvas />)

    act(() => {
      fireEvent.keyDown(window, { key: 'Backspace' })
    })

    expect(useStore.getState().nodes).toHaveLength(0)
  })

  it('pressing Delete while an input is focused does not remove selected nodes', () => {
    const node: Node<FlowNodeData> = {
      id: 'n1',
      position: { x: 0, y: 0 },
      data: { label: 'A', shape: 'rectangle' },
      type: 'flowNode',
      selected: true,
    }
    useStore.setState({ nodes: [node] })
    render(<Canvas />)

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    act(() => {
      fireEvent.keyDown(window, { key: 'Delete' })
    })

    expect(useStore.getState().nodes).toHaveLength(1)
    document.body.removeChild(input)
  })

  it.skip('passes onConnect handler to ReactFlow', () => {
    render(<Canvas />)
    expect(capturedOnConnect).toBeTypeOf('function')
  })

  it.skip('onConnect calls store addEdge with connection data', () => {
    const mockAddEdge = vi.fn()
    useStore.setState({ addEdge: mockAddEdge } as never)
    render(<Canvas />)

    act(() => {
      capturedOnConnect?.({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null })
    })

    expect(mockAddEdge).toHaveBeenCalledWith({ source: 'a', target: 'b', sourceHandle: null, targetHandle: null }, 'curved')
  })

  it('edgeTypes prop registers FlowEdge as the default edge type', () => {
    render(<Canvas />)
    expect(capturedEdgeTypes).toHaveProperty('default')
  })

  it('onNodeClick with active pendingConnect creates an edge to target node', () => {
    const mockAddEdge = vi.fn()
    const mockSetPendingConnect = vi.fn()
    useStore.setState({
      nodes: [makeNode('src'), makeNode('tgt')],
      edges: [],
      pendingConnect: { sourceId: 'src' },
      addEdge: mockAddEdge,
      setPendingConnect: mockSetPendingConnect,
    } as never)
    render(<Canvas />)
    act(() => {
      capturedOnNodeClick?.({}, { id: 'tgt' })
    })
    expect(mockAddEdge).toHaveBeenCalledWith({ source: 'src', target: 'tgt' }, 'curved')
    expect(mockSetPendingConnect).toHaveBeenCalledWith(null)
  })

  it('onNodeClick on source node clears pendingConnect without creating edge', () => {
    const mockAddEdge = vi.fn()
    const mockSetPendingConnect = vi.fn()
    useStore.setState({
      nodes: [makeNode('src')],
      pendingConnect: { sourceId: 'src' },
      addEdge: mockAddEdge,
      setPendingConnect: mockSetPendingConnect,
    } as never)
    render(<Canvas />)
    act(() => {
      capturedOnNodeClick?.({}, { id: 'src' })
    })
    expect(mockAddEdge).not.toHaveBeenCalled()
    expect(mockSetPendingConnect).toHaveBeenCalledWith(null)
  })

  it('clicking the empty canvas with an active connection creates a connected node', () => {
    const mockSpawn = vi.fn()
    const mockSetPendingConnect = vi.fn()
    useStore.setState({
      nodes: [makeNode('src')],
      pendingConnect: { sourceId: 'src' },
      spawnConnectedNode: mockSpawn,
      setPendingConnect: mockSetPendingConnect,
    } as never)
    render(<Canvas />)
    act(() => {
      fireEvent.click(screen.getByTestId('react-flow-pane'), { clientX: 100, clientY: 200 })
    })
    expect(mockSpawn).toHaveBeenCalledWith('src', { x: 100, y: 200 }, 'curved', undefined)
    expect(mockSetPendingConnect).toHaveBeenCalledWith(null)
  })

  it.skip('uses the App-provided route default for direct and pending connection paths', () => {
    const addEdge = vi.fn()
    const spawnConnectedNode = vi.fn()
    const setPendingConnect = vi.fn()
    useStore.setState({
      nodes: [makeNode('src'), makeNode('tgt')], edges: [], pendingConnect: { sourceId: 'src' },
      addEdge, spawnConnectedNode, setPendingConnect,
    } as never)
    render(<NewEdgeRouteModeContext.Provider value="orthogonal"><Canvas /></NewEdgeRouteModeContext.Provider>)

    act(() => capturedOnConnect?.({ source: 'src', target: 'tgt' }))
    act(() => capturedOnNodeClick?.({}, { id: 'tgt' }))
    useStore.setState({ pendingConnect: { sourceId: 'src' } })
    act(() => fireEvent.click(screen.getByTestId('react-flow-pane'), { clientX: 100, clientY: 200 }))

    expect(addEdge).toHaveBeenNthCalledWith(1, { source: 'src', target: 'tgt' }, 'orthogonal')
    expect(addEdge).toHaveBeenNthCalledWith(2, { source: 'src', target: 'tgt' }, 'orthogonal')
    expect(spawnConnectedNode).toHaveBeenCalledWith('src', { x: 100, y: 200 }, 'orthogonal')
  })

  it('Escape key clears pendingConnect via setPendingConnect(null)', () => {
    const mockSetPendingConnect = vi.fn()
    useStore.setState({
      nodes: [makeNode('src')],
      pendingConnect: { sourceId: 'src' },
      setPendingConnect: mockSetPendingConnect,
    } as never)
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(mockSetPendingConnect).toHaveBeenCalledWith(null)
  })

  it('Delete key with selected edge calls removeEdges with edge id', () => {
    const mockRemoveEdges = vi.fn()
    useStore.setState({
      nodes: [],
      edges: [{ id: 'e1', source: 'A', target: 'B', selected: true, data: { style: 'arrow' } }],
      removeEdges: mockRemoveEdges,
      removeNodes: vi.fn(),
      setPendingConnect: vi.fn(),
    } as never)
    render(<Canvas />)
    act(() => { fireEvent.keyDown(window, { key: 'Delete' }) })
    expect(mockRemoveEdges).toHaveBeenCalledWith(['e1'])
  })

  it('Delete key with selected node does not call removeEdges', () => {
    const mockRemoveEdges = vi.fn()
    const mockRemoveNodes = vi.fn()
    useStore.setState({
      nodes: [{ id: 'n1', selected: true, position: { x: 0, y: 0 }, data: { label: 'N', shape: 'rectangle' }, type: 'flowNode' }],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', selected: false, data: { style: 'arrow' } }],
      removeEdges: mockRemoveEdges,
      removeNodes: mockRemoveNodes,
      setPendingConnect: vi.fn(),
    } as never)
    render(<Canvas />)
    act(() => { fireEvent.keyDown(window, { key: 'Delete' }) })
    expect(mockRemoveEdges).not.toHaveBeenCalled()
    expect(mockRemoveNodes).toHaveBeenCalledWith(['n1'])
  })

  it('keeps edges unchanged when a connected node is selected', () => {
    useStore.setState({
      nodes: [
        makeNode('A', { selected: true }),
        makeNode('B'),
      ],
      edges: [
        makeEdge('e1', 'A', 'B'),
        makeEdge('e2', 'B', 'X'),
      ],
    } as never)
    render(<Canvas />)
    const edges = capturedEdges as Array<{ id: string; className?: string }>
    const e1 = edges.find(e => e.id === 'e1')
    const e2 = edges.find(e => e.id === 'e2')
    expect(e1?.className).toBeUndefined()
    expect(e2?.className).toBeUndefined()
  })

  it('dragover on canvas-container sets dropEffect to copy', () => {
    const { container } = render(<Canvas />)
    const canvasDiv = container.querySelector('.canvas-container')!
    const mockDT = { dropEffect: '' as string }
    act(() => {
      fireEvent.dragOver(canvasDiv, { dataTransfer: mockDT })
    })
    expect(mockDT.dropEffect).toBe('copy')
  })

  it('drop on canvas-container creates a node with the dragged shape', () => {
    const { container } = render(<Canvas />)
    const canvasDiv = container.querySelector('.canvas-container')!
    act(() => {
      fireEvent.drop(canvasDiv, {
        clientX: 120,
        clientY: 240,
        dataTransfer: { getData: (key: string) => key === 'application/reactflow-palette' ? 'circle' : '' },
      })
    })
    const nodes = useStore.getState().nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0].data.shape).toBe('circle')
    expect(nodes[0].data.label).toBe('New Node')
  })

  it('drop with subgraph shape forwards the grid-snapped position to addSubgraph', () => {
    const mockAddSubgraph = vi.fn()
    useStore.setState({ addSubgraph: mockAddSubgraph } as never)
    mockScreenToFlowPosition.mockReturnValue({ x: 100, y: 110 })
    const { container } = render(<Canvas />)
    const canvasDiv = container.querySelector('.canvas-container')!
    act(() => {
      fireEvent.drop(canvasDiv, {
        clientX: 100,
        clientY: 110,
        dataTransfer: { getData: (key: string) => key === 'application/reactflow-palette' ? 'subgraph' : '' },
      })
    })
    expect(mockAddSubgraph).toHaveBeenCalledWith({ x: 96, y: 120 })
  })

  it('keeps a top-level node out of a group header while dragging and on release', () => {
    const mockAssignToSubgraph = vi.fn()
    const mockMoveNodes = vi.fn()
    const group = makeNode('group', {
      position: { x: 100, y: 100 },
      width: 300,
      height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    })
    const node = makeNode('node', {
      position: { x: 160, y: 100 },
      measured: { width: 80, height: 40 },
    })
    useStore.setState({ nodes: [group, node], assignToSubgraph: mockAssignToSubgraph, moveNodes: mockMoveNodes } as never)
    render(<Canvas />)

    const displayedNode = (capturedNodes as Array<{ id: string; position: { x: number; y: number } }>).find(candidate => candidate.id === 'node')
    expect(displayedNode).toMatchObject({ position: { x: 160, y: 60 } })

    act(() => {
      capturedOnNodeDragStop?.({}, node, [node])
    })

    expect(mockAssignToSubgraph).not.toHaveBeenCalled()
    expect(mockMoveNodes).toHaveBeenCalledWith([{ id: 'node', position: { x: 160, y: 60 } }], {})
  })

  it('keeps group items below the title and removes their parent drag extent', () => {
    const group = makeNode('group', {
      position: { x: 100, y: 100 },
      width: 300,
      height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    })
    const child = makeNode('child', {
      parentId: 'group',
      extent: 'parent',
      position: { x: 120, y: 8 },
      measured: { width: 80, height: 40 },
    })
    useStore.setState({ nodes: [group, child] } as never)

    render(<Canvas />)

    const displayedChild = (capturedNodes as Array<{ id: string; extent?: unknown; position: { x: number; y: number } }>).find(node => node.id === 'child')
    expect(displayedChild).toMatchObject({ position: { x: 120, y: 32 } })
    expect(displayedChild?.extent).toBeUndefined()
  })

  it('keeps a child below its group title and promotes it only after it leaves the full group bounds', () => {
    const mockRemoveFromSubgraph = vi.fn()
    const mockMoveNodes = vi.fn()
    const group = makeNode('group', {
      position: { x: 100, y: 100 },
      width: 300,
      height: 200,
      data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
    })
    const childInHeader = makeNode('child', {
      parentId: 'group',
      position: { x: 160, y: 0 },
      measured: { width: 80, height: 40 },
    })
    useStore.setState({
      nodes: [group, childInHeader],
      removeFromSubgraph: mockRemoveFromSubgraph,
      moveNodes: mockMoveNodes,
    } as never)
    render(<Canvas />)

    act(() => {
      capturedOnNodeDragStop?.({}, childInHeader, [childInHeader])
    })

    expect(mockRemoveFromSubgraph).not.toHaveBeenCalled()
    expect(mockMoveNodes).toHaveBeenCalledWith([{ id: 'child', position: { x: 160, y: 32 } }], {})

    const childOutsideGroup = { ...childInHeader, position: { x: 300, y: 0 } }
    act(() => {
      capturedOnNodeDragStop?.({}, childOutsideGroup, [childOutsideGroup])
    })

    expect(mockRemoveFromSubgraph).toHaveBeenCalledWith('child', { x: 400, y: 100 })
  })

  it('sets syncDirection to "canvas" on node drag start', () => {
    const mockSetSyncDirection = vi.fn()
    useStore.setState({ setSyncDirection: mockSetSyncDirection } as never)
    render(<Canvas />)
    act(() => {
      capturedOnNodeDragStart?.({}, {}, [])
    })
    expect(mockSetSyncDirection).toHaveBeenCalledWith('canvas')
  })

  it('clears syncDirection to null on node drag stop', () => {
    const node = makeNode('n1', { position: { x: 10, y: 10 } })
    useStore.setState({ nodes: [node], edges: [], setSyncDirection: vi.fn() } as never)
    render(<Canvas />)
    act(() => {
      capturedOnNodeDragStop?.({}, node, [node])
    })
    expect(useStore.getState().syncDirection).toBeNull()
  })

  it('passes panOnDrag=true to ReactFlow', () => {
    render(<Canvas />)
    expect(capturedPanOnDrag).toBe(true)
  })

  it('passes selectionOnDrag=false to ReactFlow', () => {
    render(<Canvas />)
    expect(capturedSelectionOnDrag).toBe(false)
  })

  it('uses the standard minimum zoom range', () => {
    render(<Canvas />)
    expect(capturedMinZoom).toBe(0.1)
  })

  it('uses the standard maximum zoom range', () => {
    render(<Canvas />)
    expect(capturedMaxZoom).toBe(4)
  })

  it('Ctrl+0 zooms canvas to 100%', () => {
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: '0', ctrlKey: true })
    })
    expect(mockZoomTo).toHaveBeenCalledWith(1, { duration: 200 })
  })

  it('Ctrl+= zooms in', () => {
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    })
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 })
  })

  it('Ctrl+- zooms out', () => {
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: '-', ctrlKey: true })
    })
    expect(mockZoomOut).toHaveBeenCalledWith({ duration: 200 })
  })

  it('Ctrl+Shift+F preserves the standard canvas framing', () => {
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true })
    })
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.1, duration: 200, maxZoom: 1 })
  })

  it('Ctrl++ zooms in', () => {
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: '+', ctrlKey: true })
    })
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 })
  })

  it('zoom shortcuts are blocked when input has focus', () => {
    render(<Canvas />)
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      input.focus()
      act(() => {
        fireEvent.keyDown(window, { key: '=', ctrlKey: true })
      })
      expect(mockZoomIn).not.toHaveBeenCalled()
    } finally {
      document.body.removeChild(input)
    }
  })

  it('zoom shortcuts are blocked when textarea has focus', () => {
    render(<Canvas />)
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    try {
      textarea.focus()
      act(() => {
        fireEvent.keyDown(window, { key: '=', ctrlKey: true })
      })
      expect(mockZoomIn).not.toHaveBeenCalled()
    } finally {
      document.body.removeChild(textarea)
    }
  })

  it('panOnDrag=true when not locked', () => {
    useStore.setState({ isLocked: false })
    render(<Canvas />)
    expect(capturedPanOnDrag).toBe(true)
  })

  it('panOnDrag remains enabled when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<Canvas />)
    expect(capturedPanOnDrag).toBe(true)
  })

  it('prevents selecting canvas items when locked', () => {
    useStore.setState({ isLocked: true })
    render(<Canvas />)
    expect(capturedElementsSelectable).toBe(false)
  })

  it('panOnScroll=true when not locked', () => {
    useStore.setState({ isLocked: false })
    render(<Canvas />)
    expect(capturedPanOnScroll).toBe(true)
  })

  it('panOnScroll remains enabled when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<Canvas />)
    expect(capturedPanOnScroll).toBe(true)
  })

  it('renders the flowchart minimap with directed edges when minimapOpen=true', () => {
    useStore.setState({ minimapOpen: true, nodes: [makeNode('A'), makeNode('B', { position: { x: 240, y: 0 } })], edges: [makeEdge('e-A-B', 'A', 'B')] })
    render(<Canvas />)
    expect(screen.getByRole('img', { name: 'Diagram minimap' })).toBeTruthy()
    expect(document.querySelectorAll('.flow-minimap__edge')).toHaveLength(1)
  })

  it('flowchart minimap is not rendered when minimapOpen=false', () => {
    useStore.setState({ minimapOpen: false })
    render(<Canvas />)
    expect(screen.queryByRole('img', { name: 'Diagram minimap' })).toBeNull()
  })

  it('zoom shortcuts remain available when canvas is locked', () => {
    useStore.setState({ isLocked: true })
    render(<Canvas />)
    act(() => {
      fireEvent.keyDown(window, { key: '=', ctrlKey: true })
    })
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 })
  })

  it('zoomOnScroll=true when not locked', () => {
    useStore.setState({ isLocked: false })
    render(<Canvas />)
    expect(capturedZoomOnScroll).toBe(true)
  })

  it('zoomOnScroll remains enabled when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<Canvas />)
    expect(capturedZoomOnScroll).toBe(true)
  })

  it('zoomOnPinch=true when not locked', () => {
    useStore.setState({ isLocked: false })
    render(<Canvas />)
    expect(capturedZoomOnPinch).toBe(true)
  })

  it('zoomOnPinch remains enabled when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<Canvas />)
    expect(capturedZoomOnPinch).toBe(true)
  })

  describe('keyboard shortcuts', () => {
    function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}): void {
      fireEvent.keyDown(window, { key, ...opts })
    }

    it('Ctrl+Z triggers undo', () => {
      useStore.getState().addNode(makeNode('a'))
      render(<Canvas />)
      act(() => { pressKey('z', { ctrlKey: true }) })
      expect(useStore.getState().nodes).toHaveLength(0)
    })

    it('Cmd+Z triggers undo', () => {
      useStore.getState().addNode(makeNode('a'))
      render(<Canvas />)
      act(() => { pressKey('z', { metaKey: true }) })
      expect(useStore.getState().nodes).toHaveLength(0)
    })

    it('Ctrl+Z does NOT trigger undo when contentEditable focused', () => {
      useStore.getState().addNode(makeNode('a'))
      render(<Canvas />)
      // jsdom doesn't fully implement isContentEditable; patch activeElement directly
      const fakeEl = { tagName: 'DIV', isContentEditable: true } as HTMLElement
      const descriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'activeElement')!
      Object.defineProperty(document, 'activeElement', { get: () => fakeEl, configurable: true })
      try {
        act(() => { pressKey('z', { ctrlKey: true }) })
        expect(useStore.getState().nodes).toHaveLength(1)
      } finally {
        Object.defineProperty(document, 'activeElement', descriptor)
      }
    })

    it('Ctrl+Y triggers redo', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      render(<Canvas />)
      act(() => { pressKey('y', { ctrlKey: true }) })
      expect(useStore.getState().nodes).toHaveLength(1)
    })

    it('Ctrl+Shift+Z triggers redo', () => {
      useStore.getState().addNode(makeNode('a'))
      useStore.getState().undo()
      render(<Canvas />)
      act(() => { pressKey('z', { ctrlKey: true, shiftKey: true }) })
      expect(useStore.getState().nodes).toHaveLength(1)
    })

    it('Ctrl+A calls selectAll', () => {
      useStore.setState({
        nodes: [makeNode('a'), makeNode('b')],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('a', { ctrlKey: true }) })
      expect(useStore.getState().nodes.every(n => n.selected)).toBe(true)
    })

    it('Ctrl+A is blocked when input has focus', () => {
      useStore.setState({
        nodes: [makeNode('a')],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      const input = document.createElement('input')
      document.body.appendChild(input)
      try {
        input.focus()
        act(() => { pressKey('a', { ctrlKey: true }) })
        expect(useStore.getState().nodes[0].selected).toBeFalsy()
      } finally {
        document.body.removeChild(input)
      }
    })

    it('Ctrl+D duplicates selected nodes', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('d', { ctrlKey: true }) })
      expect(useStore.getState().nodes).toHaveLength(2)
      const copy = useStore.getState().nodes.find(n => n.id !== 'a')!
      expect(copy.position).toEqual({ x: 48, y: 48 })
    })

    it('Ctrl+D is no-op when nothing selected', () => {
      useStore.setState({
        nodes: [makeNode('a')],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      const before = useStore.getState().history.past.length
      act(() => { pressKey('d', { ctrlKey: true }) })
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().history.past.length).toBe(before)
    })

    it('ArrowUp nudges selected node by -24px on Y', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('ArrowUp') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 0, y: -24 })
    })

    it('ArrowDown nudges +24px on Y', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('ArrowDown') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 0, y: 24 })
    })

    it('ArrowLeft nudges -24px on X', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('ArrowLeft') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: -24, y: 0 })
    })

    it('ArrowRight nudges +24px on X', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('ArrowRight') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 24, y: 0 })
    })

    it('Arrow nudge is blocked when isLocked is true', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 } })],
        edges: [],
        isLocked: true,
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('ArrowUp') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 0, y: 0 })
    })

    it('Arrow nudge skips nodes with parentId', () => {
      useStore.setState({
        nodes: [makeNode('a', { selected: true, position: { x: 0, y: 0 }, parentId: 'sg1' })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      act(() => { pressKey('ArrowUp') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 0, y: 0 })
    })

    it('Arrow nudge is no-op when no nodes selected', () => {
      useStore.setState({
        nodes: [makeNode('a', { position: { x: 0, y: 0 } })],
        edges: [],
        history: { past: [], future: [] },
      })
      render(<Canvas />)
      const before = useStore.getState().history.past.length
      act(() => { pressKey('ArrowUp') })
      expect(useStore.getState().nodes[0].position).toEqual({ x: 0, y: 0 })
      expect(useStore.getState().history.past.length).toBe(before)
    })
  })

  describe('pendingAddNode signal handling', () => {
    it('adds a node with the requested shape when pendingAddNode is set', () => {
      render(<Canvas />)
      act(() => {
        useStore.getState().requestAddNode('rectangle')
      })
      const nodes = useStore.getState().nodes
      expect(nodes).toHaveLength(1)
      expect(nodes[0].data.shape).toBe('rectangle')
    })

    it('calls addSubgraph with the grid-snapped canvas center for subgraph shape', () => {
      const mockAddSubgraph = vi.fn()
      useStore.setState({ addSubgraph: mockAddSubgraph } as never)
      render(<Canvas />)
      const flow = document.createElement('div')
      flow.className = 'react-flow'
      Object.defineProperty(flow, 'getBoundingClientRect', {
        value: () => ({ left: 10, top: 20, width: 100, height: 100 }),
      })
      document.body.appendChild(flow)
      try {
        act(() => {
          useStore.getState().requestAddNode('subgraph')
        })
        expect(mockScreenToFlowPosition).toHaveBeenCalledWith({ x: 60, y: 70 })
        expect(mockAddSubgraph).toHaveBeenCalledWith({ x: 72, y: 72 })
      } finally {
        document.body.removeChild(flow)
      }
    })

    it('clears pendingAddNode after handling', () => {
      render(<Canvas />)
      act(() => {
        useStore.getState().requestAddNode('rectangle')
      })
      expect(useStore.getState().pendingAddNode).toBeNull()
    })
  })

  describe('pendingZoomAction signal handling', () => {
    it('"in" signal calls zoomIn from useReactFlow', () => {
      render(<Canvas />)
      act(() => {
        useStore.getState().dispatchZoomAction('in')
      })
      expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 })
    })

    it('"fit" signal preserves standard canvas framing', () => {
      render(<Canvas />)
      act(() => {
        useStore.getState().dispatchZoomAction('fit')
      })
      expect(mockFitView).toHaveBeenCalledWith({ padding: 0.1, duration: 200, maxZoom: 1 })
    })
  })
})
