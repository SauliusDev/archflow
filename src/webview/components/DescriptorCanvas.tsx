import React from 'react'
import type { CanvasDescriptor, LayoutGeometry, SemanticHandle } from '../../shared/diagram-contracts'

interface DescriptorCanvasProps {
  descriptor: CanvasDescriptor
  geometry: Readonly<Record<SemanticHandle, LayoutGeometry>>
  readOnly?: boolean
  onSelect?: (handle: SemanticHandle) => void
}

export default function DescriptorCanvas({ descriptor, geometry, readOnly = false, onSelect }: DescriptorCanvasProps): React.JSX.Element {
  const [announcement, setAnnouncement] = React.useState('')
  const select = (handle: SemanticHandle, label: string): void => {
    setAnnouncement(`${label} selected`)
    onSelect?.(handle)
  }
  return (
    <div className="descriptor-canvas" role="group" aria-label="Diagram canvas">
      {descriptor.elements.map(element => {
        const position = geometry[element.id] ?? { x: 0, y: 0 }
        return (
          <button
            key={element.id}
            type="button"
            className={`descriptor-canvas__element descriptor-canvas__element--${element.kind}`}
            style={{ transform: `translate(${position.x}px, ${position.y}px)`, width: position.width, height: position.height }}
            aria-pressed={element.selected}
            aria-label={`${element.kind}: ${element.label}`}
            disabled={readOnly || element.disabled}
            tabIndex={element.focusable ? 0 : -1}
            data-semantic-handle={element.id}
            onClick={() => select(element.id, element.label)}
          >
            <span>{element.label}</span>
            {!readOnly && element.operations.length > 0 && <span className="descriptor-canvas__operations" aria-hidden="true">{element.operations.join(' · ')}</span>}
          </button>
        )
      })}
      <svg className="descriptor-canvas__connectors" aria-hidden="true">
        {descriptor.connectors.map(connector => <g key={connector.id} data-semantic-handle={connector.id} />)}
      </svg>
      <div className="descriptor-canvas__connector-list" aria-label="Diagram connectors">
        {descriptor.connectors.map(connector => (
          <button
            key={connector.id}
            type="button"
            data-semantic-handle={connector.id}
            aria-label={`connector: ${connector.label ?? `${connector.source} to ${connector.target}`}`}
            disabled={readOnly || connector.disabled || (connector.operations?.length ?? 0) === 0}
            onClick={() => select(connector.id, connector.label ?? 'Connector')}
          >
            {connector.label ?? `${connector.source} → ${connector.target}`}
          </button>
        ))}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    </div>
  )
}
