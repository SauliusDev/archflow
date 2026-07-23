import { describe, expect, it } from 'vitest'
import type { DocumentSession } from './documentSession'
import { canonicalSourceForExport } from './adapterPlatform'
import { embedLayoutInMermaid } from './embeddedLayout'

describe('canonicalSourceForExport', () => {
  it('returns semantic Mermaid from a document session without embedded layout or global preferences', () => {
    const semanticSource = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n'
    const savedSource = embedLayoutInMermaid(semanticSource, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
      edges: { 'edge:e-A-B': { routeMode: 'orthogonal', waypoints: [{ x: 16, y: 24 }, { x: 80, y: 24 }] } },
      adapterMetadata: { flowchart: { laneOrder: [] } },
    })

    const exported = canonicalSourceForExport({ source: semanticSource } as DocumentSession, savedSource)

    expect(exported).toBe(semanticSource)
    expect(exported).not.toContain('FLOWFORGE LAYOUT')
    expect(exported).not.toContain('smartRouting')
    expect(exported).not.toContain('newEdgeRouteMode')
  })
})
