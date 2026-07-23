import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// All vi.mock() at top level — Vitest hoists these before imports
vi.mock('@codemirror/view', () => ({
  EditorView: vi.fn(),
}))

vi.mock('@/state/createStore', () => ({
  useStore: vi.fn(),
}))

import { useSyncCanvasToCode, useSyncCodeToCanvas } from './sync'
import { useStore } from '@/state/createStore'

function makeMockView(docContent: string, cursorHead = 0) {
  let currentContent = docContent
  let currentHead = cursorHead

  const dispatch = vi.fn((transaction: {
    changes?: { from: number; to: number; insert: string }
    selection?: { anchor: number }
  }) => {
    if (transaction.changes) {
      currentContent = transaction.changes.insert
      currentHead = 0  // CodeMirror resets cursor on content replacement
    }
    if (transaction.selection) {
      currentHead = transaction.selection.anchor
    }
  })

  return {
    dispatch,
    get state() {
      return {
        doc: { toString: () => currentContent, length: currentContent.length },
        selection: { main: { head: currentHead } },
      }
    },
  }
}

describe('useSyncCanvasToCode', () => {
  beforeEach(() => {
    vi.mocked(useStore).mockReturnValue(null)
  })

  it('does nothing when viewRef.current is null', () => {
    const viewRef = { current: null }
    expect(() => renderHook(() => useSyncCanvasToCode(viewRef as never, 'content'))).not.toThrow()
  })

  it('does nothing when syncDirection is "code"', () => {
    vi.mocked(useStore).mockReturnValue('code')
    const view = makeMockView('old content', 5)
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'new content'))
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('allows sync when syncDirection is "canvas"', () => {
    vi.mocked(useStore).mockReturnValue('canvas')
    const view = makeMockView('old content', 0)
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'new content'))
    expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: { from: 0, to: 'old content'.length, insert: 'new content' },
    }))
  })

  it('does nothing when code matches current doc', () => {
    const view = makeMockView('same content', 5)
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'same content'))
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches document replacement when code differs', () => {
    const view = makeMockView('old content', 0)
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'new content'))
    expect(view.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: { from: 0, to: 'old content'.length, insert: 'new content' },
    }))
  })

  it('restores cursor position after dispatch', () => {
    const view = makeMockView('hello world', 5)
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'new content'))
    // savedPos=5; after content dispatch cursor resets to 0; clamp(5,11)=5; 5 !== 0 → restore
    expect(view.dispatch).toHaveBeenNthCalledWith(2, { selection: { anchor: 5 } })
  })

  it('clamps cursor to new doc length when cursor is beyond end', () => {
    const view = makeMockView('long content', 12)  // cursor at end of 'long content' (len 12)
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'hi'))  // shorter doc
    // savedPos=12; after dispatch doc='hi' (len 2), cursor=0; clamp(12,2)=2; 2 !== 0 → restore
    expect(view.dispatch).toHaveBeenNthCalledWith(2, { selection: { anchor: 2 } })
  })

  it('does not restore cursor when position is unchanged', () => {
    const view = makeMockView('old content', 0)  // cursor at 0
    const viewRef = { current: view }
    renderHook(() => useSyncCanvasToCode(viewRef as never, 'new content'))
    // savedPos=0; after dispatch cursor=0; clamp(0,11)=0; 0 !== 0 → FALSE → no restore dispatch
    expect(view.dispatch).toHaveBeenCalledTimes(1)
  })

  it('re-runs when code changes', () => {
    const view = makeMockView('initial', 0)
    const viewRef = { current: view }
    const { rerender } = renderHook(({ code }) => useSyncCanvasToCode(viewRef as never, code), {
      initialProps: { code: 'first update' },
    })
    expect(view.dispatch).toHaveBeenCalledTimes(1)

    rerender({ code: 'second update' })
    expect(view.dispatch).toHaveBeenCalledTimes(2)
  })
})

describe('useSyncCodeToCanvas', () => {
  let mockState: {
    syncDirection: 'canvas' | 'code' | null
    setSyncDirection: ReturnType<typeof vi.fn>
    importFromCode: ReturnType<typeof vi.fn>
    applyCodeSource: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    mockState = {
      syncDirection: null,
      setSyncDirection: vi.fn(),
      importFromCode: vi.fn(),
      applyCodeSource: vi.fn(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(useStore as any).getState = vi.fn(() => mockState)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  function makeUpdate(docChanged: boolean, docContent = 'graph TD\n  A[Node]') {
    return {
      docChanged,
      view: {
        state: {
          doc: { toString: () => docContent },
        },
      },
    }
  }

  it('returns a stable function reference across renders', () => {
    const { result, rerender } = renderHook(() => useSyncCodeToCanvas())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
  })

  it('does nothing when update.docChanged is false', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(false) as never)
    })
    expect(mockState.setSyncDirection).not.toHaveBeenCalled()
  })

  it('does nothing when syncDirection is "canvas"', () => {
    mockState.syncDirection = 'canvas'
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true) as never)
    })
    expect(mockState.setSyncDirection).not.toHaveBeenCalled()
    expect(mockState.importFromCode).not.toHaveBeenCalled()
  })

  it('does not feed a programmatic Canvas-to-Code update back into the document', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current({
        ...makeUpdate(true),
        transactions: [{ annotation: vi.fn(() => 'flowforge.canvas-sync') }],
      } as never)
    })
    expect(mockState.setSyncDirection).not.toHaveBeenCalled()
    expect(mockState.applyCodeSource).not.toHaveBeenCalled()
  })

  it('calls setSyncDirection("code") immediately when docChanged', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true) as never)
    })
    expect(mockState.setSyncDirection).toHaveBeenCalledWith('code')
  })

  it('clears previous timer when called again before 300ms', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true, 'v1') as never)
    })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    act(() => {
      result.current(makeUpdate(true, 'v2') as never)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mockState.applyCodeSource).toHaveBeenCalledTimes(1)
    expect(mockState.applyCodeSource).toHaveBeenCalledWith('v2')
  })

  it('delegates the exact source to the transaction path after 300ms', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true) as never)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mockState.applyCodeSource).toHaveBeenCalledWith('graph TD\n  A[Node]')
  })

  it('delegates invalid source without mutating Canvas directly', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true, 'invalid code') as never)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mockState.applyCodeSource).toHaveBeenCalledWith('invalid code')
    expect(mockState.importFromCode).not.toHaveBeenCalled()
  })

  it('calls setSyncDirection(null) after timer fires on success', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true) as never)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mockState.setSyncDirection).toHaveBeenLastCalledWith(null)
  })

  it('calls setSyncDirection(null) after delegating invalid source', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => {
      result.current(makeUpdate(true, 'bad code') as never)
    })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(mockState.setSyncDirection).toHaveBeenLastCalledWith(null)
  })
})
