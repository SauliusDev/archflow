import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// vi.mock() is hoisted to top of file by Vitest's transform pipeline.
vi.mock('zustand')

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  useReactFlow: () => ({ screenToFlowPosition: vi.fn((p: { x: number; y: number }) => p) }),
}))

import Palette from './Palette'
import { useStore } from '@/state/createStore'
import { mockReactFlow } from '../../../setupTests'
import { classAdapter } from '@/features/class-diagram'
import { addScratchpadShape, readScratchpadShapeIds } from '../state/scratchpadShapes'
import { createDocumentSession } from '@/lib/documentSession'
import type { LayoutStateV2 } from '../../../../shared/diagram-contracts'

mockReactFlow()

const mockOnClose = vi.fn()
const mockTriggerRef = { current: null } as React.RefObject<HTMLButtonElement | null>
const classLayout: LayoutStateV2 = {
  version: 2,
  diagramFamily: 'class',
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: {},
  edges: {},
  constraints: [],
}

function initializeClassDocument(source = 'classDiagram\n'): void {
  useStore.getState().initializeDocumentSession(
    createDocumentSession('palette-class', 1, classAdapter.parse(source, 1), classLayout),
  )
}

describe('Palette', () => {
  beforeEach(() => {
    mockOnClose.mockClear()
    useStore.setState({ nodes: [], edges: [] })
    window.localStorage.clear()
  })

  it('renders title "Shapes" in header', () => {
    const { container } = render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const title = container.querySelector('.component-palette__title')
    expect(title?.textContent).toBe('Shapes')
  })

  it('renders close button with aria-label="Close palette"', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    expect(screen.getByRole('button', { name: 'Close palette' })).toBeTruthy()
  })

  it('renders search input with placeholder "Search shapes…"', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const input = screen.getByPlaceholderText('Search shapes…')
    expect(input).toBeTruthy()
  })

  it('renders Scratchpad, General, and Advanced shape sections including Note', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const labels = ['Rectangle', 'Rounded', 'Stadium', 'Decision', 'Circle', 'Hexagon', 'Cylinder', 'Bang', 'Document', 'Subgraph', 'Swimlane', 'Note']
    for (const label of labels) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByRole('heading', { name: 'Scratchpad' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'General' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Advanced' })).toBeTruthy()
  })

  it('offers only class actions for class documents and creates a class', () => {
    initializeClassDocument()
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)

    expect(screen.getByRole('button', { name: 'Class' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rectangle' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Decision' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Subgraph' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Class' }))
    expect(useStore.getState().codeSource).toContain('class Class {')
  })

  it('clicking close button calls onClose', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close palette' }))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('typing in search filters shapes (type "dec" → only Decision visible)', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const input = screen.getByPlaceholderText('Search shapes…')
    fireEvent.change(input, { target: { value: 'dec' } })
    expect(screen.getByRole('button', { name: 'Decision' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Rectangle' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Circle' })).toBeNull()
  })

  it('clearing search shows all shapes again', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const input = screen.getByPlaceholderText('Search shapes…')
    fireEvent.change(input, { target: { value: 'dia' } })
    fireEvent.change(input, { target: { value: '' } })
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(8)
  })

  it('shows empty state message when search matches nothing', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const input = screen.getByPlaceholderText('Search shapes…')
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText(/No shapes match/)).toBeTruthy()
  })

  it('Escape key calls onClose', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('shapes category label renders as uppercase text', () => {
    const { container } = render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const category = container.querySelector('.component-palette__category')
    expect(category).toBeTruthy()
    expect(category?.textContent).toBe('Scratchpad')
  })

  it('clicking a non-subgraph shape item calls addNode with the correct shape', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    const nodes = useStore.getState().nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0].data.shape).toBe('rectangle')
    expect(nodes[0].data.label).toBe('Rectangle')
  })

  it('removes scratchpad shapes from the add-element panel without adding a node', () => {
    addScratchpadShape('general:document')
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Remove Document from Scratchpad' }))

    expect(readScratchpadShapeIds()).toEqual([])
    expect(screen.queryByRole('button', { name: 'Remove Document from Scratchpad' })).toBeNull()
    expect(screen.getByText(/Save any shape from its node toolbar/)).toBeTruthy()
    expect(useStore.getState().nodes).toEqual([])
  })

  it('creates a generalized shape with the same data from keyboard activation and returns focus to its trigger', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    const triggerRef = { current: trigger } as React.RefObject<HTMLButtonElement | null>
    try {
      render(<Palette onClose={mockOnClose} triggerRef={triggerRef} />)
      fireEvent.keyDown(screen.getByRole('button', { name: 'Bang' }), { key: 'Enter' })

      expect(useStore.getState().nodes[0].data).toMatchObject({
        label: 'Bang', shape: 'rectangle', mermaidShape: 'bang',
      })
      expect(document.activeElement).toBe(trigger)
    } finally {
      trigger.remove()
    }
  })

  it('clicking the subgraph shape item calls addSubgraph', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    fireEvent.click(screen.getByRole('button', { name: 'Subgraph' }))
    const nodes = useStore.getState().nodes
    expect(nodes).toHaveLength(1)
    expect(nodes[0].data.isSubgraph).toBe(true)
  })

  it('cannot mutate a locked flowchart through palette click paths', () => {
    useStore.setState({ isLocked: true, nodes: [], edges: [], history: { past: [], future: [] } })
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Subgraph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Swimlane' }))

    expect(useStore.getState().nodes).toEqual([])
    expect(useStore.getState().history).toEqual({ past: [], future: [] })
  })

  it('onDragStart on a shape item sets dataTransfer with the shape name', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    const mockSetData = vi.fn()
    const shapeItem = screen.getByRole('button', { name: 'Rectangle' })
    fireEvent.dragStart(shapeItem, {
      dataTransfer: { setData: mockSetData, effectAllowed: '' },
    })
    expect(mockSetData).toHaveBeenCalledWith('application/reactflow-palette', 'rectangle')
  })

  it('outside click calls onClose', () => {
    render(<Palette onClose={mockOnClose} triggerRef={mockTriggerRef} />)
    fireEvent.mouseDown(document.body)
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })
})
