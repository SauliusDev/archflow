import React from 'react'
import type { DiagramFamily } from '../../../shared/diagram-contracts'
import { CodePanel, PreviewPanel } from '@/features/import-export'

export default function CodePreviewFallback({ family, reason }: { family: DiagramFamily; reason?: string }): React.JSX.Element {
  const unavailableReason = reason ?? `Canvas unavailable: no visual adapter is registered for ${family}.`
  const punctuatedReason = /[.!?]$/.test(unavailableReason) ? unavailableReason : `${unavailableReason}.`
  return (
    <section className="code-preview-fallback" aria-labelledby="fallback-title">
      <header className="code-preview-fallback__header">
        <div>
          <h2 id="fallback-title">{family} diagram</h2>
          <p>{punctuatedReason} Source editing and preview remain byte-preserving.</p>
        </div>
        <span className="code-preview-fallback__badge">Code preview</span>
      </header>
      <div className="code-preview-fallback__panels">
        <div className="code-preview-fallback__panel" aria-label="Diagram source"><CodePanel /></div>
        <div className="code-preview-fallback__panel" aria-label="Diagram preview"><PreviewPanel /></div>
      </div>
    </section>
  )
}
