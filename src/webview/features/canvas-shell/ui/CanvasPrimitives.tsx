import React, { useState } from 'react'
import type { CanvasDescriptor, CanvasElementDescriptor, SemanticHandle } from '../../../../shared/diagram-contracts'

interface CanvasPrimitivesProps {
  descriptor: CanvasDescriptor
  onOperation(operation: string, handle: SemanticHandle): void
}

function readableKind(kind: CanvasElementDescriptor['kind']): string {
  return kind.replaceAll('-', ' ')
}

function orderedMetadata(element: CanvasElementDescriptor): { position?: number; size?: number } {
  const position = element.metadata?.position
  const size = element.metadata?.size
  return {
    ...(typeof position === 'number' && Number.isInteger(position) && position > 0 ? { position } : {}),
    ...(typeof size === 'number' && Number.isInteger(size) && size > 0 ? { size } : {}),
  }
}

export default function CanvasPrimitives({ descriptor, onOperation }: CanvasPrimitivesProps): React.JSX.Element {
  const [announcement, setAnnouncement] = useState('')
  const labels = new Map(descriptor.elements.map(element => [element.id, element.label]))

  const invokePrimaryOperation = (element: CanvasElementDescriptor): void => {
    const operation = element.operations[0]
    if (!operation || element.disabled) return
    onOperation(operation, element.id)
    setAnnouncement(`${operation} ${element.label}`)
  }

  return (
    <section className="canvas-primitives" aria-label="Diagram Canvas">
      <div className="canvas-primitives__elements" role="list" aria-label="Diagram elements">
        {descriptor.elements.map(element => {
          const kind = readableKind(element.kind)
          const ordered = element.kind === 'ordered-lane' ? orderedMetadata(element) : {}
          const content = (
            <>
              <span className="canvas-primitive__label">{element.label}</span>
              <span className="canvas-primitive__kind">{kind}</span>
            </>
          )
          return element.focusable ? (
            <button
              key={element.id}
              type="button"
              role="button"
              className="canvas-primitive canvas-primitive--focusable"
              data-canvas-kind={element.kind}
              aria-label={`${element.label}, ${kind}`}
              aria-pressed={element.selected}
              aria-posinset={ordered.position}
              aria-setsize={ordered.size}
              disabled={element.disabled || element.operations.length === 0}
              onClick={() => invokePrimaryOperation(element)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  invokePrimaryOperation(element)
                }
              }}
            >
              {content}
            </button>
          ) : (
            <div
              key={element.id}
              role="listitem"
              tabIndex={-1}
              className="canvas-primitive"
              data-canvas-kind={element.kind}
              aria-label={`${element.label}, ${kind}`}
            >
              {content}
            </div>
          )
        })}
      </div>
      <div className="canvas-primitives__connectors" role="list" aria-label="Diagram connectors">
        {descriptor.connectors.map(connector => {
          const source = labels.get(connector.source) ?? connector.source
          const target = labels.get(connector.target) ?? connector.target
          const label = connector.label ?? 'Unlabelled'
          return (
            <div
              key={connector.id}
              role="listitem"
              aria-label={`${label} connector from ${source} to ${target}`}
              className="canvas-connector-primitive"
              data-disabled={connector.disabled || undefined}
            >
              <span>{label}</span>
              <span>from {source} to {target}</span>
            </div>
          )
        })}
      </div>
      <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
    </section>
  )
}
