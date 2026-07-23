import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// All vi.mock() at top level — Vitest hoists these before imports
vi.mock('@/state/createStore', () => {
  const mockSubscribe = vi.fn()
  const mockGetState = vi.fn()
  const store = Object.assign(vi.fn(), {
    subscribe: mockSubscribe,
    getState: mockGetState,
  })
  return { useStore: store }
})

vi.mock('../vscode', () => ({
  sendToHost: vi.fn(),
}))

import { useAutoSave, useManualSave, AUTO_SAVE_DEBOUNCE_MS, buildLayoutJson, buildLayoutStateV2, buildSaveMessage } from './autoSave'
import { useStore } from '@/state/createStore'
import { sendToHost } from '../vscode'
import type { Node } from '@xyflow/react'
import type { FlowNodeData } from '@/features/flowchart'
import { readEmbeddedLayoutV2 } from './embeddedLayout'

describe('useAutoSave', () => {
  let unsubscribeMock: ReturnType<typeof vi.fn>
  let capturedSubscriber: ((state: unknown, prevState: unknown) => void) | undefined

  beforeEach(() => {
    vi.useFakeTimers()
    unsubscribeMock = vi.fn()
    capturedSubscriber = undefined

    vi.mocked(useStore.subscribe).mockImplementation((cb: (state: unknown, prevState: unknown) => void) => {
      capturedSubscriber = cb
      return unsubscribeMock
    })

    vi.mocked(useStore.getState).mockReturnValue({
      syncDirection: null,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as never)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does nothing when enabled is false', () => {
    renderHook(() => useAutoSave(false))
    expect(useStore.subscribe).not.toHaveBeenCalled()
  })

  it('subscribes to store on mount when enabled', () => {
    renderHook(() => useAutoSave(true))
    expect(useStore.subscribe).toHaveBeenCalledTimes(1)
  })

  it('does not fire when history.past ref is unchanged', () => {
    renderHook(() => useAutoSave(true))
    const pastRef = [{}]
    const state = { history: { past: pastRef } }
    capturedSubscriber!(state, state)
    act(() => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS) })
    expect(sendToHost).not.toHaveBeenCalled()
  })

  it('sends SAVE after 1500ms when history changes', () => {
    renderHook(() => useAutoSave(true))
    const prevState = { history: { past: [{}] } }
    const nextState = { history: { past: [{}, {}] } }
    capturedSubscriber!(nextState, prevState)
    act(() => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS) })
    expect(sendToHost).toHaveBeenCalledWith({
      type: 'SAVE',
      payload: expect.objectContaining({ content: expect.any(String) }),
    })
    const call = vi.mocked(sendToHost).mock.calls[0][0] as { type: string; payload: { content: string } }
    expect(call.payload.content).toContain('%% FLOWFORGE LAYOUT START')
    expect(call.payload.content).toContain('"version": 1')
    expect(call.payload.content).toContain('"viewport"')
  })

  it('resets timer on rapid successive history changes', () => {
    renderHook(() => useAutoSave(true))
    const prevState = { history: { past: [{}] } }
    capturedSubscriber!({ history: { past: [{}, {}] } }, prevState)
    act(() => { vi.advanceTimersByTime(800) })
    capturedSubscriber!({ history: { past: [{}, {}, {}] } }, { history: { past: [{}, {}] } })
    act(() => { vi.advanceTimersByTime(800) })
    // Only 800ms elapsed since second trigger — should not have fired yet
    expect(sendToHost).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS - 800) })
    expect(sendToHost).toHaveBeenCalledTimes(1)
  })

  it('does not send SAVE when syncDirection is "canvas" at timer fire time', () => {
    vi.mocked(useStore.getState).mockReturnValue({
      syncDirection: 'canvas',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as never)
    renderHook(() => useAutoSave(true))
    const prevState = { history: { past: [{}] } }
    capturedSubscriber!({ history: { past: [{}, {}] } }, prevState)
    act(() => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS) })
    expect(sendToHost).not.toHaveBeenCalled()
  })

  it('blocks auto-save while an external conflict is active', () => {
    vi.mocked(useStore.getState).mockReturnValue({
      syncDirection: null,
      documentSession: { conflict: { content: 'external' } },
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as never)
    renderHook(() => useAutoSave(true))
    const prevState = { history: { past: [{}] } }
    capturedSubscriber!({ history: { past: [{}, {}] } }, prevState)
    act(() => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS) })
    expect(sendToHost).not.toHaveBeenCalled()
  })

  it('unsubscribes and clears timer on unmount', () => {
    const { unmount } = renderHook(() => useAutoSave(true))
    const prevState = { history: { past: [{}] } }
    capturedSubscriber!({ history: { past: [{}, {}] } }, prevState)
    unmount()
    act(() => { vi.advanceTimersByTime(AUTO_SAVE_DEBOUNCE_MS) })
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    expect(sendToHost).not.toHaveBeenCalled()
  })

  it('unsubscribes old subscription when enabled toggles', () => {
    const { rerender } = renderHook(({ enabled }: { enabled: boolean }) => useAutoSave(enabled), {
      initialProps: { enabled: true },
    })
    expect(useStore.subscribe).toHaveBeenCalledTimes(1)
    rerender({ enabled: false })
    expect(unsubscribeMock).toHaveBeenCalledTimes(1)
    rerender({ enabled: true })
    expect(useStore.subscribe).toHaveBeenCalledTimes(2)
  })
})

