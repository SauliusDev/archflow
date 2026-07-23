import React from 'react'
import { useReactFlow } from '@xyflow/react'
import { useStore } from '@/state/createStore'
import type { LayoutStyle } from '../../../../shared/protocol'
import type { CanvasFitViewOptions } from '../hooks/useCanvasViewport'

const CLASSIC_FIT_VIEW_OPTIONS: CanvasFitViewOptions = { padding: 0.1, duration: 200, maxZoom: 1 }
const PAPER_GRID_FIT_VIEW_OPTIONS: CanvasFitViewOptions = { padding: 0.2, duration: 360, maxZoom: 1 }

export default function ZoomBar({ layoutStyle = 'classic' }: { layoutStyle?: LayoutStyle }): React.JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const viewport = useStore(s => s.viewport)
  const nodes = useStore(s => s.nodes)
  const minimapOpen = useStore(s => s.minimapOpen)
  const toggleMinimap = useStore(s => s.toggleMinimap)
  const isLocked = useStore(s => s.isLocked)
  const toggleLock = useStore(s => s.toggleLock)

  const zoomPercent = Math.round((viewport.zoom ?? 1) * 100)
  const selectedNodeIds = nodes.filter(node => node.selected).map(node => node.id)
  const canFocusSelection = selectedNodeIds.length > 0
  const fitViewOptions = layoutStyle === 'modern' ? PAPER_GRID_FIT_VIEW_OPTIONS : CLASSIC_FIT_VIEW_OPTIONS

  return (
    <div className="zoom-bar" role="toolbar" aria-label="Zoom controls">
      <span className="canvas-control-tooltip canvas-control-tooltip--top" data-tooltip="Zoom out">
        <button className="zoom-bar__btn" aria-label="Zoom out" onClick={() => zoomOut({ duration: 200 })}>−</button>
      </span>
      <span className="zoom-bar__percentage canvas-control-tooltip canvas-control-tooltip--top" data-tooltip={`Current zoom: ${zoomPercent}%`}>{zoomPercent}%</span>
      <span className="canvas-control-tooltip canvas-control-tooltip--top" data-tooltip="Zoom in">
        <button className="zoom-bar__btn" aria-label="Zoom in" onClick={() => zoomIn({ duration: 200 })}>+</button>
      </span>
      <div className="zoom-bar__divider" aria-hidden="true" />
      <span className="canvas-control-tooltip canvas-control-tooltip--top" data-tooltip="Fit all nodes to screen">
        <button className="zoom-bar__btn" aria-label="Fit all nodes in viewport" onClick={() => fitView(fitViewOptions)}>⤢</button>
      </span>
      <span className="canvas-control-tooltip canvas-control-tooltip--top" data-tooltip={canFocusSelection ? 'Focus selected nodes' : 'Select nodes to focus'}>
        <button className="zoom-bar__btn" aria-label="Focus selection" disabled={!canFocusSelection} onClick={() => fitView({ ...fitViewOptions, nodes: selectedNodeIds.map(id => ({ id })) })}>⌖</button>
      </span>
      <div className="zoom-bar__divider" aria-hidden="true" />
      <span className="canvas-control-tooltip canvas-control-tooltip--top" data-tooltip={minimapOpen ? 'Hide overview map' : 'Show overview map'}>
        <button className={`zoom-bar__btn zoom-bar__btn--toggle${minimapOpen ? ' zoom-bar__btn--active' : ''}`} role="switch" aria-checked={minimapOpen} aria-label={minimapOpen ? 'Hide minimap' : 'Show minimap'} onClick={toggleMinimap}>⊞</button>
      </span>
      <span className="canvas-control-tooltip canvas-control-tooltip--top" data-tooltip={isLocked ? 'Unlock canvas editing' : 'Lock canvas editing'}>
        <button
          className={`zoom-bar__btn zoom-bar__btn--toggle${isLocked ? ' zoom-bar__btn--active' : ''}`}
          role="switch"
          aria-checked={isLocked}
          aria-label={isLocked ? 'Unlock canvas' : 'Lock canvas'}
          onClick={toggleLock}
        >
        <svg className="zoom-bar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {isLocked ? (
            <>
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </>
          ) : (
            <>
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 7.7-1.5" />
            </>
          )}
        </svg>
        </button>
      </span>
    </div>
  )
}
