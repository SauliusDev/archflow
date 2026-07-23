import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import type { FlowNodeData } from '@/features/flowchart'
import { useStore } from '@/state/createStore'
import { createDocumentSession } from '@/lib/documentSession'
import { flowchartCompatibilityAdapter } from '@/features/flowchart'
import { FILL_SWATCHES, STROKE_SWATCHES, TEXT_SWATCHES } from '@/features/flowchart'
import CanvasNodeInspector from './CanvasNodeInspector'
import Canvas from './Canvas'

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ children }: { children: React.ReactNode }) => <div data-testid="react-flow-mock">{children}</div>,
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Background: () => <div />,
  BackgroundVariant: { Dots: 'dots', Lines: 'lines' },
  ConnectionMode: { Loose: 'loose' },
  SelectionMode: { Partial: 'partial' },
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useReactFlow: () => ({ screenToFlowPosition: (position: { x: number; y: number }) => position, setViewport: vi.fn(), fitView: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn() }),
  useViewport: () => ({ x: 0, y: 0, zoom: 1 }),
  useStore: (selector: (state: { width: number; height: number; transform: [number, number, number] }) => unknown) => selector({ width: 800, height: 600, transform: [0, 0, 1] }),
  applyNodeChanges: (_changes: unknown, nodes: unknown) => nodes,
}))

const node = (overrides: Partial<Node<FlowNodeData>> = {}): Node<FlowNodeData> => ({
  id: 'node-1', type: 'flowNode', position: { x: 0, y: 0 }, selected: true,
  data: { label: 'Draft', shape: 'rectangle' },
  ...overrides,
})

