import React from 'react'
import type { DiagramFamily } from '../../../shared/diagram-contracts'
import { useStore } from '@/state/createStore'

export default function CodePreviewFallback({ family, reason, onOpenCode }: { family: DiagramFamily; reason?: string; onOpenCode?: () => void }): React.JSX.Element {
  const restoreLastValidDiagram = useStore(state => state.restoreLastValidDiagram)
  const canRestore = useStore(state => Boolean(state.recoverySnapshot))
  const unavailableReason = reason ?? `Canvas unavailable: no visual adapter is registered for ${family}.`
  const punctuatedReason = /[.!?]$/.test(unavailableReason) ? unavailableReason : `${unavailableReason}.`
  return (
    <section className="code-preview-fallback" aria-labelledby="fallback-title">
      <div className="code-preview-fallback__message" role="status">
        <span className="code-preview-fallback__eyebrow">{family} diagram</span>
        <h2 id="fallback-title">Canvas unavailable</h2>
        <p>{punctuatedReason}</p>
        <p className="code-preview-fallback__hint">Use the Code or Preview tab to continue working with this diagram.</p>
        <button type="button" className="code-preview-fallback__restore" onClick={canRestore ? restoreLastValidDiagram : onOpenCode}>
          {canRestore ? 'Restore last valid diagram' : 'Open source in Code tab'}
        </button>
      </div>
    </section>
  )
}
