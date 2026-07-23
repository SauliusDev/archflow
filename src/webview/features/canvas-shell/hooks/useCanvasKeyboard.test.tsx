import { act, fireEvent, renderHook } from '@testing-library/react'
import type { Node } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '@/state/createStore'
import type { FlowNodeData } from '@/features/flowchart'
import { useCanvasKeyboard } from './useCanvasKeyboard'

function node(id: string, overrides: Partial<Node<FlowNodeData>> = {}): Node<FlowNodeData> {
  return {
    id,
    type: 'flowNode',
    position: { x: 0, y: 0 },
    data: { label: id, shape: 'rectangle' },
    ...overrides,
  }
}

describe('useCanvasKeyboard', () => {
  const initialState = useStore.getState()
  const zoomIn = vi.fn()
  const zoomOut = vi.fn()
  const zoomTo = vi.fn()
  const fitView = vi.fn()

  beforeEach(() => {
    useStore.setState(initialState, true)
    vi.clearAllMocks()
  })

  function install(fitViewOptions?: { padding: number; duration: number; maxZoom: number }): void {
    renderHook(() => useCanvasKeyboard({ zoomIn, zoomOut, zoomTo, fitView, fitViewOptions }))
  }

  it('keeps shortcuts out of editable elements', () => {
    useStore.setState({ nodes: [node('a', { selected: true })] })
    install()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    try {
      fireEvent.keyDown(window, { key: 'd', ctrlKey: true })
      fireEvent.keyDown(window, { key: 'Delete' })
      fireEvent.keyDown(window, { key: '=', ctrlKey: true })
      expect(useStore.getState().nodes).toHaveLength(1)
      expect(zoomIn).not.toHaveBeenCalled()
    } finally {
      input.remove()
    }
  })

  it('keeps native text shortcuts out of canvas handling based on their event target', () => {
    useStore.setState({ nodes: [node('a', { selected: true })] })
    install()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    try {
      for (const key of ['a', 'c', 'v']) {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, metaKey: true })
        textarea.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(false)
      }

      expect(useStore.getState().nodes).toHaveLength(1)
      expect(useStore.getState().nodes[0].selected).toBe(true)
    } finally {
      textarea.remove()
    }
  })

  it('uses the focused textarea when VS Code retargets a shortcut to the webview body', () => {
    useStore.setState({ nodes: [node('a')] })
    install()
    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    try {
      const event = new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'a',
        metaKey: true,
      })
      document.body.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
      expect(useStore.getState().nodes[0].selected).toBeFalsy()
    } finally {
      textarea.remove()
    }
  })

  it('deletes nodes and selected edges, then clears pending connects', () => {
    const edge = { id: 'edge', source: 'a', target: 'b', selected: true }
    useStore.setState({ nodes: [node('a', { selected: true }), node('b')], edges: [edge], pendingConnect: { sourceId: 'a' } })
    install()
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(useStore.getState().nodes.map(candidate => candidate.id)).toEqual(['b'])
    expect(useStore.getState().pendingConnect).toBeNull()
  })

  it('applies undo and redo to history state', () => {
    useStore.getState().addNode(node('a'))
    install()

    act(() => fireEvent.keyDown(window, { key: 'z', ctrlKey: true }))
    expect(useStore.getState().nodes).toHaveLength(0)
    act(() => fireEvent.keyDown(window, { key: 'y', ctrlKey: true }))
    expect(useStore.getState().nodes.map(candidate => candidate.id)).toEqual(['a'])
  })

  it('duplicates and nudges selected nodes but never nudges while locked', () => {
    useStore.setState({ nodes: [node('a', { selected: true })], edges: [] })
    install()
    act(() => fireEvent.keyDown(window, { key: 'd', ctrlKey: true }))
    expect(useStore.getState().nodes).toHaveLength(2)
    act(() => fireEvent.keyDown(window, { key: 'a', ctrlKey: true }))
    expect(useStore.getState().nodes.every(candidate => candidate.selected)).toBe(true)
    act(() => fireEvent.keyDown(window, { key: 'ArrowRight' }))
    expect(useStore.getState().nodes[0].position).toEqual({ x: 24, y: 0 })
    const positionBeforeLock = { ...useStore.getState().nodes[0].position }
    useStore.setState({ isLocked: true })
    act(() => fireEvent.keyDown(window, { key: 'ArrowRight' }))
    expect(useStore.getState().nodes[0].position).toEqual(positionBeforeLock)
  })

  it('keeps selection but blocks delete and duplicate mutations while locked', () => {
    useStore.setState({ nodes: [node('a', { selected: true })], edges: [], isLocked: true, history: { past: [], future: [] } })
    install()

    act(() => fireEvent.keyDown(window, { key: 'Delete' }))
    act(() => fireEvent.keyDown(window, { key: 'd', ctrlKey: true }))
    act(() => fireEvent.keyDown(window, { key: 'a', ctrlKey: true }))

    expect(useStore.getState().nodes).toHaveLength(1)
    expect(useStore.getState().nodes[0].selected).toBe(true)
    expect(useStore.getState().history.past).toHaveLength(0)
  })

  it('fits the paper-grid canvas with the imp-agent framing', () => {
    install({ padding: 0.2, duration: 360, maxZoom: 1 })

    act(() => fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true }))

    expect(fitView).toHaveBeenCalledWith({ padding: 0.2, duration: 360, maxZoom: 1 })
  })
})
