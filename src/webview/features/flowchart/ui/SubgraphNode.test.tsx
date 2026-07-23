import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('zustand')

let _capturedOnResizeEnd: ((event: unknown, params: unknown) => void) | undefined

vi.mock('@xyflow/react', () => ({
  Handle: ({ className, id }: { className?: string; id?: string }) => (
    <div className={className} id={id} data-testid="handle" />
  ),
  Position: {
    Top: 'top',
    Right: 'right',
    Bottom: 'bottom',
    Left: 'left',
  },
  NodeResizer: ({ isVisible, onResizeEnd }: { isVisible?: boolean; onResizeEnd?: (...args: unknown[]) => void }) => {
    _capturedOnResizeEnd = onResizeEnd
    return isVisible ? <div data-testid="node-resizer" /> : null
  },
}))

import SubgraphNode from './SubgraphNode'
import { useStore } from '@/state/createStore'
import { mockReactFlow } from '../../../setupTests'

function makeSubgraphProps(
  label = 'My Group',
  selected = false,
): Parameters<typeof SubgraphNode>[0] {
  return {
    id: 'sg1',
    data: { label, shape: 'subgraph' as const, isSubgraph: true },
    selected,
    dragging: false,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
    type: 'subgraphNode',
  } as unknown as Parameters<typeof SubgraphNode>[0]
}

describe('SubgraphNode', () => {
  beforeEach(() => {
    _capturedOnResizeEnd = undefined
    mockReactFlow()
    useStore.setState({
      nodes: [{ id: 'sg1', position: { x: 0, y: 0 }, data: { label: 'My Group', shape: 'subgraph', isSubgraph: true }, type: 'subgraphNode' }],
      edges: [],
      history: { past: [], future: [] },
    })
  })

  it('renders with subgraph-node class', () => {
    const { container } = render(<SubgraphNode {...makeSubgraphProps()} />)
    expect(container.querySelector('.subgraph-node')).toBeTruthy()
  })

  it('renders label from data.label', () => {
    render(<SubgraphNode {...makeSubgraphProps()} />)
    expect(screen.getByText('My Group')).toBeTruthy()
  })

  it('keeps its structural connection anchors hidden instead of showing side dots', () => {
    const { container } = render(<SubgraphNode {...makeSubgraphProps('My Group', true)} />)

    expect(container.querySelectorAll('.flow-node__floating-handle')).toHaveLength(4)
    expect(container.querySelectorAll('.flow-node__handle')).toHaveLength(0)
  })

  it('double-click on label activates inline editing', () => {
    render(<SubgraphNode {...makeSubgraphProps()} />)
    fireEvent.doubleClick(screen.getByText('My Group'))
    expect(screen.getByRole('textbox')).toBeTruthy()
  })

  it('Enter in input calls updateNodeLabel and closes editing', () => {
    render(<SubgraphNode {...makeSubgraphProps()} />)
    fireEvent.doubleClick(screen.getByText('My Group'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'New Name' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(useStore.getState().nodes[0].data.label).toBe('New Name')
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('Escape cancels without calling updateNodeLabel', () => {
    render(<SubgraphNode {...makeSubgraphProps()} />)
    fireEvent.doubleClick(screen.getByText('My Group'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Changed' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useStore.getState().nodes[0].data.label).toBe('My Group')
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
