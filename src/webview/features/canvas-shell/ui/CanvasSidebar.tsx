import React, { useState, useRef, useCallback } from 'react'
import { useReactFlow } from '@xyflow/react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/state/createStore'
import { Palette } from '@/features/flowchart'

export default function CanvasSidebar(): React.JSX.Element {
  const { fitView } = useReactFlow()

  const [paletteOpen, setPaletteOpen] = useState(false)
  const addNodeBtnRef = useRef<HTMLButtonElement>(null)

  const nodes = useStore(s => s.nodes)
  const past = useStore(s => s.history.past)
  const future = useStore(s => s.history.future)
  const documentSession = useStore(s => s.documentSession)
  const isLocked = useStore(s => s.isLocked)
  const inspectorVisible = documentSession?.layout.inspectorVisible !== false


  const { addSubgraph, applyAutoLayout, undo, redo, setInspectorVisible } = useStore(
    useShallow(s => ({
      addSubgraph: s.addSubgraph,
      applyAutoLayout: s.applyAutoLayout,
      undo: s.undo,
      redo: s.redo,
      setInspectorVisible: s.setInspectorVisible,
    }))
  )

  const canUndo = !isLocked && !documentSession?.conflict && (documentSession ? documentSession.history.past.length > 0 : past.length > 0)
  const canRedo = !isLocked && !documentSession?.conflict && (documentSession ? documentSession.history.future.length > 0 : future.length > 0)

  const handlePaletteClose = useCallback(function handlePaletteClose(): void {
    setPaletteOpen(false)
    addNodeBtnRef.current?.focus()
  }, [])

  function handleAutoLayout(): void {
    if (nodes.length === 0) return
    applyAutoLayout()
    fitView({ padding: 0.1 })
  }

  function handleZoomToFit(): void {
    fitView({ padding: 0.1, duration: 200, maxZoom: 1 })
  }

  return (
    <>
      <div className="canvas-sidebar" role="toolbar" aria-label="Canvas tools">
        <span className="canvas-control-tooltip canvas-control-tooltip--right" data-tooltip="Add a node">
          <button
            ref={addNodeBtnRef}
            className={`canvas-sidebar__btn${paletteOpen ? ' canvas-sidebar__btn--active' : ''}`}
            aria-label="Add Node"
            aria-expanded={paletteOpen}
            aria-haspopup="dialog"
            onClick={() => setPaletteOpen(p => !p)}
          >
            ＋
          </button>
        </span>
        <span className="canvas-control-tooltip canvas-control-tooltip--right" data-tooltip="Add a group">
          <button className="canvas-sidebar__btn" aria-label="Add Subgraph" onClick={addSubgraph}>⊞</button>
        </span>
        <div className="canvas-sidebar__divider" aria-hidden="true" />
        <span className="canvas-sidebar__disabled-help canvas-control-tooltip canvas-control-tooltip--right" data-tooltip="Undo last change">
          <button
            className="canvas-sidebar__btn"
            aria-label="Undo"
            disabled={!canUndo}
            onClick={undo}
          >
            ↩
          </button>
        </span>
        <span className="canvas-sidebar__disabled-help canvas-control-tooltip canvas-control-tooltip--right" data-tooltip="Redo last change">
          <button
            className="canvas-sidebar__btn"
            aria-label="Redo"
            disabled={!canRedo}
            onClick={redo}
          >
            ↪
          </button>
        </span>
        <div className="canvas-sidebar__divider" aria-hidden="true" />
        <span className="canvas-control-tooltip canvas-control-tooltip--right" data-tooltip="Arrange nodes automatically">
          <button className="canvas-sidebar__btn" aria-label="Apply auto-layout" onClick={handleAutoLayout}>⬡</button>
        </span>
        <span className="canvas-control-tooltip canvas-control-tooltip--right" data-tooltip="Fit diagram to screen">
          <button className="canvas-sidebar__btn" aria-label="Zoom to Fit" onClick={handleZoomToFit}>⤢</button>
        </span>
        <span className="canvas-control-tooltip canvas-control-tooltip--right" data-tooltip={inspectorVisible ? 'Hide properties panel' : 'Show properties panel'}>
          <button
            className={`canvas-sidebar__btn${inspectorVisible ? ' canvas-sidebar__btn--active' : ''}`}
            aria-label={inspectorVisible ? 'Hide inspector' : 'Show inspector'}
            aria-pressed={inspectorVisible}
            onClick={() => setInspectorVisible(!inspectorVisible)}
          >
            ☷
          </button>
        </span>

      </div>
      {paletteOpen && (
        <Palette onClose={handlePaletteClose} triggerRef={addNodeBtnRef} />
      )}
    </>
  )
}
