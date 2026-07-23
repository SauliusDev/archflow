import type { ConcreteSourceDocument, SourceOperation } from '../../shared/diagram-contracts'

export type CandidateValidation =
  | { valid: true; concrete: ConcreteSourceDocument }
  | { valid: false; error: string }

export type SourceOperationResult =
  | { success: true; document: ConcreteSourceDocument }
  | { success: false; error: string; document: ConcreteSourceDocument }

interface NormalizedOperation {
  operation: SourceOperation
  start: number
  end: number
}

function normalize(operation: SourceOperation): NormalizedOperation {
  if (operation.kind === 'insert') return { operation, start: operation.at, end: operation.at }
  return { operation, start: operation.range.start, end: operation.range.end }
}

export function applySourceOperations(
  document: ConcreteSourceDocument,
  operations: readonly SourceOperation[],
  validateCandidate: (candidate: string, revision: number) => CandidateValidation,
): SourceOperationResult {
  if (operations.length === 0) return { success: true, document }

  const normalized = operations.map(normalize).sort((a, b) => a.start - b.start || a.end - b.end)
  for (let index = 0; index < normalized.length; index++) {
    const current = normalized[index]
    if (current.operation.expectedRevision !== document.revision) {
      return { success: false, error: 'Source operation is stale', document }
    }
    if (!Number.isInteger(current.start) || !Number.isInteger(current.end)
        || current.start < 0 || current.end < current.start || current.end > document.source.length) {
      return { success: false, error: 'Source operation is out of bounds', document }
    }
    if (index > 0 && normalized[index - 1].end > current.start) {
      return { success: false, error: 'Source operations overlap', document }
    }
    if (current.operation.kind !== 'insert') {
      const actual = document.source.slice(current.start, current.end)
      if (actual !== current.operation.expectedText) {
        return { success: false, error: 'Source operation text precondition failed', document }
      }
    }
  }

  let candidate = document.source
  for (const current of [...normalized].reverse()) {
    const operation = current.operation
    if (operation.kind === 'insert') {
      candidate = candidate.slice(0, operation.at) + operation.text + candidate.slice(operation.at)
    } else if (operation.kind === 'replace') {
      candidate = candidate.slice(0, operation.range.start) + operation.text + candidate.slice(operation.range.end)
    } else {
      candidate = candidate.slice(0, operation.range.start) + candidate.slice(operation.range.end)
    }
  }

  if (candidate === document.source) return { success: true, document }
  const validation = validateCandidate(candidate, document.revision + 1)
  if (!validation.valid) return { success: false, error: validation.error, document }
  return { success: true, document: validation.concrete }
}
