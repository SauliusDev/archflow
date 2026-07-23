import { useEffect, useCallback, useRef } from 'react'
import type { RefObject } from 'react'
import type { EditorView, ViewUpdate } from '@codemirror/view'
import { Transaction } from '@codemirror/state'
import { useStore } from '@/state/createStore'

const CANVAS_SYNC_EVENT = 'flowforge.canvas-sync'

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
    // CodeMirror reports this dispatch as a document change. Tag it so the
    // inbound Code-to-Canvas listener does not treat a Canvas edit as text
    // typed by the user and overwrite the newer canvas transaction.
    view.dispatch({
      changes: { from: 0, to: current.length, insert: code },
      annotations: Transaction.userEvent.of(CANVAS_SYNC_EVENT),
    })

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
    if (update.transactions?.some(transaction => transaction.annotation(Transaction.userEvent) === CANVAS_SYNC_EVENT)) return

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
