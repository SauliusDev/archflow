import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// vi.mock('zustand') must appear before source imports that use it.
vi.mock('zustand')

// Module-level captured onResizeEnd
let capturedOnResizeEnd: ((event: unknown, params: unknown) => void) | undefined

// Mock @xyflow/react BEFORE any imports that use it.
// Handle renders as a plain div so we can query for flow-node__handle class.
vi.mock('@xyflow/react', () => ({
  Handle: ({ className, id, 'aria-label': ariaLabel, onPointerDown, onKeyDown, role, tabIndex }: { className?: string; id?: string; 'aria-label'?: string; onPointerDown?: React.PointerEventHandler<HTMLDivElement>; onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>; role?: string; tabIndex?: number }) => (
    <div className={className} id={id} aria-label={ariaLabel} data-testid="handle" onPointerDown={onPointerDown} onKeyDown={onKeyDown} role={role} tabIndex={tabIndex} />
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  NodeResizer: ({ isVisible, onResizeEnd }: { isVisible?: boolean; onResizeEnd?: (...args: unknown[]) => void }) => {
    capturedOnResizeEnd = onResizeEnd
    return isVisible ? <div data-testid="node-resizer" /> : null
  },
  NodeToolbar: ({ isVisible, children }: { isVisible?: boolean; children?: React.ReactNode }) =>
    isVisible ? <div data-testid="rf-node-toolbar">{children}</div> : null,
  useViewport: vi.fn(() => ({ zoom: 1, x: 0, y: 200 })),
}))

import FlowNode from './FlowNode'
import { useStore } from '@/state/createStore'
import { shapeTemplates, edgeConnectors } from '@/features/flowchart'
import type { NodeShape, EdgeStyle } from '@/features/flowchart'

// mockReactFlow() stubs ResizeObserver, SVGElement.getBBox etc.
// Required to prevent jsdom errors when React Flow components render.
import { mockReactFlow } from '../../../setupTests'

// Helper: build the minimal NodeProps<Node<FlowNodeData>> object FlowNode needs.
function makeNodeProps(
  shape: NodeShape,
  label = 'Test',
  selected = false,
): Parameters<typeof FlowNode>[0] {
  return {
    id: 'node1',
    data: { label, shape },
    selected,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    type: 'flowNode',
  } as unknown as Parameters<typeof FlowNode>[0]
}

describe('FlowNode', () => {
  beforeEach(() => {
    capturedOnResizeEnd = undefined
    mockReactFlow()
    useStore.setState({ isLocked: false })
    useStore.getState().addNode({
      id: 'node1',
      position: { x: 0, y: 0 },
      data: { label: 'Test', shape: 'rectangle' },
      type: 'default',
    })
  })

  const shapes: NodeShape[] = [
    'rectangle', 'rounded', 'pill', 'diamond', 'circle', 'hexagon', 'cylinder',
  ]

  describe('shape rendering', () => {
    it.each(shapes)('renders %s shape with correct CSS class', (shape) => {
      const { container } = render(<FlowNode {...makeNodeProps(shape)} />)
      const node = container.firstElementChild
      expect(node?.className).toContain('flow-node')
      expect(node?.className).toContain(`flow-node--${shape}`)
    })

    it('renders subgraph shape without crashing (fallback to rectangle)', () => {
      const { container } = render(<FlowNode {...makeNodeProps('subgraph')} />)
      const node = container.firstElementChild
      expect(node?.className).toContain('flow-node')
      expect(node?.className).toContain('flow-node--subgraph')
      expect(container.querySelector('svg')).not.toBeNull()
    })

    it('renders a generalized Note as a folded-corner paper instead of a rectangle', () => {
      const props = {
        ...makeNodeProps('rectangle', 'Note'),
        data: { label: 'Note', shape: 'rectangle' as const, mermaidShape: 'note' },
      }
      const { container } = render(<FlowNode {...props} />)

      expect(container.querySelector('path')?.getAttribute('d')).toContain('M1 1h96l23 17')
      expect(container.querySelectorAll('path')).toHaveLength(1)
      expect(container.querySelector('rect')).toBeNull()
    })

    it('uses a taller viewBox for cylinders so their lower ellipse is not clipped', () => {
      const { container } = render(<FlowNode {...makeNodeProps('cylinder', 'Cylinder')} />)

      expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 120 60')
    })

    it('uses the full node height for pill shapes so their visible border matches the hitbox', () => {
      const { container } = render(<FlowNode {...makeNodeProps('pill', 'Pill')} />)

      expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 120 40')
    })
  })

  describe('label rendering', () => {
    it('displays the node label text', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'My Label')} />)
      expect(screen.getByText('My Label')).toBeTruthy()
    })

    it('applies requested horizontal and vertical text alignment to the label', () => {
      const props = {
        ...makeNodeProps('rectangle', 'Aligned'),
        data: { label: 'Aligned', shape: 'rectangle' as const, textHorizontalAlign: 'left' as const, textVerticalAlign: 'bottom' as const },
      }
      render(<FlowNode {...props} />)
      const label = screen.getByText('Aligned')
      expect(label.className).toContain('flow-node__label--horizontal-left')
      expect(label.className).toContain('flow-node__label--vertical-bottom')
      expect(label.parentElement?.className).toContain('flow-node--text-horizontal-left')
      expect(label.parentElement?.className).toContain('flow-node--text-vertical-bottom')
    })
  })

  describe('selection state', () => {
    it('applies flow-node--selected class when selected is true', () => {
      const { container } = render(
        <FlowNode {...makeNodeProps('rectangle', 'Test', true)} />,
      )
      expect(container.firstElementChild?.className).toContain('flow-node--selected')
    })

    it('marks a path-based Note shape selected through its containing node', () => {
      const props = {
        ...makeNodeProps('rectangle', 'Note', true),
        data: { label: 'Note', shape: 'rectangle' as const, mermaidShape: 'note' },
      }
      const { container } = render(<FlowNode {...props} />)

      expect(container.querySelector('.flow-node--selected .flow-node__svg path')).not.toBeNull()
    })

    it('does not apply flow-node--selected when selected is false', () => {
      const { container } = render(
        <FlowNode {...makeNodeProps('rectangle', 'Test', false)} />,
      )
      expect(container.firstElementChild?.className).not.toContain('flow-node--selected')
    })

    it('renders NodeResizer when selected is true', () => {
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)
      expect(container.querySelector('[data-testid="node-resizer"]')).not.toBeNull()
    })

    it('does not render NodeResizer when selected is false', () => {
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', false)} />)
      expect(container.querySelector('[data-testid="node-resizer"]')).toBeNull()
    })

    it('renders ConnectArrows when selected is true', () => {
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)
      expect(container.querySelector('.connect-arrows')).not.toBeNull()
    })

    it('does not render ConnectArrows when selected is false', () => {
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', false)} />)
      expect(container.querySelector('.connect-arrows')).toBeNull()
    })

    it('hides node editing affordances when the canvas is locked', () => {
      useStore.setState({ isLocked: true })
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)

      expect(container.querySelector('[data-testid="node-resizer"]')).toBeNull()
      expect(container.querySelector('.connect-arrows')).toBeNull()
      expect(container.querySelector('[data-testid="rf-node-toolbar"]')).toBeNull()
    })
  })

  describe('connection handles', () => {
    it('does not render side targets in Free mode', () => {
      render(<FlowNode {...makeNodeProps('rectangle')} />)
      expect(screen.queryByLabelText('Assign edge endpoint to top side')).toBeNull()
    })

    it('keeps four non-interactive structural source handles in Free mode for floating-edge anchors', () => {
      render(<FlowNode {...makeNodeProps('rectangle')} />)

      expect(document.querySelectorAll('.flow-node__floating-handle')).toHaveLength(4)
      expect(screen.queryByLabelText('Assign edge endpoint to top side')).toBeNull()
    })
  })

  describe('side attachment targets', () => {
    function enableSideConnections(): void {
      useStore.setState({
        nodes: [{ id: 'node1', position: { x: 0, y: 0 }, data: { label: 'Test', shape: 'rectangle' }, type: 'default', selected: true }],
        documentSession: {
          family: 'flowchart',
          layout: { adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: true } } } },
          projection: { model: {} },
        } as never,
      })
    }

    it('renders four labelled targets for the single selected unlocked node in Side mode', () => {
      enableSideConnections()
      render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)

      expect(screen.getAllByLabelText(/Assign edge endpoint to .+ side/)).toHaveLength(4)
      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(screen.getByLabelText(`Assign edge endpoint to ${side} side`)).toBeTruthy()
      }
    })

    it('lights up four side targets on the node under a pending connector drag', () => {
      enableSideConnections()
      useStore.setState({ pendingConnect: { sourceId: 'source' }, pendingConnectTargetId: 'node1' } as never)
      render(<FlowNode {...makeNodeProps('rectangle', 'Test', false)} />)

      expect(screen.getAllByLabelText(/Assign edge endpoint to .+ side/)).toHaveLength(4)
    })

    it('exposes each side target as a keyboard-focusable button', () => {
      enableSideConnections()
      render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)

      const target = screen.getByRole('button', { name: 'Assign edge endpoint to bottom side' })
      expect(target.getAttribute('tabindex')).toBe('0')
    })

    it('stops target pointer presses from bubbling into node dragging', () => {
      enableSideConnections()
      const onNodePointerDown = vi.fn()
      render(<div onPointerDown={onNodePointerDown}><FlowNode {...makeNodeProps('rectangle', 'Test', true)} /></div>)

      fireEvent.pointerDown(screen.getByLabelText('Assign edge endpoint to right side'))

      expect(onNodePointerDown).not.toHaveBeenCalled()
    })

    it('does not render side targets in Free mode', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)

      expect(screen.queryByLabelText('Assign edge endpoint to top side')).toBeNull()
    })

    it('does not render side targets for an unselected node', () => {
      enableSideConnections()
      render(<FlowNode {...makeNodeProps('rectangle')} />)

      expect(screen.queryByLabelText('Assign edge endpoint to top side')).toBeNull()
    })

    it('does not render side targets on a locked canvas', () => {
      enableSideConnections()
      useStore.setState({ isLocked: true })
      render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)

      expect(screen.queryByLabelText('Assign edge endpoint to top side')).toBeNull()
    })
  })

  describe('SVG shape element', () => {
    it('renders an SVG element for each shape', () => {
      shapes.forEach(shape => {
        const { container, unmount } = render(<FlowNode {...makeNodeProps(shape)} />)
        expect(container.querySelector('svg.flow-node__svg')).not.toBeNull()
        unmount()
      })
    })

    it.each(shapes)('keeps the %s border from scaling when the node is resized', (shape) => {
      const { container } = render(<FlowNode {...makeNodeProps(shape)} />)
      const outlinedShape = container.querySelector('rect, polygon, circle, ellipse')
      expect(outlinedShape?.getAttribute('vector-effect')).toBe('non-scaling-stroke')
    })
  })

  describe('resize end', () => {
    it('calls resizeNode on resize end', () => {
      const node = {
        id: 'node1',
        position: { x: 0, y: 0 },
        data: { label: 'Node node1', shape: 'rectangle' as NodeShape },
        type: 'default',
      }
      useStore.setState({ nodes: [node] })
      render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)
      capturedOnResizeEnd?.({}, { x: 0, y: 0, width: 200, height: 80, direction: [1, 0] })
      expect(useStore.getState().nodes[0].width).toBe(200)
      expect(useStore.getState().nodes[0].height).toBe(80)
    })
  })

  describe('hand-drawn class', () => {
    it('applies flow-node--hand-drawn class when isHandDrawn=true', () => {
      const props = {
        ...makeNodeProps('rectangle'),
        data: { label: 'Test', shape: 'rectangle' as const, isHandDrawn: true },
      }
      const { container } = render(<FlowNode {...props} />)
      expect(container.firstElementChild?.className).toContain('flow-node--hand-drawn')
    })

    it('does not apply flow-node--hand-drawn when isHandDrawn is undefined', () => {
      const { container } = render(<FlowNode {...makeNodeProps('rectangle')} />)
      expect(container.firstElementChild?.className).not.toContain('flow-node--hand-drawn')
    })

    it('does not apply flow-node--hand-drawn when isHandDrawn=false', () => {
      const props = {
        ...makeNodeProps('rectangle'),
        data: { label: 'Test', shape: 'rectangle' as const, isHandDrawn: false },
      }
      const { container } = render(<FlowNode {...props} />)
      expect(container.firstElementChild?.className).not.toContain('flow-node--hand-drawn')
    })
  })

  describe('toolbar visibility', () => {
    it('renders toolbar when selected and single node is selected in store', () => {
      useStore.setState({
        nodes: [{ id: 'node1', position: { x: 0, y: 0 }, data: { label: 'Test', shape: 'rectangle' }, type: 'default', selected: true }],
      })
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', true)} />)
      expect(container.querySelector('[data-testid="rf-node-toolbar"]')).not.toBeNull()
    })

    it('does not render toolbar when not selected', () => {
      const { container } = render(<FlowNode {...makeNodeProps('rectangle', 'Test', false)} />)
      expect(container.querySelector('[data-testid="rf-node-toolbar"]')).toBeNull()
    })
  })

  describe('inline label editing', () => {
    it('double-clicking the label shows an accessible textarea pre-filled with current label', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))
      const input = screen.getByRole('textbox', { name: 'Node text' })
      expect(input).toBeInstanceOf(HTMLTextAreaElement)
      expect((input as HTMLTextAreaElement).value).toBe('Test')
      expect(input.parentElement?.className).toContain('flow-node')
    })

    it('renders the label editor without its own field frame', () => {
      render(<FlowNode {...makeNodeProps('hexagon', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))

      expect(screen.getByRole('textbox').className).toContain('flow-node__label-input--plain')
    })

    it('marks the editor as exempt from React Flow keyboard, pan, wheel, and drag handling', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))

      const editor = screen.getByRole('textbox')
      expect(editor.className).toContain('nodrag')
      expect(editor.className).toContain('nopan')
      expect(editor.className).toContain('nowheel')
      expect(editor.className).toContain('nokey')
    })

    it('keeps native Command text shortcuts available to the textarea', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))
      const editor = screen.getByRole('textbox')
      const hostKeyDown = vi.fn()
      window.addEventListener('keydown', hostKeyDown)

      try {
        for (const key of ['a', 'c', 'v']) {
          const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, metaKey: true })
          editor.dispatchEvent(event)
          expect(event.defaultPrevented).toBe(false)
        }
        expect(hostKeyDown).toHaveBeenCalledTimes(3)
      } finally {
        window.removeEventListener('keydown', hostKeyDown)
      }
    })

    it('uses the node text alignment while editing', () => {
      const props = {
        ...makeNodeProps('rectangle', 'Aligned'),
        data: { label: 'Aligned', shape: 'rectangle' as const, textHorizontalAlign: 'right' as const, textVerticalAlign: 'bottom' as const },
      }
      render(<FlowNode {...props} />)
      fireEvent.dblClick(screen.getByText('Aligned'))

      const editor = screen.getByRole('textbox')
      expect(editor.className).toContain('flow-node__label-input--horizontal-right')
      expect(editor.parentElement?.className).toContain('flow-node--text-vertical-bottom')
    })

    it('allows Enter to retain a pasted newline until blur commits the label', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))
      const input = screen.getByRole('textbox', { name: 'Node text' })
      fireEvent.change(input, { target: { value: 'First line\nSecond line' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect((input as HTMLTextAreaElement).value).toBe('First line\nSecond line')
      expect(useStore.getState().nodes[0].data.label).toBe('Test')

      fireEvent.blur(input)

      expect(useStore.getState().nodes[0].data.label).toBe('First line\nSecond line')
      expect(screen.queryByRole('textbox', { name: 'Node text' })).toBeNull()
    })

    it('keeps the open inline editor synchronized with an externally updated label', () => {
      const { rerender } = render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))

      rerender(<FlowNode {...makeNodeProps('rectangle', 'Updated in inspector')} />)

      expect((screen.getByRole('textbox', { name: 'Node text' }) as HTMLTextAreaElement).value).toBe('Updated in inspector')
    })

    it('pressing Escape cancels editing without updating the store', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))
      const input = screen.getByRole('textbox', { name: 'Node text' })
      fireEvent.change(input, { target: { value: 'Changed' } })
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(useStore.getState().nodes[0].data.label).toBe('Test')
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('blur on the input commits the label', () => {
      render(<FlowNode {...makeNodeProps('rectangle', 'Test')} />)
      fireEvent.dblClick(screen.getByText('Test'))
      const input = screen.getByRole('textbox', { name: 'Node text' })
      fireEvent.change(input, { target: { value: 'Blurred' } })
      fireEvent.blur(input)
      expect(useStore.getState().nodes[0].data.label).toBe('Blurred')
    })
  })
})

