import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// vi.mock() is hoisted to top of file by Vitest's transform pipeline.
// Must be at top level — not inside a function or beforeEach.
vi.mock('zustand')

const mockFitView = vi.fn()
vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  useReactFlow: () => ({ fitView: mockFitView }),
}))

vi.mock('@/features/flowchart', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/flowchart')>(),
  Palette: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="mock-palette" onClick={onClose} />
  ),
}))

import CanvasSidebar from './CanvasSidebar'
import { useStore } from '@/state/createStore'
import { mockReactFlow } from '../../../setupTests'
import { createDocumentSession } from '@/lib/documentSession'
import { flowchartCompatibilityAdapter } from '@/features/flowchart'

mockReactFlow()

describe('CanvasSidebar', () => {
  beforeEach(() => {
    mockFitView.mockClear()
  })

  it('does not render the obsolete Select or Add Edge controls', () => {
    render(<CanvasSidebar />)
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Edge' })).toBeNull()
  })

  it('renders button with aria-label="Add Subgraph"', () => {
    render(<CanvasSidebar />)
    expect(screen.getByRole('button', { name: 'Add Subgraph' })).toBeTruthy()
  })

  it('renders button with aria-label="Undo"', () => {
    render(<CanvasSidebar />)
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy()
  })

  it('renders button with aria-label="Redo"', () => {
    render(<CanvasSidebar />)
    expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy()
  })

  it('renders button with aria-label="Auto Layout"', () => {
    render(<CanvasSidebar />)
    expect(screen.getByRole('button', { name: 'Apply auto-layout' })).toBeTruthy()
  })

  it('renders button with aria-label="Zoom to Fit"', () => {
    render(<CanvasSidebar />)
    expect(screen.getByRole('button', { name: 'Zoom to Fit' })).toBeTruthy()
  })

  it('opens the bulk edge route menu and applies the selected route mode', () => {
    const setAllEdgeRouteModes = vi.fn()
    useStore.setState({
      edges: [{ id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow' } }],
      isLocked: false,
      setAllEdgeRouteModes,
    } as never)

    render(<CanvasSidebar />)
    const trigger = screen.getByRole('button', { name: 'Change all edge routes' })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.parentElement?.getAttribute('data-tooltip')).toBeTruthy()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.parentElement?.getAttribute('data-tooltip')).toBeNull()
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['Straight', 'Orthogonal', 'Curved'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Orthogonal' }))

    expect(setAllEdgeRouteModes).toHaveBeenCalledWith('orthogonal')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it.each([
    ['locked', { isLocked: true, edges: [{ id: 'e-A-B', source: 'A', target: 'B', data: { style: 'arrow' } }] }],
    ['there are no edges', { isLocked: false, edges: [] }],
  ])('disables bulk edge route changes when %s', (_state, storeState) => {
    useStore.setState(storeState as never)

    render(<CanvasSidebar />)

    expect((screen.getByRole('button', { name: 'Change all edge routes' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('toggles the persisted inspector visibility with an accessible active control', () => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('sidebar-inspector', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    }))

    render(<CanvasSidebar />)
    const hideInspector = screen.getByRole('button', { name: 'Hide inspector' })
    expect(hideInspector.getAttribute('aria-pressed')).toBe('true')
    expect(hideInspector.classList.contains('canvas-sidebar__btn--active')).toBe(true)

    fireEvent.click(hideInspector)

    expect(useStore.getState().documentSession?.layout.inspectorVisible).toBe(false)
    const showInspector = screen.getByRole('button', { name: 'Show inspector' })
    expect(showInspector.getAttribute('aria-pressed')).toBe('false')
    expect(showInspector.classList.contains('canvas-sidebar__btn--active')).toBe(false)
    fireEvent.click(showInspector)
    expect(useStore.getState().documentSession?.layout.inspectorVisible).toBe(true)
  })

  it('undo button is disabled when history is empty (default)', () => {
    render(<CanvasSidebar />)
    const undoBtn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
  })

  it('redo button is disabled when history is empty (default)', () => {
    render(<CanvasSidebar />)
    const redoBtn = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement
    expect(redoBtn.disabled).toBe(true)
  })

  it('uses active document-session transactions to enable and execute Undo', () => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('sidebar-history', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    }))
    useStore.getState().importFromCode(projection.model)
    useStore.getState().addNode({ id: 'B', type: 'flowNode', position: { x: 120, y: 0 }, data: { label: 'Beta', shape: 'rectangle' } })

    render(<CanvasSidebar />)
    const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    expect(undo.disabled).toBe(false)
    fireEvent.click(undo)

    expect(useStore.getState().codeSource).not.toContain('B[Beta]')
    expect(useStore.getState().announcement).toBe('Undo Add node B')
  })

  it('uses active document-session transactions to enable and execute Redo after Undo', () => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('sidebar-redo', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    }))
    useStore.getState().importFromCode(projection.model)
    useStore.getState().addNode({ id: 'B', type: 'flowNode', position: { x: 120, y: 0 }, data: { label: 'Beta', shape: 'rectangle' } })
    useStore.getState().undo()

    render(<CanvasSidebar />)
    const redo = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement
    expect(redo.disabled).toBe(false)
    fireEvent.click(redo)

    expect(useStore.getState().codeSource).toContain('B[Beta]')
    expect(useStore.getState().announcement).toBe('Redo Add node B')
  })

  it.each(['locked', 'conflicted'] as const)('disables session history controls when %s', (state) => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1)
    useStore.getState().initializeDocumentSession(createDocumentSession(`sidebar-${state}`, 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    }))
    useStore.getState().importFromCode(projection.model)
    useStore.getState().addNode({ id: 'B', type: 'flowNode', position: { x: 120, y: 0 }, data: { label: 'Beta', shape: 'rectangle' } })
    useStore.getState().undo()
    if (state === 'locked') useStore.setState({ isLocked: true })
    else useStore.setState({ documentSession: { ...useStore.getState().documentSession!, conflict: { eventId: 'external' } } })

    render(<CanvasSidebar />)
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables legacy Undo history while locked', () => {
    useStore.getState().addSubgraph()
    useStore.setState({ isLocked: true })

    render(<CanvasSidebar />)
    expect((screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('disables legacy Redo history while locked', () => {
    useStore.getState().addSubgraph()
    useStore.getState().undo()
    useStore.setState({ isLocked: true })

    render(<CanvasSidebar />)
    expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('exposes disabled history help from a hoverable tooltip wrapper while retaining disabled buttons', () => {
    render(<CanvasSidebar />)

    for (const name of ['Undo', 'Redo']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement
      expect(button.disabled).toBe(true)
      expect(button.parentElement?.getAttribute('data-tooltip')).toBe(`${name} last change`)
    }
  })

  it('clicking Add Node button toggles palette open', () => {
    render(<CanvasSidebar />)
    expect(screen.queryByTestId('mock-palette')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add Node' }))
    expect(screen.getByTestId('mock-palette')).toBeTruthy()
  })

  it('Add Node button has canvas-sidebar__btn--active class when palette is open', () => {
    render(<CanvasSidebar />)
    const addBtn = screen.getByRole('button', { name: 'Add Node' })
    expect(addBtn.classList.contains('canvas-sidebar__btn--active')).toBe(false)
    fireEvent.click(addBtn)
    expect(addBtn.classList.contains('canvas-sidebar__btn--active')).toBe(true)
  })

  it('clicking Add Node again closes palette (toggle behavior)', () => {
    render(<CanvasSidebar />)
    const addBtn = screen.getByRole('button', { name: 'Add Node' })
    fireEvent.click(addBtn)
    expect(screen.getByTestId('mock-palette')).toBeTruthy()
    fireEvent.click(addBtn)
    expect(screen.queryByTestId('mock-palette')).toBeNull()
  })

  it('undo button is enabled after a node is added', () => {
    render(<CanvasSidebar />)
    const undoBtn = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement
    expect(undoBtn.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add Subgraph' }))
    expect(undoBtn.disabled).toBe(false)
  })

  it('clicking undo button removes the added node', () => {
    render(<CanvasSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Subgraph' }))
    expect(useStore.getState().nodes).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useStore.getState().nodes).toHaveLength(0)
  })

  it('clicking add-subgraph button adds a subgraph to the store', () => {
    render(<CanvasSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Subgraph' }))
    expect(useStore.getState().nodes).toHaveLength(1)
    expect(useStore.getState().nodes[0].data.isSubgraph).toBe(true)
  })

  it('clicking zoom-to-fit button uses adaptive canvas framing', () => {
    render(<CanvasSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom to Fit' }))
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 200, maxZoom: 1 })
  })

  it('clicking auto-layout button calls fitView() when nodes exist', () => {
    render(<CanvasSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Subgraph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply auto-layout' }))
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2 })
  })

  it('clicking redo button restores node removed by undo', () => {
    render(<CanvasSidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Subgraph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useStore.getState().nodes).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(useStore.getState().nodes).toHaveLength(1)
  })

  it('renders two dividers in the sidebar', () => {
    const { container } = render(<CanvasSidebar />)
    const dividers = container.querySelectorAll('.canvas-sidebar__divider')
    expect(dividers).toHaveLength(2)
  })

  it.each([
    'Add Node',
    'Add Subgraph',
    'Undo',
    'Redo',
    'Apply auto-layout',
    'Zoom to Fit',
    'Hide inspector',
  ])('gives the %s icon control an informative hover tooltip', (name) => {
    render(<CanvasSidebar />)
    expect(screen.getByRole('button', { name }).parentElement?.getAttribute('data-tooltip')).toBeTruthy()
  })
})
