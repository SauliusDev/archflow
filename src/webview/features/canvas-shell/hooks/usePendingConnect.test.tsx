import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '@/state/createStore'
import { makeNode } from '@/test/store-helpers'
import { flowchartCompatibilityAdapter, projectFlowchartSession } from '@/features/flowchart'
import { createDocumentSession } from '@/lib/documentSession'
import type { LayoutStateV2 } from '@/shared/diagram-contracts'
import { usePendingConnect } from './usePendingConnect'

describe('usePendingConnect', () => {
  const initialState = useStore.getState()
  beforeEach(() => useStore.setState(initialState, true))

  it('connects the pending source when a different node is clicked', () => {
    useStore.setState({ pendingConnect: { sourceId: 'source' } })
    const { result } = renderHook(() => usePendingConnect(position => position))
    act(() => result.current.handleNodeClick({} as React.MouseEvent, { id: 'target' } as never))
    expect(useStore.getState().edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'source', target: 'target' })]))
    expect(useStore.getState().pendingConnect).toBeNull()
  })

  it('persists the arrow-button source side when Side connections are active', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Bravo]\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
      adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: true } } },
    }
    useStore.getState().initializeDocumentSession(createDocumentSession('pending-connect-side', 1, projection, layout))
    useStore.getState().importFromCode(projection.model)
    useStore.getState().setPendingConnect('A', 'bottom')
    const { result } = renderHook(() => usePendingConnect(position => position))

    act(() => result.current.handleNodeClick({} as React.MouseEvent, { id: 'B' } as never))

    expect(Object.values(useStore.getState().documentSession!.layout.edges)).toEqual([
      expect.objectContaining({ routeMode: 'curved', sourceSide: 'bottom' }),
    ])
  })

  it('uses the curved default for drag, pending-click, and pending-pane connections', () => {
    useStore.setState({ nodes: [makeNode('source')], edges: [], pendingConnect: null })
    const { result } = renderHook(() => usePendingConnect(position => position))

    act(() => result.current.handleConnect({ source: 'source', target: 'drag-target' }))
    act(() => useStore.getState().setPendingConnect('source'))
    act(() => result.current.handleNodeClick({} as React.MouseEvent, { id: 'click-target' } as never))
    act(() => useStore.getState().setPendingConnect('source'))
    act(() => result.current.handlePaneClick({ clientX: 120, clientY: 80 } as React.MouseEvent))

    expect(useStore.getState().edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'source', target: 'drag-target', data: expect.objectContaining({ routeMode: 'curved' }) }),
      expect.objectContaining({ source: 'source', target: 'click-target', data: expect.objectContaining({ routeMode: 'curved' }) }),
      expect.objectContaining({ source: 'source', data: expect.objectContaining({ routeMode: 'curved' }) }),
    ]))
  })

  it('completes an arrow drag when the pointer is released over a node', () => {
    useStore.setState({ nodes: [makeNode('source'), makeNode('target')], edges: [], pendingConnect: { kind: 'new', sourceId: 'source', sourceSide: 'top' } })
    const target = document.createElement('div')
    target.className = 'react-flow__node'
    target.dataset.id = 'target'
    document.body.append(target)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
    renderHook(() => usePendingConnect(position => position))

    act(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 })))

    expect(useStore.getState().edges).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'source', target: 'target' })]))
    target.remove()
  })

  it('passes the exact target connector side from an arrow drag', () => {
    const addEdge = vi.fn()
    const target = document.createElement('div')
    target.className = 'react-flow__node'
    target.dataset.id = 'target'
    const handle = document.createElement('div')
    handle.dataset.attachmentSide = 'right'
    target.append(handle)
    document.body.append(target)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => handle })
    useStore.setState({
      pendingConnect: { kind: 'new', sourceId: 'source', sourceSide: 'left' },
      addEdge,
    } as never)
    renderHook(() => usePendingConnect(position => position))

    act(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 })))

    expect(addEdge).toHaveBeenCalledWith({ source: 'source', target: 'target', sourceSide: 'left', targetSide: 'right' }, 'curved')
    target.remove()
  })

  it('snaps an arrow drop near a connector to the closest target side', () => {
    const addEdge = vi.fn()
    const target = document.createElement('div')
    target.className = 'react-flow__node'
    target.dataset.id = 'target'
    Object.defineProperty(target, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 }),
    })
    document.body.append(target)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => target })
    useStore.setState({
      pendingConnect: { kind: 'new', sourceId: 'source', sourceSide: 'left' },
      addEdge,
    } as never)
    renderHook(() => usePendingConnect(position => position))

    act(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 190, clientY: 45 })))

    expect(addEdge).toHaveBeenCalledWith({ source: 'source', target: 'target', sourceSide: 'left', targetSide: 'right' }, 'curved')
    target.remove()
  })

  it('keeps the target connector side when React Flow completes the node click first', () => {
    const addEdge = vi.fn()
    const target = document.createElement('div')
    target.className = 'react-flow__node'
    target.dataset.id = 'target'
    const handle = document.createElement('div')
    handle.dataset.attachmentSide = 'right'
    target.append(handle)
    document.body.append(target)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => handle })
    useStore.setState({
      pendingConnect: { kind: 'new', sourceId: 'source', sourceSide: 'left' },
      addEdge,
    } as never)
    const { result } = renderHook(() => usePendingConnect(position => position))

    act(() => result.current.handleNodeClick({ clientX: 100, clientY: 100 } as React.MouseEvent, { id: 'target' } as never))

    expect(addEdge).toHaveBeenCalledWith({ source: 'source', target: 'target', sourceSide: 'left', targetSide: 'right' }, 'curved')
    target.remove()
  })

  it('retargets a released edge endpoint in one drag and preserves the hovered side', () => {
    const retargetEdgeEndpoint = vi.fn()
    const target = document.createElement('div')
    target.className = 'react-flow__node'
    target.dataset.id = 'replacement'
    const handle = document.createElement('div')
    handle.dataset.attachmentSide = 'left'
    target.append(handle)
    document.body.append(target)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => handle })
    useStore.setState({
      pendingConnect: {
        kind: 'reassign', edgeId: 'edge-1', endpoint: 'source', fixedNodeId: 'target',
        cursor: { x: 10, y: 20 },
      },
      retargetEdgeEndpoint,
    } as never)
    renderHook(() => usePendingConnect(position => position))

    act(() => window.dispatchEvent(new PointerEvent('pointerup', { clientX: 100, clientY: 100 })))

    expect(retargetEdgeEndpoint).toHaveBeenCalledWith('edge-1', 'source', 'replacement', 'left')
    expect(useStore.getState().pendingConnect).toBeNull()
    target.remove()
  })

  it('commits and reprojects Curved state for drag, pending-click, and pending-pane document-session connections', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Bravo]\n  C[Charlie]\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: {}, constraints: [],
    }
    useStore.getState().initializeDocumentSession(createDocumentSession('pending-connect-routes', 1, projection, layout))
    useStore.getState().importFromCode(projection.model)
    const { result } = renderHook(() => usePendingConnect(position => position))

    act(() => result.current.handleConnect({ source: 'A', target: 'B' }))
    act(() => useStore.getState().setPendingConnect('A'))
    act(() => result.current.handleNodeClick({} as React.MouseEvent, { id: 'C' } as never))
    act(() => useStore.getState().setPendingConnect('A'))
    act(() => result.current.handlePaneClick({ clientX: 120, clientY: 80 } as React.MouseEvent))

    const state = useStore.getState()
    const session = state.documentSession!
    expect(state.edges.every(edge => edge.data?.routeMode === 'curved')).toBe(true)
    expect(Object.values(session.layout.edges)).toHaveLength(3)
    expect(Object.values(session.layout.edges).every(route => route.routeMode === 'curved')).toBe(true)
    expect(session.source).not.toContain('curved')

    const reopened = createDocumentSession('pending-connect-reopen', 1, flowchartCompatibilityAdapter.parse(session.source, 1), session.layout)
    expect(projectFlowchartSession(reopened, state.nodes).edges.every(edge => edge.data?.routeMode === 'curved')).toBe(true)
  })
})
