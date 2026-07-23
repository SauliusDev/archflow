import { describe, it, expect } from 'vitest'

import { vi } from 'vitest'
vi.mock('zustand')

import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import type { Node } from '@xyflow/react'

function makeNode(id: string, overrides: Partial<Node<FlowNodeData>> = {}): Node<FlowNodeData> {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { label: `Node ${id}`, shape: 'rectangle' },
    type: 'default',
    ...overrides,
  }
}

describe('toggleNodeHandDrawn', () => {
  it('defaults isHandDrawn to undefined (falsy)', () => {
    const node = makeNode('a')
    useStore.setState({ nodes: [node] })
    expect(useStore.getState().nodes[0].data.isHandDrawn).toBeUndefined()
  })

  it('sets isHandDrawn to true when undefined', () => {
    const node = makeNode('a')
    useStore.setState({ nodes: [node] })
    useStore.getState().toggleNodeHandDrawn('a')
    expect(useStore.getState().nodes[0].data.isHandDrawn).toBe(true)
  })

  it('sets isHandDrawn to false when true', () => {
    const node = makeNode('a', { data: { label: 'Node a', shape: 'rectangle', isHandDrawn: true } })
    useStore.setState({ nodes: [node] })
    useStore.getState().toggleNodeHandDrawn('a')
    expect(useStore.getState().nodes[0].data.isHandDrawn).toBe(false)
  })

  it('creates a history entry', () => {
    const node = makeNode('a')
    useStore.setState({ nodes: [node], history: { past: [], future: [] } })
    useStore.getState().toggleNodeHandDrawn('a')
    expect(useStore.getState().history.past).toHaveLength(1)
  })

  it('is a no-op for nonexistent node id', () => {
    const node = makeNode('a')
    useStore.setState({ nodes: [node], history: { past: [], future: [] } })
    useStore.getState().toggleNodeHandDrawn('nonexistent')
    expect(useStore.getState().nodes[0].data.isHandDrawn).toBeUndefined()
    expect(useStore.getState().history.past).toHaveLength(0)
  })
})