describe('CanvasNodeInspector', () => {
  beforeEach(() => {
    useStore.setState({ nodes: [], isLocked: false, documentSession: null })
  })

  it('renders controls for one selected ordinary flow node', () => {
    useStore.setState({ nodes: [node()] })

    render(<CanvasNodeInspector />)

    expect(screen.getByRole('complementary', { name: 'Node inspector' })).toBeTruthy()
    expect((screen.getByLabelText('Node text') as HTMLTextAreaElement).value).toBe('Draft')
    expect(screen.getByRole('button', { name: 'Align text left' })).toBeTruthy()
  })

  it('does not render for no selected ordinary node', () => {
    useStore.setState({ nodes: [node({ data: { label: 'Group', shape: 'subgraph', isSubgraph: true } })] })

    render(<CanvasNodeInspector />)

    expect(screen.queryByRole('complementary', { name: 'Node inspector' })).toBeNull()
  })

  it('does not render when an ordinary node and a subgraph are both selected', () => {
    useStore.setState({ nodes: [
      node(),
      node({ id: 'group-1', data: { label: 'Group', shape: 'subgraph', isSubgraph: true } }),
    ] })

    render(<CanvasNodeInspector />)

    expect(screen.queryByRole('complementary', { name: 'Node inspector' })).toBeNull()
  })

  it('updates multiline node text as it is typed', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeLabel = vi.spyOn(useStore.getState(), 'updateNodeLabel')

    render(<CanvasNodeInspector />)
    const text = screen.getByLabelText('Node text')
    fireEvent.change(text, { target: { value: 'First line\nSecond line' } })

    expect(updateNodeLabel).toHaveBeenCalledWith('node-1', 'First line\nSecond line')
    updateNodeLabel.mockRestore()
  })

  it('updates horizontal alignment from its explicit control', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeTextAlignment = vi.spyOn(useStore.getState(), 'updateNodeTextAlignment')

    render(<CanvasNodeInspector />)
    fireEvent.click(screen.getByRole('button', { name: 'Align text left' }))

    expect(updateNodeTextAlignment).toHaveBeenCalledWith('node-1', { horizontal: 'left' })
    updateNodeTextAlignment.mockRestore()
  })

  it('updates vertical alignment from its explicit control', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeTextAlignment = vi.spyOn(useStore.getState(), 'updateNodeTextAlignment')

    render(<CanvasNodeInspector />)
    fireEvent.click(screen.getByRole('button', { name: 'Align text bottom' }))

    expect(updateNodeTextAlignment).toHaveBeenCalledWith('node-1', { vertical: 'bottom' })
    updateNodeTextAlignment.mockRestore()
  })

  it('updates fill, border, and text colors independently', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeColors = vi.spyOn(useStore.getState(), 'updateNodeColors')

    render(<CanvasNodeInspector />)
    fireEvent.change(screen.getByLabelText('Fill color'), { target: { value: '#123456' } })
    fireEvent.change(screen.getByLabelText('Border color'), { target: { value: '#234567' } })
    fireEvent.change(screen.getByLabelText('Text color'), { target: { value: '#345678' } })

    expect(updateNodeColors).toHaveBeenNthCalledWith(1, 'node-1', { fillColor: '#123456' })
    expect(updateNodeColors).toHaveBeenNthCalledWith(2, 'node-1', { strokeColor: '#234567' })
    expect(updateNodeColors).toHaveBeenNthCalledWith(3, 'node-1', { textColor: '#345678' })
    updateNodeColors.mockRestore()
  })

  it('provides a custom picker followed by the shared palette in each color row', () => {
    useStore.setState({ nodes: [node()] })

    render(<CanvasNodeInspector />)

    expect(screen.getByLabelText('Fill color')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Fill color swatches' }).querySelectorAll('button')).toHaveLength(FILL_SWATCHES.length)
    expect(screen.getByRole('group', { name: 'Border color swatches' }).querySelectorAll('button')).toHaveLength(STROKE_SWATCHES.length)
    expect(screen.getByRole('group', { name: 'Text color swatches' }).querySelectorAll('button')).toHaveLength(TEXT_SWATCHES.length)
  })

  it('updates only the selected color channel from a preset swatch', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeColors = vi.spyOn(useStore.getState(), 'updateNodeColors')

    render(<CanvasNodeInspector />)
    fireEvent.click(screen.getByRole('button', { name: `Border color ${STROKE_SWATCHES[1]}` }))

    expect(updateNodeColors).toHaveBeenCalledWith('node-1', { strokeColor: STROKE_SWATCHES[1] })
    updateNodeColors.mockRestore()
  })

  it('clears only the fill override', () => {
    useStore.setState({ nodes: [node({ data: { label: 'Draft', shape: 'rectangle', fillColor: '#123456', strokeColor: '#222222' } })] })
    const updateNodeColors = vi.spyOn(useStore.getState(), 'updateNodeColors')

    render(<CanvasNodeInspector />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear fill color' }))

    expect(updateNodeColors).toHaveBeenCalledWith('node-1', { fillColor: undefined })
    updateNodeColors.mockRestore()
  })

  it('resets every custom color override to its default', () => {
    useStore.setState({ nodes: [node({ data: { label: 'Draft', shape: 'rectangle', fillColor: '#123456', strokeColor: '#222222', textColor: '#333333' } })] })
    const updateNodeColors = vi.spyOn(useStore.getState(), 'updateNodeColors')

    render(<CanvasNodeInspector />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset custom colors to default' }))

    expect(updateNodeColors).toHaveBeenCalledWith('node-1', { fillColor: undefined, strokeColor: undefined, textColor: undefined })
    updateNodeColors.mockRestore()
  })

  it('offers every supported border width and updates the selected width', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeStrokeWidth = vi.spyOn(useStore.getState(), 'updateNodeStrokeWidth')

    render(<CanvasNodeInspector />)
    const width = screen.getByLabelText('Border width') as HTMLSelectElement
    expect(Array.from(width.options).map(option => option.value)).toEqual(['1', '2', '3', '4', '6'])
    fireEvent.change(width, { target: { value: '6' } })

    expect(updateNodeStrokeWidth).toHaveBeenCalledWith('node-1', 6)
    updateNodeStrokeWidth.mockRestore()
  })

  it('offers visual tiles for only ordinary node shapes and updates the selected shape', () => {
    useStore.setState({ nodes: [node()] })
    const updateNodeShape = vi.spyOn(useStore.getState(), 'updateNodeShape')

    render(<CanvasNodeInspector />)
    const shapeTiles = screen.getByRole('group', { name: 'Node shape' }).querySelectorAll('button')
    expect(shapeTiles).toHaveLength(7)
    fireEvent.click(screen.getByRole('button', { name: 'Node shape Diamond' }))

    expect(updateNodeShape).toHaveBeenCalledWith('node-1', 'diamond')
    updateNodeShape.mockRestore()
  })

  it('centers the circle preview and fills its square viewBox', () => {
    useStore.setState({ nodes: [node()] })

    render(<CanvasNodeInspector />)

    const circle = screen.getByRole('button', { name: 'Node shape Circle' }).querySelector('circle')
    expect(circle).not.toBeNull()
    expect(circle?.getAttribute('cx')).toBe('60')
    expect(circle?.getAttribute('cy')).toBe('60')
    expect(circle?.getAttribute('r')).toBe('59')
  })

  it('disables every mutation control while the canvas is locked', () => {
    useStore.setState({ nodes: [node()], isLocked: true })

    render(<CanvasNodeInspector />)

    const inspector = screen.getByRole('complementary', { name: 'Node inspector' })
    const controls = inspector.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea')
    expect(controls).not.toHaveLength(0)
    controls.forEach(control => expect(control.disabled).toBe(true))
  })

  it('keeps style controls enabled for source-owned nodes', () => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  node-1[Draft]\n', 1)
    const session = createDocumentSession('source-owned-colors', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    })
    useStore.setState({
      nodes: [node()],
      documentSession: {
        ...session,
        projection: {
          ...session.projection,
          model: { ...session.projection.model, nodeColorUnavailableIds: new Set(['node-1']) },
        },
      },
    })
    render(<CanvasNodeInspector />)

    for (const label of ['Fill color', 'Border color', 'Text color', 'Border width', 'Clear fill color', 'Reset custom colors to default']) {
      expect((screen.getByLabelText(label) as HTMLInputElement | HTMLSelectElement | HTMLButtonElement).disabled).toBe(false)
    }
  })
})

