import React, { useEffect, useState } from 'react'
import type { EdgeAttachmentSide } from '../../../../shared/diagram-contracts'

type ScreenPoint = { x: number; y: number }
type Rect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>

const SIDE_VECTORS: Record<EdgeAttachmentSide, ScreenPoint> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

export function connectionPreviewStart(rect: Rect, side: EdgeAttachmentSide): ScreenPoint {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  if (side === 'top') return { x: centerX, y: rect.top }
  if (side === 'right') return { x: rect.left + rect.width, y: centerY }
  if (side === 'bottom') return { x: centerX, y: rect.top + rect.height }
  return { x: rect.left, y: centerY }
}

/** A directional rubber-band that leaves the selected node side before curving to the pointer. */
export function connectionPreviewPath(start: ScreenPoint, end: ScreenPoint, side: EdgeAttachmentSide): string {
  const vector = SIDE_VECTORS[side]
  const offset = Math.max(40, Math.min(100, Math.round(Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) / 4)))
  const controlA = { x: start.x + vector.x * offset, y: start.y + vector.y * offset }
  const controlB = { x: end.x - vector.x * offset, y: end.y - vector.y * offset }
  return `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${end.x} ${end.y}`
}

function sourceElement(sourceId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('.react-flow__node'))
    .find(element => element.dataset.id === sourceId)
}

export function PendingConnectionPreview({ pending }: { pending: import('@/state/types').PendingConnect | null }): React.JSX.Element | null {
  const [cursor, setCursor] = useState<ScreenPoint | null>(pending?.cursor ?? null)
  const fixedSide = pending?.kind === 'reassign' ? pending.fixedSide ?? 'right' : pending?.sourceSide ?? 'right'

  useEffect(() => {
    if (!pending) {
      setCursor(null)
      return
    }
    const updateCursor = (event: PointerEvent): void => setCursor({ x: event.clientX, y: event.clientY })
    const anchor = sourceElement(pending.kind === 'reassign' ? pending.fixedNodeId : pending.sourceId)
    if (pending.cursor) setCursor(pending.cursor)
    else if (anchor) setCursor(connectionPreviewStart(anchor.getBoundingClientRect(), fixedSide))
    window.addEventListener('pointermove', updateCursor)
    return () => window.removeEventListener('pointermove', updateCursor)
  }, [fixedSide, pending])

  if (!pending || !cursor) return null
  const anchor = sourceElement(pending.kind === 'reassign' ? pending.fixedNodeId : pending.sourceId)
  if (!anchor) return null
  const fixedPoint = connectionPreviewStart(anchor.getBoundingClientRect(), fixedSide)
  const isMovingSource = pending.kind === 'reassign' && pending.endpoint === 'source'
  const start = isMovingSource ? cursor : fixedPoint
  const end = isMovingSource ? fixedPoint : cursor

  return <svg className="pending-connection-preview" data-testid="pending-connect-preview" aria-hidden="true">
    <defs>
      <marker id="pending-connection-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" />
      </marker>
    </defs>
    <path d={connectionPreviewPath(start, end, fixedSide)} markerEnd="url(#pending-connection-arrowhead)" />
  </svg>
}
