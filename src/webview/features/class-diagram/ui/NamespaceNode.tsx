import React from 'react'
import type { ClassNamespace } from '@/features/class-diagram'
import '@/styles/components/class-diagram.css'

export interface NamespaceBounds { x: number; y: number; width: number; height: number }

export function namespaceContains(bounds: NamespaceBounds, point: { x: number; y: number }): boolean {
  return point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height
}

export function toNamespaceRelativePosition(bounds: NamespaceBounds, point: { x: number; y: number }): { x: number; y: number } {
  return { x: point.x - bounds.x, y: point.y - bounds.y }
}

export function NamespaceNode({ namespace, selected = false, children }: { namespace: ClassNamespace; selected?: boolean; children?: React.ReactNode }): React.JSX.Element {
  return (
    <section
      className={['class-diagram', 'namespace-node', selected ? 'namespace-node--selected' : ''].filter(Boolean).join(' ')}
      role="group"
      aria-label={`Namespace ${namespace.label}`}
      data-namespace-id={namespace.id}
    >
      <header className="namespace-node__header">{namespace.label}</header>
      <div className="namespace-node__body">{children}</div>
    </section>
  )
}