describe('buildLayoutJson', () => {
  it('maps node positions to layout schema', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'a', position: { x: 100, y: 200 }, data: { label: 'A', shape: 'rectangle' }, type: 'flowNode' },
    ]
    const vp = { x: -50, y: -30, zoom: 1.5 }
    const layout = buildLayoutJson(nodes, vp)
    expect(layout).toEqual({
      version: 1,
      nodes: { a: { x: 100, y: 200 } },
      viewport: { x: -50, y: -30, zoom: 1.5 },
    })
  })

  it('includes width/height only for nodes that have them', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'a', position: { x: 10, y: 20 }, width: 120, height: 40, data: { label: 'A', shape: 'rectangle' }, type: 'flowNode' },
      { id: 'b', position: { x: 30, y: 40 }, data: { label: 'B', shape: 'rounded' }, type: 'flowNode' },
    ]
    const vp = { x: 0, y: 0, zoom: 1 }
    const layout = buildLayoutJson(nodes, vp)
    expect(layout.nodes['a']).toEqual({ x: 10, y: 20, width: 120, height: 40 })
    expect(layout.nodes['b']).toEqual({ x: 30, y: 40 })
    expect(layout.nodes['b']).not.toHaveProperty('width')
    expect(layout.nodes['b']).not.toHaveProperty('height')
  })

  it('includes viewport', () => {
    const nodes: Node<FlowNodeData>[] = []
    const vp = { x: 10, y: 20, zoom: 2 }
    const layout = buildLayoutJson(nodes, vp)
    expect(layout.viewport).toEqual({ x: 10, y: 20, zoom: 2 })
    expect(layout.version).toBe(1)
  })
})

describe('buildLayoutStateV2', () => {
  it('updates matching geometry while retaining unmatched safe V2 metadata', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'a', position: { x: 100, y: 200 }, data: { label: 'A', shape: 'rectangle' }, type: 'flowNode' },
    ]
    const result = buildLayoutStateV2(nodes, { x: 1, y: 2, zoom: 1.5 }, 'flowchart', {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: { 'node:a': { x: 0, y: 0 }, 'node:unmatched': { x: 9, y: 9 } },
      edges: { 'edge:1': { routeMode: 'straight' } },
      constraints: [{ id: 'c1', kind: 'contain', handles: ['node:a'] }],
      adapterMetadata: { custom: { keep: true } },
    })
    expect(result).toMatchObject({
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 1, y: 2, zoom: 1.5 },
      elements: { 'node:a': { x: 100, y: 200 }, 'node:unmatched': { x: 9, y: 9 } },
      edges: { 'edge:1': { routeMode: 'straight' } },
      adapterMetadata: { custom: { keep: true } },
    })
  })

  it('prunes stale flowchart handles and normalizes route and lane metadata when active elements are supplied', () => {
    const nodes: Node<FlowNodeData>[] = [
      { id: 'Lane', position: { x: 10, y: 20 }, data: { label: 'Lane', shape: 'subgraph', isSubgraph: true, isLane: true }, type: 'subgraphNode' },
      { id: 'A', position: { x: 30, y: 40 }, data: { label: 'A', shape: 'rectangle' }, type: 'flowNode' },
    ]
    const edges = [{ id: 'e-A-A', source: 'A', target: 'A', data: { style: 'arrow' as const } }]
    const result = buildLayoutStateV2(nodes, { x: 0, y: 0, zoom: 1 }, 'flowchart', {
      version: 2,
      diagramFamily: 'flowchart',
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: { 'node:stale': { x: 1, y: 2 }, 'future:item': { x: 3, y: 4 } },
      edges: {
        'edge:e-A-A': { routeMode: 'straight', waypoints: [{ x: 5, y: 6 }], sourceSide: 'bottom', targetSide: 'left' },
        'edge:stale': { routeMode: 'orthogonal', waypoints: [{ x: 7, y: 8 }] },
      },
      constraints: [],
      adapterMetadata: {
        flowchart: { laneOrder: ['stale', 'Lane'], custom: true },
        future: { keep: true },
      },
    }, edges)

    expect(result.elements).toEqual({
      'future:item': { x: 3, y: 4 },
      'node:Lane': { x: 10, y: 20 },
      'node:A': { x: 30, y: 40 },
    })
    expect(result.edges).toEqual({ 'edge:e-A-A': { routeMode: 'straight', sourceSide: 'bottom', targetSide: 'left' } })
    expect(result.adapterMetadata).toEqual({
      flowchart: { laneOrder: ['Lane'], custom: true },
      future: { keep: true },
    })
  })
})

