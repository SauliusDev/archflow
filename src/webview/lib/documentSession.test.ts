import { describe, expect, it } from 'vitest'
import type { DocumentTransaction, LayoutStateV2, SourceOperation } from '../../shared/diagram-contracts'
import { flowchartCompatibilityAdapter, issueFlowchartOperation } from '@/features/flowchart'
import {
  acceptExternalRevision,
  acknowledgeSave,
  commitDocumentTransaction,
  createDocumentSession,
  redoDocumentTransaction,
  resolveConflict,
  undoDocumentTransaction,
} from './documentSession'

const source = 'flowchart TD\n  A[Alpha]\n'
const layout: LayoutStateV2 = {
  version: 2,
  diagramFamily: 'flowchart',
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: { 'node:A': { x: 10, y: 20 } },
  edges: {},
  constraints: [],
  adapterMetadata: {},
}

const reparse = (candidate: string, revision: number) => flowchartCompatibilityAdapter.parse(candidate, revision)

function session() {
  return createDocumentSession('session-1', 3, reparse(source, 3), layout)
}

function renameTransaction(current: ReturnType<typeof session>, id: string, label: string, nextLayout = current.layout): DocumentTransaction {
  const operation = issueFlowchartOperation(current.projection, { kind: 'rename-node', id: 'A', label })[0]
  if (operation.kind !== 'replace') throw new Error('Expected replace operation')
  const previous = current.source.slice(operation.range.start, operation.range.end)
  const inverse: SourceOperation = {
    kind: 'replace',
    range: { start: operation.range.start, end: operation.range.start + label.length },
    text: previous,
    expectedText: label,
    expectedRevision: current.workingRevision + 1,
  }
  return {
    id,
    family: 'flowchart',
    baseRevision: current.workingRevision,
    resultRevision: current.workingRevision + 1,
    forward: [operation],
    inverse: [inverse],
    layoutBefore: current.layout,
    layoutAfter: nextLayout,
    selectionBefore: current.selection,
    selectionAfter: ['node:A'],
    description: `Rename A to ${label}`,
  }
}