describe('shapeTemplates', () => {
  const allShapes: NodeShape[] = [
    'rectangle', 'rounded', 'pill', 'diamond', 'circle', 'hexagon', 'cylinder', 'subgraph',
  ]

  it('has entries for all 8 NodeShape values', () => {
    allShapes.forEach(shape => {
      expect(shapeTemplates).toHaveProperty(shape)
      expect(typeof shapeTemplates[shape].open).toBe('string')
      expect(typeof shapeTemplates[shape].close).toBe('string')
    })
  })

  it('maps rectangle to [label] bracket syntax', () => {
    expect(shapeTemplates.rectangle).toEqual({ open: '[', close: ']' })
  })

  it('maps circle to ((label)) bracket syntax', () => {
    expect(shapeTemplates.circle).toEqual({ open: '((', close: '))' })
  })

  it('maps cylinder to [(label)] bracket syntax', () => {
    expect(shapeTemplates.cylinder).toEqual({ open: '[(', close: ')]' })
  })
})

describe('edgeConnectors', () => {
  const allStyles: EdgeStyle[] = ['arrow', 'dotted', 'thick', 'open']

  it('has entries for all 4 EdgeStyle values', () => {
    allStyles.forEach(style => {
      expect(edgeConnectors).toHaveProperty(style)
      expect(typeof edgeConnectors[style]).toBe('string')
    })
  })

  it('maps arrow to --> syntax', () => {
    expect(edgeConnectors.arrow).toBe('-->')
  })

  it('maps dotted to -.-> syntax', () => {
    expect(edgeConnectors.dotted).toBe('-.->')
  })
})
