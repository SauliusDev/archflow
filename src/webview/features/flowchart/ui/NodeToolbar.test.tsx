import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

let capturedPosition: string | undefined
let capturedOffset: number | undefined

vi.mock('@xyflow/react', () => ({
  NodeToolbar: ({ isVisible, position, offset, children }: { isVisible?: boolean; position?: string; offset?: number; children?: React.ReactNode }) => {
    capturedPosition = position
    capturedOffset = offset
    return isVisible ? <div data-testid="rf-node-toolbar">{children}</div> : null
  },
  Position: { Top: 'top', Bottom: 'bottom', Right: 'right', Left: 'left' },
  useViewport: vi.fn(() => ({ zoom: 1, x: 0, y: 200 })),
}))

vi.mock('zustand')

import { useViewport } from '@xyflow/react'
import { useStore } from '@/state/createStore'
import type { NodeShape } from '@/features/flowchart'
import NodeToolbar from './NodeToolbar'
import { readScratchpadShapeIds } from '../state/scratchpadShapes'

const TEST_NODE_ID = 'n1'
const mockRemoveNodes = vi.fn()
const mockDuplicateNode = vi.fn()
const mockToggleNodeLock = vi.fn()

const defaultProps = {
  nodeId: TEST_NODE_ID,
  shape: 'rectangle' as NodeShape,
  positionAbsoluteY: 200,
  onEditLabel: vi.fn(),
  isVisible: true,
}

beforeEach(() => {
  mockRemoveNodes.mockClear()
  mockDuplicateNode.mockClear()
  mockToggleNodeLock.mockClear()
  capturedPosition = undefined
  capturedOffset = undefined
  vi.mocked(useViewport).mockReturnValue({ zoom: 1, x: 0, y: 200 })
  useStore.setState({
    isLocked: false,
    nodes: [{ id: TEST_NODE_ID, position: { x: 100, y: 100 }, data: { label: 'Test', shape: 'rectangle' }, type: 'flowNode' }],
    removeNodes: mockRemoveNodes,
    duplicateNode: mockDuplicateNode,
    toggleNodeLock: mockToggleNodeLock,
  })
})

describe('NodeToolbar', () => {
  it('renders nothing when isVisible is false', () => {
    render(<NodeToolbar {...defaultProps} isVisible={false} />)
    expect(screen.queryByTestId('rf-node-toolbar')).toBeNull()
  })

  it('keeps only structural actions and removes duplicated formatting controls', () => {
    render(<NodeToolbar {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Add to scratchpad' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Duplicate node' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Lock node' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Delete node' })).not.toBeNull()

    expect(screen.queryByRole('button', { name: 'Edit label' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change shape' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Pick color' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Border width' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Horizontal text alignment' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Vertical text alignment' })).toBeNull()
  })

  it('saves the selected Mermaid shape to Scratchpad', () => {
    localStorage.clear()
    useStore.setState({
      nodes: [{ id: TEST_NODE_ID, position: { x: 100, y: 100 }, data: { label: 'Document', shape: 'rectangle', mermaidShape: 'doc' }, type: 'flowNode' }],
    })
    render(<NodeToolbar {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add to scratchpad' }))
    expect(readScratchpadShapeIds()).toEqual(['general:document'])
  })

  it('uses the compact toolbar-button treatment for adding a shape to Scratchpad', () => {
    render(<NodeToolbar {...defaultProps} />)

    const scratchpadButton = screen.getByRole('button', { name: 'Add to scratchpad' })
    expect(scratchpadButton.className).toContain('node-toolbar__btn')
    expect(scratchpadButton.textContent).toBe('')
  })

  it('clicking Delete button calls removeNodes with nodeId', () => {
    render(<NodeToolbar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete node' }))
    expect(mockRemoveNodes).toHaveBeenCalledWith([TEST_NODE_ID])
  })

  it('clicking Duplicate button calls duplicateNode with nodeId', () => {
    render(<NodeToolbar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate node' }))
    expect(mockDuplicateNode).toHaveBeenCalledWith(TEST_NODE_ID)
  })

  it('clicking Lock button calls toggleNodeLock with nodeId', () => {
    render(<NodeToolbar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Lock node' }))
    expect(mockToggleNodeLock).toHaveBeenCalledWith(TEST_NODE_ID)
  })

  it('lock button shows Unlock label and active class when node is locked', () => {
    useStore.setState({
      nodes: [{ id: TEST_NODE_ID, position: { x: 100, y: 100 }, data: { label: 'Test', shape: 'rectangle' }, type: 'flowNode', draggable: false }],
    })
    render(<NodeToolbar {...defaultProps} />)
    const lockBtn = screen.getByRole('button', { name: 'Unlock node' })
    expect(lockBtn.className).toContain('node-toolbar__btn--active')
  })

  it('delete button has danger CSS class', () => {
    render(<NodeToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Delete node' }).className).toContain('node-toolbar__btn--danger')
  })

  it('toolbar positions below node when near top viewport edge', () => {
    vi.mocked(useViewport).mockReturnValue({ zoom: 1, x: 0, y: -300 })
    render(<NodeToolbar {...defaultProps} positionAbsoluteY={50} />)
    expect(capturedPosition).toBe('bottom')
  })

  it('separates the toolbar from connection controls', () => {
    render(<NodeToolbar {...defaultProps} />)
    expect(capturedOffset).toBe(44)
  })
})
