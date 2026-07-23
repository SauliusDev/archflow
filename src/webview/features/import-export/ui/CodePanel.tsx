import React, { useRef, useState, useEffect } from 'react'
import { EditorView, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view'
import type { ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useStore } from '@/state/createStore'
import { useSyncCanvasToCode, useSyncCodeToCanvas } from '@/lib/sync'

// ── Mermaid language (defined at module scope — never inside component) ──────

const mermaidLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^%%/)) { stream.skipToEnd(); return 'comment' }
    if (stream.match(/^(graph|flowchart|subgraph|end)\b/)) return 'keyword'
    if (stream.match(/^(LR|TD|TB|RL|BT)\b/)) return 'keyword'
    if (stream.match(/^\[[^\]]*\]/)) return 'string'
    if (stream.match(/^\([^)]*\)/)) return 'string'
    if (stream.match(/^\{[^}]*\}/)) return 'string'
    if (stream.match(/^>[^\]]*\]/)) return 'string'
    if (stream.match(/^-[-=.>|o*]+/)) return 'operator'
    if (stream.match(/^\|[^|]*\|/)) return 'function'
    if (stream.match(/^style\b/)) return 'keyword'
    if (stream.match(/^[A-Za-z_]\w*/)) return 'variableName'
    stream.next()
    return null
  },
  languageData: { name: 'mermaid' },
})

const mermaidHighlightStyle = HighlightStyle.define([
  { tag: tags.comment,      color: 'var(--mv-syntax-comment)'    },
  { tag: tags.keyword,      color: 'var(--mv-syntax-keyword)'    },
  { tag: tags.string,       color: 'var(--mv-syntax-string)'     },
  { tag: tags.variableName, color: 'var(--mv-syntax-identifier)' },
  { tag: tags.operator,     color: 'var(--mv-syntax-function)'   },
  { tag: tags.function,     color: 'var(--mv-syntax-function)'   },
])

const mermaidTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--mv-canvas-bg)', color: 'var(--mv-syntax-plain)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-content': {
    caretColor: 'var(--mv-accent)',
    fontFamily: 'var(--mv-font-mono)',
    fontSize: '12.5px',
    lineHeight: '1.65',
    padding: '8px 0',
  },
  '.cm-line': { padding: '0 4px 0 8px' },
  '.cm-gutters': {
    backgroundColor: 'var(--mv-canvas-bg)',
    color: 'var(--mv-text-dim)',
    border: 'none',
    borderRight: '1px solid var(--mv-border)',
    minWidth: '40px',
  },
  '.cm-lineNumbers .cm-gutterElement': { paddingRight: '8px', fontSize: '11px' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--mv-bg-hover)' },
  '.cm-activeLine': { backgroundColor: 'var(--mv-bg-hover)' },
  '.cm-cursor': { borderLeftColor: 'var(--mv-accent)' },
  '.cm-selectionBackground, ::selection': { backgroundColor: 'var(--mv-accent-dim)' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--mv-accent-mid)' },
  '.cm-scroller': { fontFamily: 'var(--mv-font-mono)' },
}, { dark: true })

// ── Component ─────────────────────────────────────────────────────────────────

export default function CodePanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const syncCodeToCanvasRef = useRef<((update: ViewUpdate) => void) | null>(null)
  const [cursor, setCursor] = useState({ line: 1, col: 1 })

  const codeSource = useStore(s => s.codeSource)
  const code = codeSource

  useSyncCanvasToCode(viewRef, code)
  const onSyncUpdate = useSyncCodeToCanvas()
  syncCodeToCanvasRef.current = onSyncUpdate

  // Mount editor once
  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      state: EditorState.create({
        doc: code,
        extensions: [
          mermaidTheme,
          lineNumbers(),
          highlightActiveLine(),
          drawSelection(),
          mermaidLanguage,
          syntaxHighlighting(mermaidHighlightStyle),
          EditorView.updateListener.of(update => {
            if (update.selectionSet || update.docChanged) {
              const { head } = update.state.selection.main
              const line = update.state.doc.lineAt(head)
              setCursor({ line: line.number, col: head - line.from + 1 })
            }
            if (update.docChanged) syncCodeToCanvasRef.current?.(update)
          }),
        ],
      }),
      parent: containerRef.current,
    })

    viewRef.current = view
    return () => { view.destroy() }
  }, [])

  return (
    <div className="code-panel">
      <div className="code-panel__header">
        <span className="code-panel__title">CODE</span>
      </div>
      <div className="code-panel__body" ref={containerRef} />
      <div className="code-panel__statusbar">
        <span>Ln {cursor.line}, Col {cursor.col}</span>
        <span>Mermaid</span>
      </div>
    </div>
  )
}
