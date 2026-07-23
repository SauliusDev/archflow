import React, { useCallback, useEffect, useRef, useState } from 'react'
import ResizeHandle from './ResizeHandle'
import type { PanelId, PanelVisible } from '@/features/settings'

const PANEL_ORDER: readonly PanelId[] = ['canvas', 'code', 'preview'] as const
const MIN_WIDTH = 80

interface PanelLayoutProps {
  panelVisible: PanelVisible
  canvas: React.ReactNode
  code?: React.ReactNode
  preview?: React.ReactNode
}

interface DragState {
  leftPanel: PanelId
  rightPanel: PanelId
  startX: number
  leftStartPx: number
  rightStartPx: number
  totalPx: number
  handleEl: HTMLElement | null
}

export default function PanelLayout({ panelVisible, canvas, code, preview }: PanelLayoutProps): React.JSX.Element {
  const [panelBasis, setPanelBasis] = useState<Record<PanelId, number | null>>({
    canvas: null,
    code: null,
    preview: null,
  })

  const panelEls = useRef<Record<PanelId, HTMLDivElement | null>>({
    canvas: null,
    code: null,
    preview: null,
  })

  const dragRef = useRef<DragState | null>(null)

  useEffect(() => {
    setPanelBasis({ canvas: null, code: null, preview: null })
  }, [panelVisible])

  const handleMouseMove = useCallback((e: MouseEvent): void => {
    const drag = dragRef.current
    if (!drag) return
    const leftEl = panelEls.current[drag.leftPanel]
    const rightEl = panelEls.current[drag.rightPanel]
    if (!leftEl || !rightEl) return

    const delta = e.clientX - drag.startX
    const newLeft = Math.max(MIN_WIDTH, Math.min(drag.leftStartPx + delta, drag.totalPx - MIN_WIDTH))
    const newRight = drag.totalPx - newLeft

    leftEl.style.flexBasis = newLeft + 'px'
    leftEl.style.flexGrow = '0'
    leftEl.style.flexShrink = '0'
    rightEl.style.flexBasis = newRight + 'px'
    rightEl.style.flexGrow = '0'
    rightEl.style.flexShrink = '0'
  }, [])

  const handleMouseUp = useCallback((): void => {
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
    const drag = dragRef.current
    if (drag) {
      const leftEl = panelEls.current[drag.leftPanel]
      const rightEl = panelEls.current[drag.rightPanel]
      const newLeft = leftEl ? leftEl.getBoundingClientRect().width : drag.leftStartPx
      const newRight = rightEl ? rightEl.getBoundingClientRect().width : drag.rightStartPx
      setPanelBasis(prev => ({ ...prev, [drag.leftPanel]: newLeft, [drag.rightPanel]: newRight }))
      drag.handleEl?.classList.remove('resize-handle--dragging')
    }
    dragRef.current = null
  }, [handleMouseMove])

  const handleResizeStart = useCallback((leftPanel: PanelId, rightPanel: PanelId, e: React.MouseEvent): void => {
    e.preventDefault()
    const leftEl = panelEls.current[leftPanel]
    const rightEl = panelEls.current[rightPanel]
    if (!leftEl || !rightEl) return
    const leftRect = leftEl.getBoundingClientRect()
    const rightRect = rightEl.getBoundingClientRect()
    const handleEl = e.currentTarget as HTMLElement
    handleEl.classList.add('resize-handle--dragging')
    dragRef.current = {
      leftPanel,
      rightPanel,
      startX: e.clientX,
      leftStartPx: leftRect.width,
      rightStartPx: rightRect.width,
      totalPx: leftRect.width + rightRect.width,
      handleEl,
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove, handleMouseUp])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const slots: Record<PanelId, React.ReactNode> = {
    canvas,
    code: code ?? null,
    preview: preview ?? null,
  }

  function isEffectivelyVisible(panel: PanelId): boolean {
    return panelVisible[panel] && (panel === 'canvas' || slots[panel] != null)
  }

  function getPanelStyle(panel: PanelId): React.CSSProperties {
    const hidden = panel === 'canvas' && !panelVisible[panel]
    if (hidden) return { display: 'none' }
    const basis = panelBasis[panel]
    return basis === null
      ? { flex: 1, minWidth: MIN_WIDTH, overflow: 'hidden' }
      : { flexBasis: basis + 'px', flexShrink: 0, flexGrow: 0, minWidth: MIN_WIDTH, overflow: 'hidden' }
  }

  return (
    <div className="panel-layout">
      {PANEL_ORDER.map((panel, i) => {
        const shouldRender = panel === 'canvas' || isEffectivelyVisible(panel)
        if (!shouldRender) return null

        const prevVisible = PANEL_ORDER.slice(0, i).reverse().find(isEffectivelyVisible) ?? null
        const needsHandle = isEffectivelyVisible(panel) && prevVisible !== null

        return (
          <React.Fragment key={panel}>
            {needsHandle && prevVisible && (
              <ResizeHandle onMouseDown={(e) => handleResizeStart(prevVisible, panel, e)} />
            )}
            <div
              ref={el => { panelEls.current[panel] = el }}
              className="panel-layout__panel"
              style={getPanelStyle(panel)}
            >
              {slots[panel]}
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