describe('Canvas inspector mount', () => {
  beforeEach(() => {
    useStore.setState({ nodes: [node()], isLocked: false, minimapOpen: false })
  })

  it('mounts the inspector in both modern and classic canvas layouts', () => {
    const { rerender } = render(<Canvas layoutStyle="modern" />)
    expect(screen.getByRole('complementary', { name: 'Node inspector' })).toBeTruthy()

    rerender(<Canvas layoutStyle="classic" />)
    expect(screen.getByRole('complementary', { name: 'Node inspector' })).toBeTruthy()
  })

  it('restores the persisted hidden inspector value', () => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('hidden-inspector', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, inspectorVisible: false, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    }))

    render(<Canvas layoutStyle="modern" />)

    expect(screen.queryByRole('complementary', { name: 'Node inspector' })).toBeNull()
  })

  it('defaults the inspector to visible for legacy layouts without a persisted value', () => {
    const projection = flowchartCompatibilityAdapter.parse('flowchart LR\n  A[Alpha]\n', 1)
    useStore.getState().initializeDocumentSession(createDocumentSession('legacy-inspector', 1, projection, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, edges: {}, constraints: [], adapterMetadata: {},
    }))

    render(<Canvas layoutStyle="modern" />)

    expect(useStore.getState().documentSession?.layout.inspectorVisible).toBe(true)
    expect(screen.getByRole('complementary', { name: 'Node inspector' })).toBeTruthy()
  })
})
