import { describe, expect, it } from 'vitest'
import type { AdapterDescriptor, AdapterResult, DiagramFamily } from '../shared/diagram-contracts'
import { AdapterRegistry } from '../shared/adapterRegistry'

function result(family: DiagramFamily = 'flowchart'): AdapterResult {
  return {
    family,
    model: {},
    concrete: { source: 'flowchart TD\n A[Alpha]\n', revision: 1, handles: [{ handle: 'node:A', kind: 'node', range: { start: 16, end: 21 }, fingerprint: 'Alpha' }] },
    canvas: { elements: [{ id: 'node:A', kind: 'element', label: 'Alpha', focusable: true, selected: false, disabled: false, operations: [] }], connectors: [] },
    diagnostics: [],
  }
}

function adapter(overrides: Partial<AdapterDescriptor> = {}): AdapterDescriptor {
  return {
    id: 'flowchart',
    family: 'flowchart',
    capabilities: { visualEdit: true, preview: true, losslessOperations: true },
    parse: () => result(),
    supportsOperation: () => ({ supported: true }),
    validateSource: () => ({ valid: true }),
    ...overrides,
  }
}

describe('AdapterRegistry', () => {
  it('selects and validates a registered visual adapter', () => {
    const registry = new AdapterRegistry([adapter()])
    expect(registry.initialize('flowchart', 'flowchart TD\n A[Alpha]\n', 1)).toMatchObject({ status: 'ready', adapter: { id: 'flowchart' } })
  })

  it('reports absent visual support without changing the family', () => {
    const registry = new AdapterRegistry([adapter({ capabilities: { visualEdit: false, preview: true, losslessOperations: false } })])
    expect(registry.initialize('flowchart', 'flowchart TD', 1)).toEqual({ status: 'unavailable', family: 'flowchart', reason: 'Visual editing is unavailable for flowchart' })
    expect(registry.initialize('sequence', 'sequenceDiagram', 1)).toEqual({ status: 'unavailable', family: 'sequence', reason: 'No adapter is registered for sequence' })
  })

  it('rejects duplicate family registration', () => {
    expect(() => new AdapterRegistry([adapter(), adapter({ id: 'other-flowchart' })])).toThrow(/duplicate.*flowchart/i)
  })

  it('rejects invalid handles and ranges without leaking the result', () => {
    const invalid = adapter({ parse: () => ({ ...result(), concrete: { ...result().concrete, handles: [{ handle: 'bad', kind: 'node', range: { start: 0, end: 999 }, fingerprint: '' }] } }) })
    expect(new AdapterRegistry([invalid]).initialize('flowchart', 'flowchart TD', 1)).toMatchObject({ status: 'failed', family: 'flowchart' })
  })

  it('isolates adapter exceptions', () => {
    const failing = adapter({ parse: () => { throw new Error('parser exploded') } })
    expect(new AdapterRegistry([failing]).initialize('flowchart', 'flowchart TD', 1)).toEqual({ status: 'failed', family: 'flowchart', reason: 'parser exploded' })
  })
})