describe('buildSaveMessage', () => {
  it('creates a revisioned compare-and-swap envelope with V2 layout', () => {
    vi.mocked(useStore.getState).mockReturnValue({
      nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 },
      documentSession: {
        sessionId: 'session-1', family: 'flowchart', baseHostRevision: 7, workingRevision: 9,
        source: 'flowchart TD\n', layout: {
          version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
          elements: {}, edges: {}, constraints: [],
        },
      },
    } as never)
    const message = buildSaveMessage()
    expect(message).toMatchObject({
      type: 'SAVE', sessionId: 'session-1', baseRevision: 7,
      payload: { sessionId: 'session-1', expectedHostRevision: 7, workingRevision: 9 },
    })
    if (message.type === 'SAVE') expect(message.payload.content).toContain('"version": 2')
  })

  it('preserves canonical node colors in the save payload', () => {
    vi.mocked(useStore.getState).mockReturnValue({
      nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 },
      documentSession: {
        sessionId: 'session-1', family: 'flowchart', baseHostRevision: 7, workingRevision: 9,
        source: 'flowchart TD\n  A[Alpha]\n  style A fill:#112233,stroke:#445566,color:#778899\n',
        layout: { version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [] },
      },
    } as never)

    const message = buildSaveMessage()
    if (message.type === 'SAVE') expect(message.payload.content).toContain('style A fill:#112233,stroke:#445566,color:#778899')
  })

  it('embeds only V2 document-local route metadata while retaining every explicit route mode', () => {
    const semanticSource = 'flowchart TD\n  A[Start]\n  B[Middle]\n  C[End]\n  A --> B\n  B --> C\n  C --> A\n'
    vi.mocked(useStore.getState).mockReturnValue({
      nodes: [],
      edges: [
        { id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow' } },
        { id: 'e-B-C', source: 'B', target: 'C', data: { style: 'arrow' } },
        { id: 'e-C-A', source: 'C', target: 'A', data: { style: 'arrow' } },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
      smartRouting: true,
      newEdgeRouteMode: 'curved',
      documentSession: {
        sessionId: 'session-1', family: 'flowchart', baseHostRevision: 7, workingRevision: 9, source: semanticSource,
        layout: {
          version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
          edges: {
            'edge:e-A-B': { routeMode: 'straight' },
            'edge:e-B-C': { routeMode: 'orthogonal', waypoints: [{ x: 20, y: 40 }, { x: 80, y: 40 }] },
            'edge:e-C-A': { routeMode: 'curved' },
          },
        },
      },
    } as never)

    const message = buildSaveMessage()
    if (message.type !== 'SAVE') throw new Error('Expected save message')
    const saved = readEmbeddedLayoutV2(message.payload.content, 'flowchart')

    expect(saved.content).toBe(semanticSource)
    expect(saved.layout?.edges).toEqual({
      'edge:e-A-B': { routeMode: 'straight' },
      'edge:e-B-C': { routeMode: 'orthogonal', waypoints: [{ x: 20, y: 40 }, { x: 80, y: 40 }] },
      'edge:e-C-A': { routeMode: 'curved' },
    })
    expect(message.payload.content).not.toContain('smartRouting')
    expect(message.payload.content).not.toContain('newEdgeRouteMode')
  })

  it('round-trips attachment sides through the embedded V2 layout', () => {
    const semanticSource = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    vi.mocked(useStore.getState).mockReturnValue({
      nodes: [],
      edges: [{ id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow' } }],
      viewport: { x: 0, y: 0, zoom: 1 },
      documentSession: {
        sessionId: 'session-attachments', family: 'flowchart', baseHostRevision: 2, workingRevision: 3, source: semanticSource,
        layout: {
          version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
          edges: { 'edge:e-A-B': { routeMode: 'straight', sourceSide: 'bottom', targetSide: 'left' } },
        },
      },
    } as never)

    const message = buildSaveMessage()
    if (message.type !== 'SAVE') throw new Error('Expected save message')
    const saved = readEmbeddedLayoutV2(message.payload.content, 'flowchart')

    expect(saved.content).toBe(semanticSource)
    expect(saved.layout?.edges).toEqual({
      'edge:e-A-B': { routeMode: 'straight', sourceSide: 'bottom', targetSide: 'left' },
    })
  })
})

describe('useManualSave', () => {
  beforeEach(() => {
    vi.mocked(useStore.getState).mockReturnValue({
      syncDirection: null,
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as never)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('sends SAVE immediately on Ctrl+S', () => {
    renderHook(() => useManualSave())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
    })
    expect(sendToHost).toHaveBeenCalledWith({
      type: 'SAVE',
      payload: expect.objectContaining({ content: expect.any(String) }),
    })
  })

  it('sends SAVE immediately on Meta+S (Mac)', () => {
    renderHook(() => useManualSave())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true }))
    })
    expect(sendToHost).toHaveBeenCalledWith({
      type: 'SAVE',
      payload: expect.objectContaining({ content: expect.any(String) }),
    })
  })
})
