import { describe, expect, it, vi } from 'vitest'
import type { ConcreteSourceDocument, SourceOperation } from '../../shared/diagram-contracts'
import { applySourceOperations } from './sourceOperations'

const source = '---\r\ntitle: Demo\r\n---\r\n%% directive stays\r\nflowchart TD\r\n  A[Alpha]\r\n  B[Beta]\r\n  A --> B\r\n%% unknown stays\r\n'

function document(text = source, revision = 3): ConcreteSourceDocument {
  return { source: text, revision, handles: [] }
}

function valid(candidate: string, revision: number) {
  return { valid: true as const, concrete: document(candidate, revision) }
}

describe('applySourceOperations', () => {
  it('applies insert, replace, and delete atomically in reverse range order', () => {
    const alphaStart = source.indexOf('Alpha')
    const betaLineStart = source.indexOf('  B[Beta]')
    const edgeStart = source.indexOf('  A --> B')
    const operations: SourceOperation[] = [
      { kind: 'replace', range: { start: alphaStart, end: alphaStart + 5 }, text: 'Renamed', expectedText: 'Alpha', expectedRevision: 3 },
      { kind: 'delete', range: { start: betaLineStart, end: edgeStart }, expectedText: '  B[Beta]\r\n', expectedRevision: 3 },
      { kind: 'insert', at: edgeStart, text: '  C[Gamma]\r\n', expectedRevision: 3 },
    ]
    const result = applySourceOperations(document(), operations, valid)
    expect(result).toMatchObject({ success: true, document: { revision: 4 } })
    if (result.success) {
      expect(result.document.source).toBe(source.replace('Alpha', 'Renamed').replace('  B[Beta]\r\n', '').replace('  A --> B', '  C[Gamma]\r\n  A --> B'))
      expect(result.document.source).toContain('%% directive stays\r\n')
      expect(result.document.source.endsWith('\r\n')).toBe(true)
    }
  })

  it('returns the same document identity for no operations', () => {
    const current = document()
    const validate = vi.fn(valid)
    const result = applySourceOperations(current, [], validate)
    expect(result).toEqual({ success: true, document: current })
    if (result.success) expect(result.document).toBe(current)
    expect(validate).not.toHaveBeenCalled()
  })

  it.each([
    ['LF with BOM and final newline', '\uFEFFflowchart TD\n  A[Alpha]\n'],
    ['LF without final newline', 'flowchart TD\n  A[Alpha]'],
  ])('preserves untouched bytes for %s', (_name, original) => {
    const start = original.indexOf('Alpha')
    const current = document(original, 7)
    const result = applySourceOperations(current, [{
      kind: 'replace',
      range: { start, end: start + 5 },
      text: 'Beta',
      expectedText: 'Alpha',
      expectedRevision: 7,
    }], (candidate, revision) => ({ valid: true, concrete: document(candidate, revision) }))
    expect(result).toMatchObject({ success: true })
    if (result.success) expect(result.document.source).toBe(original.replace('Alpha', 'Beta'))
  })

  it.each([
    ['stale revision', [{ kind: 'insert', at: 0, text: 'x', expectedRevision: 2 }]],
    ['out of bounds', [{ kind: 'insert', at: source.length + 1, text: 'x', expectedRevision: 3 }]],
    ['stale text', [{ kind: 'replace', range: { start: 0, end: 3 }, text: 'x', expectedText: 'bad', expectedRevision: 3 }]],
    ['overlap', [
      { kind: 'replace', range: { start: 0, end: 5 }, text: 'x', expectedText: source.slice(0, 5), expectedRevision: 3 },
      { kind: 'delete', range: { start: 4, end: 8 }, expectedText: source.slice(4, 8), expectedRevision: 3 },
    ]],
  ] as Array<[string, SourceOperation[]]>)('rejects %s without partial changes', (_name, operations) => {
    const current = document()
    expect(applySourceOperations(current, operations, valid)).toMatchObject({ success: false, document: current })
  })

  it('rolls back when post-operation family or adapter validation fails', () => {
    const current = document()
    const result = applySourceOperations(current, [{ kind: 'replace', range: { start: 0, end: 3 }, text: 'bad', expectedText: '---', expectedRevision: 3 }], () => ({ valid: false, error: 'family changed' }))
    expect(result).toEqual({ success: false, error: 'family changed', document: current })
  })
})
