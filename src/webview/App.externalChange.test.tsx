import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, fireEvent, screen } from '@testing-library/react'
import type { HostToWebviewMessage } from '../shared/protocol'
import type { Node, Edge } from '@xyflow/react'
import type { FlowNodeData, FlowEdgeData } from '@/features/flowchart'

// --- Module mocks (hoisted by Vitest before imports) ---

vi.mock('zustand')

// Mock vscode — spy on sendToHost, keep real window-event behavior for onHostMessage
vi.mock('./vscode', () => ({
  sendToHost: vi.fn(),
  onHostMessage: (handler: (msg: HostToWebviewMessage) => void) => {
    const listener = (event: MessageEvent<HostToWebviewMessage>) => handler(event.data)
    window.addEventListener('message', listener)
    return () => window.removeEventListener('message', listener)
  },
}))

// Mock heavy child components so App can render without ReactFlow
vi.mock('./features/canvas-shell', async () => {
  const { useSmartRouting } = await import('./features/flowchart/ui/SmartRoutingContext')
  return { default: () => <div data-testid="canvas" data-smart-routing={String(useSmartRouting())}>Canvas</div> }
})
vi.mock('./features/settings', () => ({
  TopBar: ({ onThemeChange }: { onThemeChange: (theme: 'dark' | 'light' | 'adaptive') => void }) => (
    <div>
      <button onClick={() => onThemeChange('dark')}>Theme Dark</button>
      <button onClick={() => onThemeChange('light')}>Theme Light</button>
      <button onClick={() => onThemeChange('adaptive')}>Theme Adaptive</button>
    </div>
  ),
  CommandPalette: () => null,
  SettingsDialog: () => null,
}))
vi.mock('./components/ui/PanelLayout', () => ({ default: ({ canvas }: { canvas: React.ReactNode }) => <>{canvas}</> }))
vi.mock('./components/ui/CodePreviewFallback', () => ({
  default: ({ family, reason }: { family: string; reason?: string }) => <div data-testid="code-preview-fallback">{family}:{reason}</div>,
}))

// Mock auto-save hooks (would subscribe to store / set timers)
vi.mock('./lib/autoSave', () => ({
  useAutoSave: vi.fn(),
  useManualSave: vi.fn(),
}))

// Mock layout — return nodes with fixed positions so assertions are deterministic
vi.mock('@/features/flowchart', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/flowchart')>(),
  // Distinct positions per node. Stacking every node on one point hid whether
  // Dagre's output is placed relative to the saved nodes or in its own origin.
  applyDagreLayout: vi.fn((nodes: Node<FlowNodeData>[]) =>
    nodes.map((n, index) => ({ ...n, position: { x: 100, y: 200 + index * 150 } }))
  ),
  // Mock parser so each test controls exactly what nodes/edges come back.
  parseMermaidFlowchart: vi.fn(),
}))

// --- Imports after mocks ---

import App from './App'
import { useStore } from '@/state/createStore'
import { sendToHost } from './vscode'
import { applyDagreLayout } from '@/features/flowchart'
import { parseMermaidFlowchart } from '@/features/flowchart'

// --- Helpers ---

function makeFlowNode(id: string): Node<FlowNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: id, shape: 'rectangle' },
    type: 'flowNode',
  }
}

function dispatchHostMessage(msg: HostToWebviewMessage): void {
  window.dispatchEvent(new MessageEvent('message', { data: msg }))
}

function makeParseSuccess(nodes: Node<FlowNodeData>[], edges: Edge<FlowEdgeData>[] = []) {
  return { nodes, edges, passthroughLines: [] }
}

// --- Tests ---

