import { describe, expect, test } from 'vitest'
import {
  isDiagramFamily,
  flowchartNodeConnections,
  validateAdapterResult,
  validateLayoutStateV2,
  type AdapterResult,
  type LayoutStateV2,
} from '.'

function validAdapterResult(): AdapterResult {
  return {
    family: 'flowchart',
    model: {},
    concrete: {
      source: 'A --> B',
      revision: 1,
      handles: [
        { handle: 'A', kind: 'node', range: { start: 0, end: 1 }, fingerprint: 'a' },
        { handle: 'B', kind: 'node', range: { start: 6, end: 7 }, fingerprint: 'b' },
      ],
    },
    canvas: {
      elements: [
        { id: 'A', kind: 'element', label: 'A', focusable: true, selected: false, disabled: false, operations: [] },
        { id: 'B', kind: 'element', label: 'B', focusable: true, selected: false, disabled: false, operations: [] },
      ],
      connectors: [{ id: 'edge', source: 'A', target: 'B' }],
    },
    diagnostics: [],
  }
}

function validLayout(): LayoutStateV2 {
  return {
    version: 2,
    diagramFamily: 'flowchart',
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: { A: { x: 0, y: 0 } },
    edges: {},
    constraints: [],
  }
}

describe('diagram contracts', () => {
  test('recognizes only supported diagram families', () => {
    expect(isDiagramFamily('flowchart')).toBe(true)
    expect(isDiagramFamily('unsupported')).toBe(false)
  })

  test('rejects duplicate concrete handles', () => {
    const result = validAdapterResult()
    result.concrete.handles[1].handle = 'A'

    expect(validateAdapterResult(result)).toEqual({ valid: false, error: 'Duplicate semantic handle: A' })
  })

  test('rejects connectors whose endpoints are not canvas elements', () => {
    const result = validAdapterResult()
    result.canvas.connectors[0].target = 'missing'

    expect(validateAdapterResult(result)).toEqual({ valid: false, error: 'Invalid Canvas connector: edge' })
  })

  test('rejects viewport zoom outside its supported range', () => {
    expect(validateLayoutStateV2({ ...validLayout(), viewport: { x: 0, y: 0, zoom: 17 } }))
      .toEqual({ valid: false, error: 'Invalid viewport' })
  })

  test('rejects edges with too many waypoints', () => {
    expect(validateLayoutStateV2({
      ...validLayout(),
      edges: {
        edge: {
          routeMode: 'manual',
          waypoints: Array.from({ length: 257 }, () => ({ x: 0, y: 0 })),
        },
      },
    })).toEqual({ valid: false, error: 'Too many waypoints on edge' })
  })

  test('accepts legacy automatic route metadata for backward compatibility', () => {
    const layout = { ...validLayout(), edges: { edge: { routeMode: 'automatic' as const } } }

    expect(validateLayoutStateV2(layout)).toEqual({ valid: true, value: layout })
  })

  test('accepts cardinal edge attachment sides', () => {
    const layout = {
      ...validLayout(),
      edges: { edge: { routeMode: 'straight' as const, sourceSide: 'left' as const, targetSide: 'bottom' as const } },
    }

    expect(validateLayoutStateV2(layout)).toEqual({ valid: true, value: layout })
  })

  test('rejects non-cardinal edge attachment sides', () => {
    expect(validateLayoutStateV2({
      ...validLayout(),
      edges: { edge: { routeMode: 'straight', sourceSide: 'diagonal' } },
    })).toEqual({ valid: false, error: 'Invalid edge attachment side' })
  })

  test('validates flowchart node connection metadata when present', () => {
    expect(validateLayoutStateV2({
      ...validLayout(),
      adapterMetadata: { flowchart: { nodeConnections: { mode: 'side', autoReassign: 'yes' } } },
    })).toEqual({ valid: false, error: 'Invalid flowchart node connections' })
  })

  test('accepts and preserves valid flowchart node connection metadata', () => {
    for (const nodeConnections of [
      { mode: 'free' as const, autoReassign: false },
      { mode: 'side' as const, autoReassign: true },
    ]) {
      const layout = { ...validLayout(), adapterMetadata: { flowchart: { nodeConnections } } }

      expect(validateLayoutStateV2(layout)).toEqual({ valid: true, value: layout })
    }
  })

  test('defaults legacy flowchart node connection metadata to free endpoints', () => {
    expect(flowchartNodeConnections(validLayout())).toEqual({ mode: 'free', autoReassign: false })
  })

  test('accepts serializable adapter metadata', () => {
    const layout = { ...validLayout(), adapterMetadata: { adapter: { version: 1 }, labels: ['A', 'B'] } }

    expect(validateLayoutStateV2(layout)).toEqual({ valid: true, value: layout })
  })
})