describe('revisioned document session coordinator', () => {
  it('commits source, model, layout, and selection atomically at one revision', () => {
    const current = session()
    const movedLayout = { ...layout, elements: { 'node:A': { x: 50, y: 60 } } }
    const result = commitDocumentTransaction(current, renameTransaction(current, 'tx-1', 'Beta', movedLayout), reparse)
    expect(result.success).toBe(true)
    expect(result.session).toMatchObject({
      source: 'flowchart TD\n  A[Beta]\n',
      workingRevision: 4,
      layout: movedLayout,
      selection: ['node:A'],
      dirty: true,
    })
    expect(result.session.projection.model).toMatchObject({ nodes: [{ id: 'A', data: { label: 'Beta' } }] })
    expect(result.session.history.past).toHaveLength(1)
  })

  it('ignores duplicate transactions and rejects stale transactions without partial state', () => {
    const current = session()
    const first = commitDocumentTransaction(current, renameTransaction(current, 'tx-1', 'Beta'), reparse)
    const duplicate = commitDocumentTransaction(first.session, renameTransaction(first.session, 'tx-1', 'Wrong'), reparse)
    expect(duplicate).toMatchObject({ success: false, error: 'Transaction already applied' })
    expect(duplicate.session).toBe(first.session)

    const staleTx = { ...renameTransaction(first.session, 'tx-2', 'Wrong'), baseRevision: 3 }
    const stale = commitDocumentTransaction(first.session, staleTx, reparse)
    expect(stale).toMatchObject({ success: false, error: 'Transaction is stale' })
    expect(stale.session).toBe(first.session)
  })

  it('undoes and redoes atomic projections and clears redo after a new edit', () => {
    const current = session()
    const renamed = commitDocumentTransaction(current, renameTransaction(current, 'tx-1', 'Beta'), reparse).session
    const undone = undoDocumentTransaction(renamed, 'undo-1', reparse)
    expect(undone.session).toMatchObject({ source, workingRevision: 5 })
    expect(undone.session.history.future).toHaveLength(1)

    const redone = redoDocumentTransaction(undone.session, 'redo-1', reparse)
    expect(redone.session.source).toContain('Beta')
    expect(redone.session.workingRevision).toBe(6)

    const undoneAgain = undoDocumentTransaction(redone.session, 'undo-2', reparse).session
    const replacement = commitDocumentTransaction(undoneAgain, renameTransaction(undoneAgain, 'tx-2', 'Gamma'), reparse).session
    expect(replacement.history.future).toEqual([])
  })

  it('keeps a newer local revision dirty after a delayed idempotent save acknowledgement', () => {
    const current = session()
    const revision4 = commitDocumentTransaction(current, renameTransaction(current, 'tx-1', 'Beta'), reparse).session
    const revision5 = commitDocumentTransaction(revision4, renameTransaction(revision4, 'tx-2', 'Gamma'), reparse).session
    const acknowledged = acknowledgeSave(revision5, {
      eventId: 'ack-1', sessionId: 'session-1', transactionId: 'tx-1', workingRevision: 4, hostRevision: 4,
    })
    expect(acknowledged).toMatchObject({ baseHostRevision: 4, workingRevision: 5, dirty: true })
    expect(acknowledgeSave(acknowledged, {
      eventId: 'ack-1', sessionId: 'session-1', transactionId: 'tx-1', workingRevision: 4, hostRevision: 4,
    })).toBe(acknowledged)
  })

  it('adopts clean external source but preserves both versions when dirty', () => {
    const external = 'flowchart TD\n  A[External]\n'
    const clean = acceptExternalRevision(session(), 4, reparse(external, 4), layout, 'external-1')
    expect(clean).toMatchObject({ source: external, baseHostRevision: 4, dirty: false, history: { past: [], future: [] } })

    const current = session()
    const dirty = commitDocumentTransaction(current, renameTransaction(current, 'tx-1', 'Local'), reparse).session
    const conflicted = acceptExternalRevision(dirty, 4, reparse(external, 4), layout, 'external-2')
    expect(conflicted.source).toContain('Local')
    expect(conflicted.conflict).toMatchObject({ content: external, hostRevision: 4 })
    expect(acceptExternalRevision(conflicted, 4, reparse(external, 4), layout, 'external-2')).toBe(conflicted)
  })

  it('rejects stale undo after adopting a new external base', () => {
    const initial = session()
    const renamed = commitDocumentTransaction(initial, renameTransaction(initial, 'tx-1', 'Beta'), reparse).session
    const saved = acknowledgeSave(renamed, {
      eventId: 'ack-1', sessionId: 'session-1', transactionId: 'tx-1', workingRevision: 4, hostRevision: 4,
    })
    const adopted = acceptExternalRevision(saved, 5, reparse('flowchart TD\n  A[External]\n', 5), layout, 'external-1')
    const staleUndo = undoDocumentTransaction(adopted, 'undo-stale', reparse)
    expect(staleUndo).toMatchObject({ success: false, error: 'Nothing to undo' })
    expect(staleUndo.session).toBe(adopted)
  })

  it('resolves conflict only through explicit adopt-external or validated keep-local paths', () => {
    const current = session()
    const dirty = commitDocumentTransaction(current, renameTransaction(current, 'tx-1', 'Local'), reparse).session
    const conflicted = acceptExternalRevision(dirty, 4, reparse('flowchart TD\n  A[External]\n', 4), layout, 'external-1')

    const adopted = resolveConflict(conflicted, { kind: 'adopt-external', transactionId: 'resolve-1' }, reparse)
    expect(adopted.success).toBe(true)
    expect(adopted.session).toMatchObject({ baseHostRevision: 4, dirty: false, conflict: null })
    expect(adopted.session.source).toContain('External')

    const kept = resolveConflict(conflicted, {
      kind: 'keep-local', transactionId: 'resolve-2', validate: source => source.includes('Local'),
    }, reparse)
    expect(kept.success).toBe(true)
    expect(kept.session).toMatchObject({ baseHostRevision: 4, dirty: true, conflict: null })
    expect(kept.session.source).toContain('Local')
  })

  it('bounds transaction history to 100 entries', () => {
    let current = session()
    for (let index = 0; index < 105; index += 1) {
      const label = index % 2 === 0 ? 'Beta' : 'Alpha'
      current = commitDocumentTransaction(current, renameTransaction(current, `tx-${index}`, label), reparse).session
    }
    expect(current.history.past).toHaveLength(100)
  })
})