describe('App.tsx — EXTERNAL_FILE_CHANGE and LOAD message handling', () => {
  let unmount: () => void

  beforeEach(() => {
    vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([]))
    vi.mocked(applyDagreLayout).mockImplementation((nodes: Node<FlowNodeData>[]) =>
      nodes.map((n, index) => ({ ...n, position: { x: 100, y: 200 + index * 150 } }))
    )

    const result = render(<App />)
    unmount = result.unmount
    vi.mocked(sendToHost).mockClear()
  })

  afterEach(() => {
    unmount()
    document.documentElement.removeAttribute('data-theme')
    vi.clearAllMocks()
  })

  it('keeps theme selection local while preserving the document session', () => {
    act(() => dispatchHostMessage({
      type: 'LOAD', sessionId: 'theme-session', baseRevision: 1, eventId: 'theme-load',
      payload: { content: 'flowchart TD\n  A-->B', sessionId: 'theme-session', hostRevision: 1, workingRevision: 1 },
    }))
    const loadedSession = useStore.getState().documentSession!
    const session = { ...loadedSession, dirty: true }
    useStore.setState({ documentSession: session, isDirty: true })
    vi.mocked(sendToHost).mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'Theme Light' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(useStore.getState().documentSession).toBe(session)
    expect(sendToHost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Theme Adaptive' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('vscode-adaptive')
    expect(useStore.getState().documentSession).toBe(session)
    expect(sendToHost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Theme Dark' }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(useStore.getState().documentSession).toBe(session)
    expect(sendToHost).not.toHaveBeenCalled()
  })

  describe('EXTERNAL_FILE_CHANGE', () => {
    function loadSession(content = 'flowchart TD\n  A[Local]'): void {
      act(() => {
        dispatchHostMessage({
          type: 'LOAD',
          sessionId: 'session-1',
          baseRevision: 1,
          eventId: 'load-1',
          payload: { content, sessionId: 'session-1', hostRevision: 1, workingRevision: 1 },
        })
      })
      vi.mocked(sendToHost).mockClear()
    }

    it('preserves local and external source in conflict when the session is dirty', () => {
      const nodeA = makeFlowNode('A')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))
      loadSession()
      const session = useStore.getState().documentSession!
      useStore.setState({ documentSession: { ...session, dirty: true }, isDirty: true })

      dispatchHostMessage({
        type: 'EXTERNAL_FILE_CHANGE',
        sessionId: 'session-1',
        baseRevision: 2,
        eventId: 'external-1',
        payload: { content: 'flowchart TD\n  A[External]', hostRevision: 2, eventId: 'external-1' },
      })

      expect(vi.mocked(sendToHost)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LOG',
          payload: expect.objectContaining({ level: 'warn' }),
        })
      )
      expect(useStore.getState().documentSession?.source).toContain('Local')
      expect(useStore.getState().documentSession?.conflict).toMatchObject({
        content: 'flowchart TD\n  A[External]',
        hostRevision: 2,
      })
    })

    it('acknowledges a same-content external echo without blocking undo', () => {
      const nodeA = makeFlowNode('A')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))
      loadSession()
      const session = useStore.getState().documentSession!
      useStore.setState({ documentSession: { ...session, dirty: true }, isDirty: true })

      dispatchHostMessage({
        type: 'EXTERNAL_FILE_CHANGE',
        sessionId: 'session-1',
        baseRevision: 2,
        eventId: 'same-content-echo',
        payload: { content: 'flowchart TD\n  A[Local]', hostRevision: 2 },
      })

      expect(useStore.getState().documentSession).toMatchObject({
        baseHostRevision: 2,
        conflict: null,
        dirty: false,
      })
    })

    it('adopts a valid external revision when the session is clean', () => {
      const nodeA = makeFlowNode('A')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))
      loadSession()

      dispatchHostMessage({
        type: 'EXTERNAL_FILE_CHANGE',
        sessionId: 'session-1',
        baseRevision: 2,
        eventId: 'external-1',
        payload: { content: 'flowchart TD\n  A[External]', hostRevision: 2, eventId: 'external-1' },
      })

      expect(useStore.getState().nodes.length).toBeGreaterThan(0)
      expect(useStore.getState().codeSource).toBe('flowchart TD\n  A[External]')
      expect(useStore.getState().documentSession?.baseHostRevision).toBe(2)
      expect(useStore.getState().isDirty).toBe(false)
    })

    it('isolates an invalid external revision and keeps the active session', () => {
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([makeFlowNode('A')]))
      loadSession()
      const sessionBefore = useStore.getState().documentSession
      vi.mocked(parseMermaidFlowchart).mockReturnValue({ error: 'unexpected token' } as never)

      dispatchHostMessage({
        type: 'EXTERNAL_FILE_CHANGE',
        payload: { content: 'not valid mermaid' },
      })

      expect(vi.mocked(sendToHost)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'LOG',
          payload: expect.objectContaining({ level: 'error' }),
        })
      )
      expect(useStore.getState().documentSession).toBe(sessionBefore)
    })
  })

  describe('LOAD', () => {
    it('provides a host-loaded disabled Smart-routing preference to FlowEdge descendants', () => {
      act(() => {
        dispatchHostMessage({
          type: 'LOAD', sessionId: 'session-1', baseRevision: 1, eventId: 'load-1',
          payload: { content: 'flowchart TD', smartRouting: false, sessionId: 'session-1', hostRevision: 1, workingRevision: 1 },
        })
      })

      expect(screen.getByTestId('canvas').getAttribute('data-smart-routing')).toBe('false')
    })

    it('initializes unsupported families as byte-preserving code-preview sessions', () => {
      const source = 'sequenceDiagram\n  Alice->>Bob: Hello\n'
      act(() => dispatchHostMessage({
        type: 'LOAD', sessionId: 'sequence-session', baseRevision: 4, eventId: 'load-sequence',
        payload: { content: source, family: 'sequence', sessionId: 'sequence-session', hostRevision: 4, workingRevision: 4 },
      }))

      expect(useStore.getState().documentSession).toMatchObject({
        sessionId: 'sequence-session', family: 'sequence', source,
        projection: { model: { editable: false } },
      })
      expect(useStore.getState().codeSource).toBe(source)
      expect(useStore.getState().nodes).toEqual([])
    })

    it('routes supported class diagrams to the existing Canvas surface', () => {
      const source = 'classDiagram\nclass Account\n'

      act(() => dispatchHostMessage({
        type: 'LOAD', sessionId: 'class-session', baseRevision: 4, eventId: 'load-class',
        payload: { content: source, family: 'class', sessionId: 'class-session', hostRevision: 4, workingRevision: 4 },
      }))

      expect(screen.getByTestId('canvas')).toBeTruthy()
      expect(screen.queryByTestId('code-preview-fallback')).toBeNull()
      expect(useStore.getState().documentSession).toMatchObject({ family: 'class', source })
    })

    it('degrades an unsafe class construct to Code/Preview and restores Canvas after correction', () => {
      const unsafeSource = 'classDiagram\nclass `Unsafe Label`\n'

      act(() => dispatchHostMessage({
        type: 'LOAD', sessionId: 'unsafe-class-session', baseRevision: 4, eventId: 'load-unsafe-class',
        payload: { content: unsafeSource, family: 'class', sessionId: 'unsafe-class-session', hostRevision: 4, workingRevision: 4 },
      }))

      expect(screen.queryByTestId('canvas')).toBeNull()
      expect(screen.getByTestId('code-preview-fallback').textContent).toMatch(/Class label syntax is outside the supported subset/)
      expect(useStore.getState().documentSession).toMatchObject({ family: 'class', source: unsafeSource, dirty: false })
      expect(useStore.getState().codeSource).toBe(unsafeSource)

      act(() => useStore.getState().applyCodeSource('classDiagram\nclass Account\n'))

      expect(screen.getByTestId('canvas')).toBeTruthy()
      expect(screen.queryByTestId('code-preview-fallback')).toBeNull()
      expect(useStore.getState().documentSession?.projection.diagnostics).toEqual([])
    })

    it('keeps an invalid Code draft isolated from the accepted session and Canvas until corrected', () => {
      const nodeA = makeFlowNode('A')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))
      act(() => dispatchHostMessage({
        type: 'LOAD', sessionId: 'invalid-session', baseRevision: 2, eventId: 'load-invalid',
        payload: { content: 'flowchart TD\n  A[Accepted]\n', family: 'flowchart', sessionId: 'invalid-session', hostRevision: 2, workingRevision: 2 },
      }))
      const accepted = useStore.getState().documentSession
      vi.mocked(parseMermaidFlowchart).mockReturnValue({ error: 'Missing flowchart declaration' } as never)
      act(() => useStore.getState().applyCodeSource('not mermaid'))

      expect(useStore.getState().codeSource).toBe('not mermaid')
      expect(useStore.getState().documentSession).toBe(accepted)
      expect(useStore.getState().documentSession?.source).toBe('flowchart TD\n  A[Accepted]\n')
      expect(useStore.getState().nodes.map(node => node.id)).toEqual(['A'])
      expect(useStore.getState().announcement).toMatch(/fix.*code|invalid/i)

      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))
      act(() => useStore.getState().applyCodeSource('flowchart TD\n  A[Recovered]\n'))
      expect(useStore.getState().documentSession?.projection.diagnostics).toEqual([])
      expect(useStore.getState().nodes.map(node => node.id)).toEqual(['A'])
    })

    it('applies Dagre layout when no embedded layout exists', () => {
      const nodeA = makeFlowNode('A')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))

      act(() => {
        dispatchHostMessage({
          type: 'LOAD',
          payload: { content: 'flowchart TD\n  A[Test]' },
        })
      })

      expect(vi.mocked(applyDagreLayout)).toHaveBeenCalled()
      const node = useStore.getState().nodes[0]
      expect(node.position).toEqual({ x: 100, y: 200 })
    })

    it('calls requestFitView after Dagre layout when no embedded layout exists', () => {
      const nodeA = makeFlowNode('A')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA]))

      act(() => {
        dispatchHostMessage({
          type: 'LOAD',
          payload: { content: 'flowchart TD\n  A[Test]' },
        })
      })

      expect(useStore.getState().fitViewRequested).toBe(true)
    })

    it('uses embedded layout positions for known nodes and Dagre for new nodes', () => {
      const nodeA = makeFlowNode('A')
      const nodeB = makeFlowNode('B')
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([nodeA, nodeB]))

      const content = [
        'flowchart TD',
        '  A[Test]',
        '  B[Test2]',
        '',
        '%% FLOWFORGE LAYOUT START',
        '%% {',
        '%%   "version": 1,',
        '%%   "nodes": { "A": { "x": 50, "y": 60 } },',
        '%%   "viewport": { "x": 0, "y": 0, "zoom": 1 }',
        '%% }',
        '%% FLOWFORGE LAYOUT END',
        '',
      ].join('\n')

      act(() => {
        dispatchHostMessage({
          type: 'LOAD',
          payload: { content },
        })
      })

      const nodes = useStore.getState().nodes
      const storedA = nodes.find(n => n.id === 'A')
      const storedB = nodes.find(n => n.id === 'B')

      expect(storedA?.position).toEqual({ x: 50, y: 60 })
      // B has no saved position, so it takes Dagre's — but translated into the
      // coordinate space the saved nodes live in. Dagre put A at (100, 200) and
      // B 150px below it, and the file pins A to (50, 60), so B belongs at
      // (50, 210). Using Dagre's raw (100, 350) would drop B into a different
      // origin and let new nodes land on top of saved ones.
      expect(storedB?.position).toEqual({ x: 50, y: 210 })
    })

    it('restores V2 lane geometry, route mode, waypoints, and viewport while ignoring stale handles', () => {
      const lane = {
        ...makeFlowNode('Lane'),
        type: 'subgraphNode',
        data: { label: 'Lane', shape: 'subgraph' as const, isSubgraph: true },
      }
      const nodeA = { ...makeFlowNode('A'), parentId: 'Lane', extent: 'parent' as const, data: { label: 'Alpha', shape: 'rectangle' as const } }
      const nodeB = { ...makeFlowNode('B'), data: { label: 'Beta', shape: 'rectangle' as const } }
      const edge: Edge<FlowEdgeData> = {
        id: 'e-A-B', source: 'A', target: 'B', type: 'default', data: { style: 'arrow' },
      }
      vi.mocked(parseMermaidFlowchart).mockReturnValue(makeParseSuccess([lane, nodeA, nodeB], [edge]))
      const layout = {
        version: 2,
        diagramFamily: 'flowchart',
        viewport: { x: 11, y: 12, zoom: 1.2 },
        elements: {
          'node:Lane': { x: 40, y: 50, width: 300, height: 240 },
          'node:A': { x: 60, y: 70 },
          'node:stale': { x: 900, y: 900 },
        },
        edges: {
          'edge:e1': { routeMode: 'orthogonal', waypoints: [{ x: 150, y: 80 }] },
          'edge:stale': { routeMode: 'curved' },
        },
        constraints: [],
        adapterMetadata: { flowchart: { laneOrder: ['Lane', 'stale'] } },
      }
      const content = [
        'flowchart TD',
        '  subgraph Lane [Lane]',
        '    A[Alpha]',
        '  end',
        '  B[Beta]',
        '  A --> B',
        '',
        '%% FLOWFORGE LAYOUT START',
        ...JSON.stringify(layout, null, 2).split('\n').map(line => `%% ${line}`),
        '%% FLOWFORGE LAYOUT END',
        '',
      ].join('\n')

      act(() => dispatchHostMessage({ type: 'LOAD', payload: { content, family: 'flowchart' } }))

      const state = useStore.getState()
      expect(state.documentSession?.projection.diagnostics).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'code-preview-fallback' }),
      ]))
      expect(state.nodes.map(node => node.id)).toContain('Lane')
      expect(state.nodes.find(node => node.id === 'Lane')).toMatchObject({
        position: { x: 40, y: 50 }, width: 300, height: 240,
        data: { isLane: true },
      })
      expect(state.edges.find(candidate => candidate.id === 'e1')?.data).toMatchObject({
        routeMode: 'orthogonal', waypoints: [{ x: 150, y: 80 }],
      })
      expect(state.viewportToRestore).toEqual(layout.viewport)
      expect(state.nodes.some(node => node.id === 'stale')).toBe(false)
    })
  })

  describe('SAVE_RESULT', () => {
    it('calls clearDirty on success=true', () => {
      useStore.setState({ isDirty: true })

      dispatchHostMessage({
        type: 'SAVE_RESULT',
        payload: { success: true },
      })

      expect(useStore.getState().isDirty).toBe(false)
    })

    it('does not call clearDirty on success=false', () => {
      useStore.setState({ isDirty: true })

      dispatchHostMessage({
        type: 'SAVE_RESULT',
        payload: { success: false, error: 'disk full' },
      })

      expect(useStore.getState().isDirty).toBe(true)
    })
  })
})
