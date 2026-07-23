import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

vi.mock('zustand')
vi.mock('@/vscode', () => ({ sendToHost: vi.fn() }))

import CommandPalette from './CommandPalette'
import { useStore } from '@/state/createStore'
import { sendToHost } from '@/vscode'
import { mockReactFlow } from '../../../setupTests'
import { makeEdge } from '@/test/store-helpers'
import { flowchartCompatibilityAdapter } from '@/features/flowchart'
import { createDocumentSession } from '@/lib/documentSession'
import type { LayoutStateV2 } from '@/shared/diagram-contracts'
import { embedLayoutInMermaid } from '@/lib/embeddedLayout'

mockReactFlow()

const mockTogglePanel = vi.fn()
const mockOnThemeChange = vi.fn()

function renderPalette(): ReturnType<typeof render> {
  return render(<CommandPalette onTogglePanel={mockTogglePanel} onThemeChange={mockOnThemeChange} />)
}

function openPalette(): void {
  act(() => {
    useStore.getState().openCommandPalette()
  })
}

describe('CommandPalette', () => {
  beforeEach(() => {
    mockTogglePanel.mockClear()
    mockOnThemeChange.mockClear()
    vi.mocked(sendToHost).mockClear()
  })

  it('does not render when commandPaletteOpen is false', () => {
    renderPalette()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByPlaceholderText('Search actions…')).toBeNull()
  })

  it('renders search input and action list when open', () => {
    renderPalette()
    openPalette()
    expect(screen.getByPlaceholderText('Search actions…')).toBeTruthy()
    const items = screen.getAllByRole('option')
    expect(items.length).toBeGreaterThan(0)
  })

  it('shows all shape creation actions', () => {
    renderPalette()
    openPalette()
    expect(screen.getByText('Add Rectangle Node')).toBeTruthy()
    expect(screen.getByText('Add Rounded Node')).toBeTruthy()
    expect(screen.getByText('Add Diamond Node')).toBeTruthy()
    expect(screen.getByText('Add Circle Node')).toBeTruthy()
    expect(screen.getByText('Add Hexagon Node')).toBeTruthy()
    expect(screen.getByText('Add Cylinder Node')).toBeTruthy()
    expect(screen.getByText('Add Subgraph Container')).toBeTruthy()
    expect(screen.getByText('Add Bang Node')).toBeTruthy()
  })

  it('matches the palette generalized-shape actions', () => {
    renderPalette()
    openPalette()
    for (const label of ['Bang', 'Notched rectangle', 'Hourglass', 'Bolt', 'Brace', 'Right brace', 'Braces', 'Lean right', 'Lean left', 'Horizontal cylinder', 'Lined cylinder', 'Curved trapezoid', 'Divided rectangle', 'Document', 'Triangle', 'Fork', 'Window pane', 'Filled circle', 'Lined rectangle', 'Small circle', 'Framed circle', 'Cross circle', 'Tagged document', 'Tagged rectangle', 'Trapezoid', 'Inverted trapezoid']) {
      expect(screen.getByText(`Add ${label} Node`)).toBeTruthy()
    }
  })

  it('creates a generalized shape through the same pending-node command as palette creation', () => {
    renderPalette()
    openPalette()
    act(() => {
      fireEvent.mouseDown(screen.getByText('Add Bang Node'))
    })
    expect(useStore.getState().pendingAddNode).toEqual({ shape: 'rectangle', mermaidShape: 'bang' })
  })

  it('typing filters actions by fuzzy match', () => {
    renderPalette()
    openPalette()
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.change(input, { target: { value: 'ul' } })
    })
    expect(screen.getByText('Apply Auto-Layout')).toBeTruthy()
    expect(screen.queryByText('Add Rectangle Node')).toBeNull()
  })

  it('typing is case-insensitive', () => {
    renderPalette()
    openPalette()
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.change(input, { target: { value: 'AUTO' } })
    })
    expect(screen.getByText('Apply Auto-Layout')).toBeTruthy()
  })

  it('shows empty state when query has no matches', () => {
    renderPalette()
    openPalette()
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.change(input, { target: { value: 'zzzzz' } })
    })
    expect(screen.getByText('No results')).toBeTruthy()
  })

  it('does not expose JSON save or load actions', () => {
    renderPalette()
    openPalette()
    expect(screen.queryByText(/JSON/i)).toBeNull()
  })

  it('exports semantic Mermaid through both palette delivery actions when code source contains layout metadata', () => {
    const semanticSource = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n'
    const projection = flowchartCompatibilityAdapter.parse(semanticSource, 1)
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
      edges: { 'edge:e-A-B': { routeMode: 'orthogonal', waypoints: [{ x: 24, y: 40 }, { x: 88, y: 40 }] } },
    }
    const session = createDocumentSession('export-palette', 1, projection, layout)
    const codeSource = embedLayoutInMermaid(semanticSource, layout)
    act(() => { useStore.setState({ documentSession: session, codeSource } as never) })

    renderPalette()
    openPalette()
    fireEvent.mouseDown(screen.getByText('Export as .mmd File'))
    openPalette()
    fireEvent.mouseDown(screen.getByText('Copy Mermaid Syntax'))

    expect(vi.mocked(sendToHost)).toHaveBeenNthCalledWith(1, {
      type: 'EXPORT', payload: { content: semanticSource, format: 'mmd', subtype: 'file' },
    })
    expect(vi.mocked(sendToHost)).toHaveBeenNthCalledWith(2, {
      type: 'EXPORT', payload: { content: semanticSource, format: 'mmd', subtype: 'clipboard' },
    })
    for (const [{ payload }] of vi.mocked(sendToHost).mock.calls) {
      expect(payload.content).not.toContain('FLOWFORGE LAYOUT')
    }
  })

  it('offers only explicit selected-edge route commands', () => {
    renderPalette()
    openPalette()

    for (const mode of ['Straight', 'Orthogonal', 'Curved']) {
      expect(screen.getByText(`Route Selected Edge: ${mode}`)).toBeTruthy()
    }
    expect(screen.queryByText('Route Selected Edge: Automatic')).toBeNull()
  })

  it('keeps route commands discoverable but disabled while the canvas is locked', () => {
    useStore.setState({ isLocked: true })
    renderPalette()
    openPalette()

    const action = screen.getByText('Route Selected Edge: Curved').closest('[role="option"]')
    expect(action?.getAttribute('aria-disabled')).toBe('true')
    fireEvent.mouseDown(action!)
    expect(useStore.getState().commandPaletteOpen).toBe(true)
  })

  it.each(['straight', 'orthogonal', 'curved'] as const)('dispatches %s routing and closes when unlocked', routeMode => {
    const setEdgeRouteMode = vi.fn()
    useStore.setState({
      isLocked: false,
      edges: [makeEdge('e-a-b', 'a', 'b', { selected: true })],
      setEdgeRouteMode,
    } as never)
    renderPalette()
    openPalette()

    fireEvent.mouseDown(screen.getByText(`Route Selected Edge: ${routeMode[0].toUpperCase()}${routeMode.slice(1)}`))
    expect(setEdgeRouteMode).toHaveBeenCalledWith('e-a-b', routeMode)
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('filters unrelated disabled actions while retaining only locked route commands', () => {
    useStore.setState({ isLocked: true })
    renderPalette()
    openPalette()

    expect(screen.getAllByRole('option', { name: /Route Selected Edge/ }).filter(item => item.getAttribute('aria-disabled') === 'true')).toHaveLength(3)
    expect(screen.queryByRole('option', { name: /Apply Auto-Layout/ })?.getAttribute('aria-disabled')).toBeNull()
  })

  it('does not issue a route command if a previously unlocked action becomes locked before activation', () => {
    const setEdgeRouteMode = vi.fn()
    useStore.setState({
      isLocked: false,
      edges: [makeEdge('e-a-b', 'a', 'b', { selected: true })],
      setEdgeRouteMode,
    } as never)
    renderPalette()
    openPalette()
    const action = screen.getByText('Route Selected Edge: Curved').closest('[role="option"]')!
    const current = useStore.getState()
    const getState = vi.spyOn(useStore, 'getState').mockReturnValue({ ...current, isLocked: true } as never)

    fireEvent.mouseDown(action)
    getState.mockRestore()

    expect(setEdgeRouteMode).not.toHaveBeenCalled()
    expect(useStore.getState().commandPaletteOpen).toBe(true)
  })

  it('leaves document state untouched for locked mouse and keyboard route activation', () => {
    const source = 'flowchart LR\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const projection = flowchartCompatibilityAdapter.parse(source, 1)
    const layout: LayoutStateV2 = {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 },
      elements: {}, edges: { 'edge:e-A-B': { routeMode: 'straight' } }, constraints: [],
    }
    const session = createDocumentSession('locked-route-palette', 1, projection, layout)
    const edge = { ...projection.model.edges[0], selected: true }
    useStore.setState({
      isLocked: true, edges: [edge], documentSession: session, codeSource: source,
      history: { past: [], future: [] }, isDirty: false,
    } as never)
    const before = useStore.getState()
    renderPalette()
    openPalette()

    fireEvent.mouseDown(screen.getByText('Route Selected Edge: Curved'))
    fireEvent.change(screen.getByPlaceholderText('Search actions…'), { target: { value: 'curved' } })
    fireEvent.keyDown(screen.getByPlaceholderText('Search actions…'), { key: 'Enter' })

    const after = useStore.getState()
    expect(after.edges).toBe(before.edges)
    expect(after.documentSession).toBe(before.documentSession)
    expect(after.codeSource).toBe(source)
    expect(after.history).toBe(before.history)
    expect(after.isDirty).toBe(false)
    expect(after.documentSession?.layout).toBe(before.documentSession?.layout)
  })

  it('pressing Escape calls closeCommandPalette', () => {
    renderPalette()
    openPalette()
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.keyDown(input, { key: 'Escape' })
    })
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('clicking backdrop closes palette', () => {
    const { container } = renderPalette()
    openPalette()
    const backdrop = container.querySelector('.command-palette-backdrop')!
    act(() => {
      fireEvent.mouseDown(backdrop)
    })
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('clicking inner panel does not close palette', () => {
    const { container } = renderPalette()
    openPalette()
    const panel = container.querySelector('.command-palette')!
    act(() => {
      fireEvent.mouseDown(panel)
    })
    expect(useStore.getState().commandPaletteOpen).toBe(true)
  })

  it('ArrowDown moves selection to next item', () => {
    renderPalette()
    openPalette()
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })
    const items = screen.getAllByRole('option')
    expect(items[1].getAttribute('aria-selected')).toBe('true')
  })

  it('ArrowDown wraps from last to first', () => {
    renderPalette()
    openPalette()
    // Filter to 2 items — "Zoom In" and "Zoom Out" both contain "zoom"
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.change(input, { target: { value: 'zoom i' } })
    })
    // Should show "Zoom In" only — navigate to it with ArrowDown then wrap
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowDown' })
    })
    // Now at last item (first), ArrowDown wraps to first
    const items = screen.getAllByRole('option')
    expect(items[0].getAttribute('aria-selected')).toBe('true')
  })

  it('ArrowUp wraps from first to last', () => {
    renderPalette()
    openPalette()
    // Filter to exactly 2 items
    const input = screen.getByPlaceholderText('Search actions…')
    act(() => {
      fireEvent.change(input, { target: { value: 'fit v' } })
    })
    // "Fit View" — single item. Navigate up from first (idx 0) wraps to last.
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowUp' })
    })
    const items = screen.getAllByRole('option')
    expect(items[items.length - 1].getAttribute('aria-selected')).toBe('true')
  })

  it('pressing Enter executes selected action and closes palette', () => {
    renderPalette()
    openPalette()
    const input = screen.getByPlaceholderText('Search actions…')
    // Filter to just Undo
    act(() => {
      fireEvent.change(input, { target: { value: 'undo' } })
    })
    // Add a node first to create history so undo does something
    useStore.getState().addNode({ id: 'n1', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } })
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    // palette should be closed
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('clicking an action executes it and closes palette', () => {
    renderPalette()
    openPalette()
    const canvasItem = screen.getByText('Toggle Canvas Panel')
    act(() => {
      fireEvent.mouseDown(canvasItem)
    })
    expect(mockTogglePanel).toHaveBeenCalledWith('canvas')
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('"Add Rectangle Node" action calls requestAddNode', () => {
    renderPalette()
    openPalette()
    const item = screen.getByText('Add Rectangle Node')
    act(() => {
      fireEvent.mouseDown(item)
    })
    expect(useStore.getState().pendingAddNode).toEqual({ shape: 'rectangle' })
  })

  it('"Undo" action calls undo store action', () => {
    renderPalette()
    // Add a node to create history
    useStore.getState().addNode({ id: 'n1', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' } })
    expect(useStore.getState().nodes).toHaveLength(1)
    openPalette()
    const item = screen.getByText('Undo')
    act(() => {
      fireEvent.mouseDown(item)
    })
    expect(useStore.getState().nodes).toHaveLength(0)
  })

  it('"Apply Auto-Layout" action delegates to root state when nodes exist', () => {
    const applyAutoLayout = vi.fn()
    const node = { id: 'n1', type: 'flowNode', position: { x: 0, y: 0 }, data: { label: 'A', shape: 'rectangle' as const } }
    useStore.setState({ nodes: [node], edges: [], applyAutoLayout } as never)

    renderPalette()
    openPalette()
    const item = screen.getByText('Apply Auto-Layout')
    act(() => {
      fireEvent.mouseDown(item)
    })
    expect(applyAutoLayout).toHaveBeenCalledOnce()
  })

  it('search input is auto-focused when palette opens', () => {
    vi.useFakeTimers()
    try {
      renderPalette()
      act(() => {
        useStore.getState().openCommandPalette()
      })
      act(() => {
        vi.runAllTimers()
      })
      const input = screen.getByPlaceholderText('Search actions…')
      expect(document.activeElement).toBe(input)
    } finally {
      vi.useRealTimers()
    }
  })

  it('"Switch to Dark Theme" action appears in command list', () => {
    renderPalette()
    openPalette()
    expect(screen.getByText('Switch to Dark Theme')).toBeTruthy()
  })

  it('"Switch to Adaptive Theme" action appears in command list', () => {
    renderPalette()
    openPalette()
    expect(screen.getByText('Switch to Adaptive Theme')).toBeTruthy()
  })

  it('executing "Switch to Adaptive Theme" calls onThemeChange with "adaptive"', () => {
    renderPalette()
    openPalette()
    const item = screen.getByText('Switch to Adaptive Theme')
    act(() => {
      fireEvent.mouseDown(item)
    })
    expect(mockOnThemeChange).toHaveBeenCalledWith('adaptive')
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('executing "Switch to Dark Theme" calls onThemeChange with "dark"', () => {
    renderPalette()
    openPalette()
    const item = screen.getByText('Switch to Dark Theme')
    act(() => {
      fireEvent.mouseDown(item)
    })
    expect(mockOnThemeChange).toHaveBeenCalledWith('dark')
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })

  it('executing "Switch to Light Theme" calls onThemeChange with "light"', () => {
    renderPalette()
    openPalette()
    const item = screen.getByText('Switch to Light Theme')
    act(() => {
      fireEvent.mouseDown(item)
    })
    expect(mockOnThemeChange).toHaveBeenCalledWith('light')
    expect(useStore.getState().commandPaletteOpen).toBe(false)
  })
})
