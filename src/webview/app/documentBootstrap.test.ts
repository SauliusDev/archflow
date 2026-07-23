import { describe, expect, it, vi } from 'vitest'
import type { LoadPayload, MessageRevision } from '../../shared/protocol'
import { bootstrapDocument } from './documentBootstrap'
import { embedLayoutInMermaid, stripEmbeddedLayout } from '../lib/embeddedLayout'

vi.mock('@/features/flowchart', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/flowchart')>(),
  applyDagreLayout: vi.fn((nodes: Array<{ position: { x: number; y: number } }>) =>
    nodes.map((node, index) => ({ ...node, position: { x: 100, y: 200 + index * 150 } })),
  ),
}))

function bootstrap(payload: LoadPayload, envelope: MessageRevision = {}) {
  return bootstrapDocument({ payload, envelope }, { createId: () => 'generated-session' })
}

function layoutBlock(layout: object): string {
  return [
    '%% FLOWFORGE LAYOUT START',
    ...JSON.stringify(layout, null, 2).split('\n').map(line => `%% ${line}`),
    '%% FLOWFORGE LAYOUT END',
  ].join('\n')
}

describe('bootstrapDocument', () => {
  it('initializes an empty document as an editable flowchart with a generated session', () => {
    const result = bootstrap({ content: '', family: 'empty' })

    expect(result).toMatchObject({
      ok: true,
      value: {
        family: 'flowchart',
        session: { sessionId: 'generated-session', baseHostRevision: 1, workingRevision: 1 },
        nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, shouldFitView: true,
      },
    })
  })

  it('lays out a flowchart without embedded layout and requests fit view', () => {
    const result = bootstrap({ content: 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B', family: 'flowchart' })

    expect(result).toMatchObject({ ok: true, value: { shouldFitView: true, nodes: [
      { id: 'A', position: { x: 100, y: 200 } },
      { id: 'B', position: { x: 100, y: 350 } },
    ] } })
  })

  it('restores embedded flowchart geometry and viewport', () => {
    const result = bootstrap({ content: [
      'flowchart TD', '  A[Start]', '  B[End]', '  A --> B', '', layoutBlock({
        version: 2, diagramFamily: 'flowchart', viewport: { x: 9, y: 10, zoom: 1.2 },
        elements: { 'node:A': { x: 40, y: 50 } }, edges: {}, constraints: [], adapterMetadata: {},
      }),
    ].join('\n'), family: 'flowchart' })

    expect(result).toMatchObject({ ok: true, value: {
      shouldFitView: false, viewport: { x: 9, y: 10, zoom: 1.2 },
      nodes: [{ id: 'A', position: { x: 40, y: 50 } }, { id: 'B', position: { x: 40, y: 200 } }],
    } })
  })

  it('restores Straight, Orthogonal, and Curved routes with ordered waypoints without changing Mermaid semantics', () => {
    const semanticSource = 'flowchart TD\n  A[Start]\n  B[Middle]\n  C[End]\n  A --> B\n  B --> C\n  C --> A\n'
    const savedSource = embedLayoutInMermaid(semanticSource, {
      version: 2, diagramFamily: 'flowchart', viewport: { x: 0, y: 0, zoom: 1 }, elements: {}, constraints: [],
      edges: {
        'edge:e-A-B': { routeMode: 'straight' },
        'edge:e-B-C': { routeMode: 'orthogonal', waypoints: [{ x: 32, y: 48 }, { x: 96, y: 48 }] },
        'edge:e-C-A': { routeMode: 'curved' },
      },
    })

    expect(stripEmbeddedLayout(savedSource).content).toBe(semanticSource)
    const result = bootstrap({ content: savedSource, family: 'flowchart' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [straight, orthogonal, curved] = ['e-A-B', 'e-B-C', 'e-C-A'].map(id => result.value.edges.find(edge => edge.id === id))

    expect(result.value.edges).toHaveLength(3)
    expect(result.value.edges.map(edge => edge.id).sort()).toEqual(['e-A-B', 'e-B-C', 'e-C-A'])
    expect(straight).toMatchObject({ data: { routeMode: 'straight' } })
    expect(straight?.data.waypoints).toBeUndefined()
    expect(orthogonal).toMatchObject({ data: { routeMode: 'orthogonal', waypoints: [{ x: 32, y: 48 }, { x: 96, y: 48 }] } })
    expect(curved).toMatchObject({ data: { routeMode: 'curved' } })
    expect(curved?.data.waypoints).toBeUndefined()
  })

  it('keeps saved nodes while placing new flowchart nodes into their coordinate space', () => {
    const result = bootstrap({ content: [
      'flowchart TD', '  A[Start]', '  B[End]', '  A --> B', '', layoutBlock({
        version: 1, nodes: { A: { x: 50, y: 60 } }, viewport: { x: 0, y: 0, zoom: 1 },
      }),
    ].join('\n') })

    expect(result).toMatchObject({ ok: true, value: { nodes: [
      { id: 'A', position: { x: 50, y: 60 } },
      { id: 'B', position: { x: 50, y: 210 } },
    ] } })
  })

  it('restores class diagram layout using class geometry', () => {
    const result = bootstrap({ content: [
      'classDiagram', 'class Account', '', layoutBlock({
        version: 2, diagramFamily: 'class', viewport: { x: 3, y: 4, zoom: 1 },
        elements: { 'class:Account': { x: 70, y: 80 } }, edges: {}, constraints: [], adapterMetadata: {},
      }),
    ].join('\n'), family: 'class' })

    expect(result).toMatchObject({ ok: true, value: {
      family: 'class', shouldFitView: false, viewport: { x: 3, y: 4, zoom: 1 },
      session: { layout: { elements: { 'class:Account': expect.objectContaining({ x: 70, y: 80, width: expect.any(Number), height: expect.any(Number) }) } } },
    } })
  })

  it('creates a byte-preserving fallback session for an unsupported family', () => {
    const source = 'sequenceDiagram\n  Alice->>Bob: Hello\n'
    const result = bootstrap({ content: source, family: 'sequence' }, { sessionId: 'sequence-session', baseRevision: 4 })

    expect(result).toMatchObject({ ok: true, value: {
      family: 'sequence', nodes: [], edges: [],
      session: { sessionId: 'sequence-session', baseHostRevision: 4, source, projection: { model: { editable: false } } },
    } })
  })

  it('ignores invalid embedded layout while retaining a diagnostic', () => {
    const result = bootstrap({ content: [
      'flowchart TD', '  A[Start]', '', '%% FLOWFORGE LAYOUT START', '%% not json', '%% FLOWFORGE LAYOUT END',
    ].join('\n') })

    expect(result).toMatchObject({ ok: true, value: {
      diagnostics: [expect.objectContaining({ code: 'embedded-layout', severity: 'warning' })],
      shouldFitView: true,
    } })
  })

  it('uses explicit session and revision values from the protocol envelope and payload', () => {
    const result = bootstrap({ content: 'flowchart TD\n  A[Start]', sessionId: 'payload-session', hostRevision: 5, workingRevision: 8 }, {
      sessionId: 'envelope-session', baseRevision: 4,
    })

    expect(result).toMatchObject({ ok: true, value: {
      session: { sessionId: 'payload-session', baseHostRevision: 5, workingRevision: 8 },
    } })
  })
})
