import { describe, expect, it } from 'vitest'
import { detectDiagramFamily } from '../../extension/diagramTypeDetector'
import type { AdapterResult, LayoutStateV2 } from '../../shared/diagram-contracts'
import { initializeAdapterProjection } from './adapterPlatform'
import {
  acceptExternalRevision,
  acknowledgeSave,
  commitSourceOperationTransaction,
  createDocumentSession,
  redoDocumentTransaction,
  resolveConflict,
  undoDocumentTransaction,
} from './documentSession'
import { embedLayoutInMermaid, readEmbeddedLayoutV2, stripEmbeddedLayout } from './embeddedLayout'
import { flowchartCompatibilityAdapter, issueFlowchartOperation, type FlowchartAdapterModel } from '@/features/flowchart'

function emptyLayout(family: LayoutStateV2['diagramFamily']): LayoutStateV2 {
  return {
    version: 2,
    diagramFamily: family,
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: {},
    edges: {},
    constraints: [],
    adapterMetadata: {},
  }
}

describe('multi-diagram foundation integration journeys', () => {
  it.each([
    ['sequenceDiagram\n', 'sequence'], ['zenuml\n', 'zenuml'], ['classDiagram\n', 'class'],
    ['stateDiagram-v2\n', 'state'], ['erDiagram\n', 'er'], ['architecture-beta\n', 'architecture'],
    ['C4Context\n', 'c4-context'], ['gantt\n', 'other'],
  ] as const)('detects representative family source without mutation', (source, family) => {
    expect(detectDiagramFamily(source)).toMatchObject({ family })
    expect(source).toBe(source.slice())
  })

  it('keeps a flowchart preamble and comment lossless through a targeted edit and save acknowledgement', () => {
    const source = '---\ntitle: Journey\n---\n%% keep this comment\nflowchart TD\n  A[Alpha]\n  B[Beta]\n  A --> B\n'
    const detection = detectDiagramFamily(source)
    expect(detection.family).toBe('flowchart')
    const projection = initializeAdapterProjection(detection.family, source, 4) as AdapterResult<FlowchartAdapterModel>
    let session = createDocumentSession('panel-a', 9, projection, emptyLayout('flowchart'))
    const operation = issueFlowchartOperation(projection, { kind: 'add-node', id: 'C', label: 'Added' })
    const committed = commitSourceOperationTransaction(session, {
      id: 'add-c',
      description: 'Add C',
      operations: operation,
    }, (candidate, revision) => flowchartCompatibilityAdapter.parse(candidate, revision))
    expect(committed.success).toBe(true)
    if (!committed.success) return
    session = committed.session
    expect(session.source).toContain('%% keep this comment')
    expect(session.source).toContain('C[Added]')
    session = acknowledgeSave(session, {
      eventId: 'save-ack-1', sessionId: 'panel-a', transactionId: 'save-1',
      workingRevision: session.workingRevision, hostRevision: 10,
    })
    expect(session).toMatchObject({ dirty: false, baseHostRevision: 10 })
  })

  it('routes an unsupported family to byte-preserving preview without visual mutation', () => {
    const source = 'sequenceDiagram\n  Alice->>Bob: Hello\n'
    const detection = detectDiagramFamily(source)
    expect(detection.family).toBe('sequence')
    const projection = initializeAdapterProjection(detection.family, source, 2)
    expect(projection.concrete.source).toBe(source)
    expect(projection.model).toMatchObject({ editable: false })
    expect(projection.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'code-preview-fallback' }),
    ]))
  })

  it('does not project flowchart route metadata into an unsupported family fallback', () => {
    const semanticSource = 'sequenceDiagram\n  Alice->>Bob: Hello\n'
    const sourceWithFlowchartLayout = embedLayoutInMermaid(semanticSource, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
      edges: { 'edge:e-A-B': { routeMode: 'orthogonal', waypoints: [{ x: 24, y: 36 }, { x: 80, y: 36 }] } },
    })
    const reopened = readEmbeddedLayoutV2(sourceWithFlowchartLayout, 'sequence')
    const projection = initializeAdapterProjection('sequence', reopened.content, 2)

    expect(reopened).toMatchObject({ layout: null, error: expect.stringContaining('does not match') })
    expect(projection.concrete.source).toBe(sourceWithFlowchartLayout)
    expect(projection.model).toMatchObject({ editable: false })
  })

  it('isolates malformed flowchart input and re-enters the visual adapter after correction', () => {
    const malformed = initializeAdapterProjection('flowchart', 'not mermaid', 1)
    expect(malformed.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'code-preview-fallback' }),
    ]))
    const recovered = initializeAdapterProjection('flowchart', 'flowchart TD\n  A[Recovered]\n', 2)
    expect(recovered.diagnostics).toEqual([])
    expect(recovered.canvas.elements).toHaveLength(1)
  })

  it('degrades unsafe class source to named Code/Preview fallback and recovers after correction', () => {
    const unsafeSource = 'classDiagram\nclass `Unsafe Label`\n'
    const degraded = initializeAdapterProjection('class', unsafeSource, 1)

    expect(degraded.concrete.source).toBe(unsafeSource)
    expect(degraded.model).toMatchObject({ editable: false })
    expect(degraded.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'code-preview-fallback',
        message: expect.stringContaining('Class label syntax is outside the supported subset'),
      }),
    ]))

    const recovered = initializeAdapterProjection('class', 'classDiagram\nclass Account\n', 2)
    expect(recovered.diagnostics).toEqual([])
    expect(recovered.canvas.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'class:Account' }),
    ]))
  })

  it('preserves both revisions on external conflict and supports explicit local resolution', () => {
    const source = 'flowchart TD\n  A[Local]\n'
    const initial = initializeAdapterProjection('flowchart', source, 1) as AdapterResult<FlowchartAdapterModel>
    const base = createDocumentSession('panel-conflict', 1, initial, emptyLayout('flowchart'))
    const operation = issueFlowchartOperation(initial, { kind: 'rename-node', id: 'A', label: 'Unsaved' })
    const edited = commitSourceOperationTransaction(base, {
      id: 'local-edit', description: 'Local edit', operations: operation,
    }, (candidate, revision) => flowchartCompatibilityAdapter.parse(candidate, revision))
    expect(edited.success).toBe(true)
    if (!edited.success) return
    const externalSource = 'flowchart TD\n  A[External]\n'
    const conflicted = acceptExternalRevision(
      edited.session,
      2,
      initializeAdapterProjection('flowchart', externalSource, 2),
      emptyLayout('flowchart'),
      'external-2',
    )
    expect(conflicted.source).toContain('Unsaved')
    expect(conflicted.conflict?.content).toBe(externalSource)
    const resolved = resolveConflict(conflicted, {
      kind: 'keep-local', transactionId: 'keep-local', validate: () => true,
    }, (candidate, revision) => flowchartCompatibilityAdapter.parse(candidate, revision))
    expect(resolved.success).toBe(true)
    if (!resolved.success) return
    expect(resolved.session).toMatchObject({ conflict: null, baseHostRevision: 2, dirty: true })
    expect(resolved.session.source).toContain('Unsaved')
  })

  it('migrates V1 layout on save, reopens V2, and keeps source history atomic', () => {
    const source = 'flowchart TD\n  A[Alpha]\n'
    const v1 = embedLayoutInMermaid(source, {
      version: 1, nodes: { A: { x: 12, y: 24 } }, viewport: { x: 0, y: 0, zoom: 1 },
    })
    const migrated = readEmbeddedLayoutV2(v1, 'flowchart')
    expect(migrated).toMatchObject({ migrated: true, layout: { version: 2 } })
    const saved = embedLayoutInMermaid(migrated.content, migrated.layout!)
    const reopened = readEmbeddedLayoutV2(saved, 'flowchart')
    expect(reopened).toMatchObject({ migrated: false, layout: { elements: { 'node:A': { x: 12, y: 24 } } } })

    const projection = flowchartCompatibilityAdapter.parse(reopened.content, 1)
    let session = createDocumentSession('panel-history', 1, projection, reopened.layout!)
    const operation = issueFlowchartOperation(projection, { kind: 'rename-node', id: 'A', label: 'Changed' })
    const committed = commitSourceOperationTransaction(session, {
      id: 'rename-history', description: 'Rename A', operations: operation,
    }, (candidate, revision) => flowchartCompatibilityAdapter.parse(candidate, revision))
    expect(committed.success).toBe(true)
    if (!committed.success) return
    const changed = committed.session
    const undone = undoDocumentTransaction(changed, 'undo-history', (candidate, revision) => flowchartCompatibilityAdapter.parse(candidate, revision))
    expect(undone.success).toBe(true)
    if (!undone.success) return
    expect(undone.session.source).toBe(reopened.content)
    const redone = redoDocumentTransaction(undone.session, 'redo-history', (candidate, revision) => flowchartCompatibilityAdapter.parse(candidate, revision))
    expect(redone.success).toBe(true)
    if (!redone.success) return
    session = redone.session
    expect(session.source).toContain('A[Changed]')
  })

  it('keeps all explicit flowchart route modes document-local across save, reopen, and canonical export', () => {
    const semanticSource = 'flowchart TD\n  A[Start]\n  B[Middle]\n  C[End]\n  A --> B\n  B --> C\n  C --> A\n'
    const savedSource = embedLayoutInMermaid(semanticSource, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
      edges: {
        'edge:e-A-B': { routeMode: 'straight' },
        'edge:e-B-C': { routeMode: 'orthogonal', waypoints: [{ x: 40, y: 64 }, { x: 128, y: 64 }] },
        'edge:e-C-A': { routeMode: 'curved' },
      },
      adapterMetadata: { flowchart: { laneOrder: [] } },
    })

    const reopened = readEmbeddedLayoutV2(savedSource, 'flowchart')
    const projection = flowchartCompatibilityAdapter.parse(reopened.content, 2)

    expect(stripEmbeddedLayout(savedSource).content).toBe(semanticSource)
    expect(reopened.layout?.edges).toEqual({
      'edge:e-A-B': { routeMode: 'straight' },
      'edge:e-B-C': { routeMode: 'orthogonal', waypoints: [{ x: 40, y: 64 }, { x: 128, y: 64 }] },
      'edge:e-C-A': { routeMode: 'curved' },
    })
    expect(projection.model.edges).toHaveLength(3)
  })
})
