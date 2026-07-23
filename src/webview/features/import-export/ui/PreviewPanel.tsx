import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mermaid from 'mermaid'
import { useStore } from '@/state/createStore'
import { canonicalSourceForExport } from '@/lib/adapterPlatform'
import type { DocumentSession } from '@/lib/documentSession'
import PreviewBar from './PreviewBar'
import type { Direction, MermaidTheme, CurveStyle, Look } from './PreviewBar'

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })
let renderIdCounter = 0

/**
 * Mermaid creates a node for a `style MissingNode ...` directive even when
 * that node is not part of the graph. The Canvas deliberately does not do
 * that, so remove only those stale style directives from the preview render.
 * The document source remains untouched so users can still edit it in Code.
 */
function previewSourceForSession(code: string, session: DocumentSession | null): string {
  if (session?.family !== 'flowchart') return code
  const model = session.projection.model as {
    nodes?: Array<{ id: string }>
    edges?: Array<{ source: string; target: string }>
  }
  if (!Array.isArray(model.nodes) || !Array.isArray(model.edges)) return code

  const graphNodeIds = new Set([
    ...model.nodes.map(node => node.id),
    ...model.edges.flatMap(edge => [edge.source, edge.target]),
  ])
  return code.replace(/^\s*style\s+([^\s]+)\b.*(?:\r\n|\n|\r|$)/gm, (line, id: string) =>
    graphNodeIds.has(id) ? line : '',
  )
}

export default function PreviewPanel(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const codeSource = useStore(s => s.codeSource)
  const documentSession = useStore(s => s.documentSession)
  const workingRevision = documentSession?.workingRevision ?? 0
  const code = useMemo(
    () => codeSource || canonicalSourceForExport(documentSession, codeSource),
    [codeSource, documentSession],
  )
  const previewSource = useMemo(
    () => previewSourceForSession(code, documentSession),
    [code, documentSession],
  )

  const [direction, setDirection] = useState<Direction>('TD')
  const [theme, setTheme] = useState<MermaidTheme>('dark')
  const [curve, setCurve] = useState<CurveStyle>('basis')
  const [look, setLook] = useState<Look>('classic')
  const [zoom, setZoom] = useState(1)
  const [renderError, setRenderError] = useState<{ revision: number; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme,
      look,
      flowchart: { curve },
    })
    const directedCode = previewSource.replace(/^(flowchart|graph)\s+\w+/m, `flowchart ${direction}`)
    const id = `mermaid-svg-${++renderIdCounter}`
    mermaid.render(id, directedCode)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg
          setRenderError(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setRenderError({
            revision: workingRevision,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })
    return () => { cancelled = true }
  }, [previewSource, direction, theme, curve, look, workingRevision])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => {
        const delta = e.deltaY < 0 ? 0.1 : -0.1
        return Math.min(3, Math.max(0.25, parseFloat((z + delta).toFixed(2))))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(3, parseFloat((z + 0.25).toFixed(2)))), [])
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(0.25, parseFloat((z - 0.25).toFixed(2)))), [])
  const handleZoomReset = useCallback(() => setZoom(1), [])

  const handleExport = useCallback(() => {
    const svgEl = containerRef.current?.querySelector('svg')
    if (!svgEl) return
    const blob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'diagram.svg'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <div className="preview-panel">
      <div className="preview-panel__header">
        <span className="preview-panel__title">PREVIEW</span>
      </div>
      <div className="preview-panel__body" ref={bodyRef}>
        {renderError && (
          <div className="preview-panel__error" role="status" data-revision={renderError.revision}>
            Preview unavailable for this revision: {renderError.message}
          </div>
        )}
        <div
          ref={containerRef}
          className="preview-panel__svg-container"
          style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
        />
        <PreviewBar
          direction={direction}
          theme={theme}
          curve={curve}
          look={look}
          zoom={zoom}
          onDirectionChange={setDirection}
          onThemeChange={setTheme}
          onCurveChange={setCurve}
          onLookChange={setLook}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onZoomReset={handleZoomReset}
          onExport={handleExport}
        />
      </div>
    </div>
  )
}
