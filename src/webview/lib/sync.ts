import { useEffect, useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import { useStore } from '@/state/createStore'


export function useSyncCanvasToCode(
  viewRef: RefObject<EditorView | null>,
  code: string
): void {
  const syncDirection = useStore(s => s.syncDirection)

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (syncDirection === 'code') return

    const current = view.state.doc.toString()
    if (current === code) return

    const savedPos = view.state.selection.main.head
    view.dispatch({ changes: { from: 0, to: current.length, insert: code } })

    const clampedPos = Math.min(savedPos, view.state.doc.length)
    if (clampedPos !== view.state.selection.main.head) {
      view.dispatch({ selection: { anchor: clampedPos } })
    }
  }, [code, syncDirection, viewRef])
}

export function useSyncCodeToCanvas(): (update: ViewUpdate) => void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return useCallback((update: ViewUpdate): void => {
    if (!update.docChanged) return

    const { syncDirection, setSyncDirection, applyCodeSource } = useStore.getState()
    if (syncDirection === 'canvas') return

    setSyncDirection('code')
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => {
      // Re-check direction: a canvas drag may have started during the debounce window
      if (useStore.getState().syncDirection === 'canvas') {
        timerRef.current = null
        return
      }
      const code = update.view.state.doc.toString()
      applyCodeSource(code)
      setSyncDirection(null)
      timerRef.current = null
    }, 300)
  }, [])
}
