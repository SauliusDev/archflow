import { describe, expect, it } from 'vitest'
import type {
  AdapterDescriptor,
  CanvasDescriptor,
  ConcreteSourceDocument,
  DocumentTransaction,
  LayoutStateV2,
  RevisionedEnvelope,
} from '../shared/diagram-contracts'
import { validateAdapterResult, validateLayoutStateV2 } from '../shared/diagram-contracts'

const canvas: CanvasDescriptor = {
  elements: [{ id: 'node:A', kind: 'element', label: 'A', focusable: true, selected: false, disabled: false, operations: ['rename'] }],
  connectors: [],
}

const concrete: ConcreteSourceDocument = {
  source: 'flowchart TD\n  A[Alpha]\n',
  revision: 1,
  handles: [{ handle: 'node:A', kind: 'node', range: { start: 15, end: 20 }, fingerprint: 'Alpha' }],
}

const adapter: AdapterDescriptor = {
  id: 'flowchart-compat',
  family: 'flowchart',
  capabilities: { visualEdit: true, preview: true, losslessOperations: true },
  parse: () => ({ family: 'flowchart', model: {}, concrete, canvas, diagnostics: [] }),
  supportsOperation: () => ({ supported: true }),
  validateSource: () => ({ valid: true }),
  layoutStrategyId: 'dagre',
}

const layout: LayoutStateV2 = {
  version: 2,
  diagramFamily: 'flowchart',
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: { 'node:A': { x: 10, y: 20, width: 100, height: 40 } },
  edges: {},
  constraints: [],
  adapterMetadata: {},
}

function deeplyNestedMetadata(depth: number): Record<string, unknown> {
  let metadata: unknown = null
  for (let index = 0; index < depth; index++) metadata = { next: metadata }
  return metadata as Record<string, unknown>
}

describe('multi-diagram foundation contracts', () => {
  it('accepts a family-neutral adapter result with stable non-overlapping handles', () => {
    expect(validateAdapterResult(adapter.parse(concrete.source, 1))).toEqual({ valid: true })
  })

  it('rejects duplicate handles and overlapping ranges atomically', () => {
    const invalid = adapter.parse(concrete.source, 1)
    invalid.concrete.handles.push(
      { handle: 'node:A', kind: 'node', range: { start: 17, end: 22 }, fingerprint: 'pha]' },
    )
    expect(validateAdapterResult(invalid)).toMatchObject({ valid: false })
  })

  it('rejects invalid Canvas ownership and duplicate connector identities', () => {
    const invalidParent = adapter.parse(concrete.source, 1)
    invalidParent.canvas.elements[0].parentId = 'missing'
    expect(validateAdapterResult(invalidParent)).toMatchObject({ valid: false })

    const duplicateConnectors = adapter.parse(concrete.source, 1)
    duplicateConnectors.canvas.connectors = [
      { id: 'edge:1', source: 'node:A', target: 'node:A' },
      { id: 'edge:1', source: 'node:A', target: 'node:A' },
    ]
    expect(validateAdapterResult(duplicateConnectors)).toMatchObject({ valid: false })
  })

  it('validates bounded LayoutStateV2 data', () => {
    expect(validateLayoutStateV2(layout)).toEqual({ valid: true, value: layout })
    expect(validateLayoutStateV2({ ...layout, viewport: { ...layout.viewport, zoom: 17 } })).toMatchObject({ valid: false })
    expect(validateLayoutStateV2({ ...layout, elements: { A: { x: Number.NaN, y: 0 } } })).toMatchObject({ valid: false })
    expect(validateLayoutStateV2({ ...layout, diagramFamily: 'not-a-family' })).toMatchObject({ valid: false })
    expect(validateLayoutStateV2({
      ...layout,
      constraints: [{ id: '', kind: 'align', handles: [], axis: 'z' }],
    })).toMatchObject({ valid: false })
  })

  it('rejects deeply nested adapter metadata without throwing', () => {
    let validation: ReturnType<typeof validateLayoutStateV2> | undefined

    expect(() => {
      validation = validateLayoutStateV2({ ...layout, adapterMetadata: deeplyNestedMetadata(2_000) })
    }).not.toThrow()
    expect(validation).toEqual({ valid: false, error: 'Adapter metadata is too deep' })
  })

  it('keeps revisioned messages and transaction history family-neutral at compile time', () => {
    const envelope: RevisionedEnvelope<'SAVE', { source: string }> = {
      type: 'SAVE', sessionId: 'panel-1', baseRevision: 1, eventId: 'event-1', payload: { source: concrete.source },
    }
    const transaction: DocumentTransaction = {
      id: 'tx-1', family: 'flowchart', baseRevision: 1, resultRevision: 2,
      forward: [], inverse: [], layoutBefore: null, layoutAfter: layout,
      selectionBefore: [], selectionAfter: ['node:A'], description: 'Rename node',
    }
    expect(envelope.sessionId).toBe('panel-1')
    expect(transaction.description).toBe('Rename node')
  })
})
