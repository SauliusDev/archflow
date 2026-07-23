import type {
  AdapterResult,
  DiagramFamily,
  DocumentTransaction,
  LayoutStateV2,
  SemanticHandle,
  SourceOperation,
  TransactionHistory,
} from '../../shared/diagram-contracts'
import { applySourceOperations } from './sourceOperations'

function normalizeLayout(layout: LayoutStateV2): LayoutStateV2 {
  return { ...layout, inspectorVisible: layout.inspectorVisible !== false }
}

export interface ExternalConflict {
  eventId: string
  content: string
  hostRevision: number
  projection: AdapterResult
  layout: LayoutStateV2
}

export interface DocumentSession {
  sessionId: string
  family: DiagramFamily
  baseHostRevision: number
  workingRevision: number
  source: string
  baseSource: string
  projection: AdapterResult
  layout: LayoutStateV2
  baseLayout: LayoutStateV2
  selection: SemanticHandle[]
  dirty: boolean
  conflict: ExternalConflict | null
  history: TransactionHistory
  processedTransactionIds: readonly string[]
  processedEventIds: readonly string[]
}

export type SessionOperationResult =
  | { success: true; session: DocumentSession }
  | { success: false; error: string; session: DocumentSession }

type Reparse = (source: string, revision: number) => AdapterResult

function sameLayout(left: LayoutStateV2, right: LayoutStateV2): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function rebaseOperations(operations: readonly SourceOperation[], revision: number): SourceOperation[] {
  return operations.map(operation => ({ ...operation, expectedRevision: revision }))
}

function apply(
  session: DocumentSession,
  operations: readonly SourceOperation[],
  layout: LayoutStateV2 | null,
  selection: readonly SemanticHandle[],
  reparse: Reparse,
): SessionOperationResult {
  const result = applySourceOperations(
    session.projection.concrete,
    rebaseOperations(operations, session.workingRevision),
    (candidate, revision) => {
      try {
        const projection = reparse(candidate, revision)
        if (projection.family !== session.family) return { valid: false, error: 'Diagram family changed' }
        return { valid: true, concrete: projection.concrete }
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )
  if (!result.success) return { success: false, error: result.error, session }

  let projection: AdapterResult
  try {
    projection = reparse(result.document.source, result.document.revision)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), session }
  }
  const nextLayout = layout ?? session.layout
  return {
    success: true,
    session: {
      ...session,
      source: result.document.source,
      workingRevision: result.document.revision,
      projection,
      layout: nextLayout,
      selection: [...selection],
      dirty: result.document.source !== session.baseSource || !sameLayout(nextLayout, session.baseLayout),
      conflict: null,
    },
  }
}

export function createDocumentSession(
  sessionId: string,
  hostRevision: number,
  projection: AdapterResult,
  layout: LayoutStateV2,
): DocumentSession {
  const normalizedLayout = normalizeLayout(layout)
  return {
    sessionId,
    family: projection.family,
    baseHostRevision: hostRevision,
    workingRevision: projection.concrete.revision,
    source: projection.concrete.source,
    baseSource: projection.concrete.source,
    projection,
    layout: normalizedLayout,
    baseLayout: normalizedLayout,
    selection: [],
    dirty: false,
    conflict: null,
    history: { past: [], future: [] },
    processedTransactionIds: [],
    processedEventIds: [],
  }
}

export function commitDocumentTransaction(
  session: DocumentSession,
  transaction: DocumentTransaction,
  reparse: Reparse,
): SessionOperationResult {
  if (session.conflict) return { success: false, error: 'Document has an unresolved external change', session }
  if (session.processedTransactionIds.includes(transaction.id)) {
    return { success: false, error: 'Transaction already applied', session }
  }
  if (transaction.baseRevision !== session.workingRevision || transaction.family !== session.family) {
    return { success: false, error: 'Transaction is stale', session }
  }
  const applied = apply(session, transaction.forward, transaction.layoutAfter, transaction.selectionAfter, reparse)
  if (!applied.success) return applied
  return {
    success: true,
    session: {
      ...applied.session,
      history: {
        past: [...session.history.past, transaction].slice(-100),
        future: [],
      },
      processedTransactionIds: [...session.processedTransactionIds, transaction.id].slice(-200),
    },
  }
}

export function commitSourceOperationTransaction(
  session: DocumentSession,
  input: {
    id: string
    description: string
    operations: readonly SourceOperation[]
    layout?: LayoutStateV2
    selection?: readonly SemanticHandle[]
  },
  reparse: Reparse,
): SessionOperationResult {
  const candidate = applySourceOperations(
    session.projection.concrete,
    input.operations,
    (source, revision) => {
      try {
        const projection = reparse(source, revision)
        return projection.family === session.family
          ? { valid: true, concrete: projection.concrete }
          : { valid: false, error: 'Diagram family changed' }
      } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : String(error) }
      }
    },
  )
  if (!candidate.success) return { success: false, error: candidate.error, session }
  const transaction: DocumentTransaction = {
    id: input.id,
    family: session.family,
    baseRevision: session.workingRevision,
    resultRevision: session.workingRevision + 1,
    forward: [...input.operations],
    inverse: [{
      kind: 'replace',
      range: { start: 0, end: candidate.document.source.length },
      text: session.source,
      expectedText: candidate.document.source,
      expectedRevision: session.workingRevision + 1,
    }],
    layoutBefore: session.layout,
    layoutAfter: input.layout ?? session.layout,
    selectionBefore: [...session.selection],
    selectionAfter: [...(input.selection ?? session.selection)],
    description: input.description,
  }
  return commitDocumentTransaction(session, transaction, reparse)
}

export function undoDocumentTransaction(session: DocumentSession, transactionId: string, reparse: Reparse): SessionOperationResult {
  if (session.processedTransactionIds.includes(transactionId)) return { success: false, error: 'Transaction already applied', session }
  const transaction = session.history.past.at(-1)
  if (!transaction) return { success: false, error: 'Nothing to undo', session }
  const applied = apply(session, transaction.inverse, transaction.layoutBefore, transaction.selectionBefore, reparse)
  if (!applied.success) return applied
  return {
    success: true,
    session: {
      ...applied.session,
      history: {
        past: session.history.past.slice(0, -1),
        future: [...session.history.future, transaction],
      },
      processedTransactionIds: [...session.processedTransactionIds, transactionId].slice(-200),
    },
  }
}

export function redoDocumentTransaction(session: DocumentSession, transactionId: string, reparse: Reparse): SessionOperationResult {
  if (session.processedTransactionIds.includes(transactionId)) return { success: false, error: 'Transaction already applied', session }
  const transaction = session.history.future.at(-1)
  if (!transaction) return { success: false, error: 'Nothing to redo', session }
  const applied = apply(session, transaction.forward, transaction.layoutAfter, transaction.selectionAfter, reparse)
  if (!applied.success) return applied
  return {
    success: true,
    session: {
      ...applied.session,
      history: {
        past: [...session.history.past, transaction].slice(-100),
        future: session.history.future.slice(0, -1),
      },
      processedTransactionIds: [...session.processedTransactionIds, transactionId].slice(-200),
    },
  }
}

export function acceptExternalRevision(
  session: DocumentSession,
  hostRevision: number,
  projection: AdapterResult,
  layout: LayoutStateV2,
  eventId: string,
): DocumentSession {
  if (session.processedEventIds.includes(eventId)) return session
  if (hostRevision <= session.baseHostRevision) return session
  if (session.dirty) {
    return {
      ...session,
      conflict: { eventId, content: projection.concrete.source, hostRevision, projection, layout },
      processedEventIds: [...session.processedEventIds, eventId].slice(-200),
    }
  }
  return {
    ...createDocumentSession(session.sessionId, hostRevision, projection, layout),
    processedEventIds: [...session.processedEventIds, eventId].slice(-200),
  }
}

export interface SaveAcknowledgement {
  eventId: string
  sessionId: string
  transactionId: string
  workingRevision: number
  hostRevision: number
}

export function acknowledgeSave(session: DocumentSession, acknowledgement: SaveAcknowledgement): DocumentSession {
  if (acknowledgement.sessionId !== session.sessionId
      || session.processedEventIds.includes(acknowledgement.eventId)) return session
  const saved = markDocumentSessionSaved(session, acknowledgement.hostRevision, acknowledgement.workingRevision)
  return {
    ...saved,
    processedEventIds: [...session.processedEventIds, acknowledgement.eventId].slice(-200),
  }
}

export type ConflictResolution =
  | { kind: 'adopt-external'; transactionId: string }
  | { kind: 'keep-local'; transactionId: string; validate(source: string): boolean }

export function resolveConflict(
  session: DocumentSession,
  resolution: ConflictResolution,
  reparse: Reparse,
): SessionOperationResult {
  const conflict = session.conflict
  if (!conflict) return { success: false, error: 'No conflict to resolve', session }
  if (session.processedTransactionIds.includes(resolution.transactionId)) {
    return { success: false, error: 'Transaction already applied', session }
  }
  if (resolution.kind === 'adopt-external') {
    return {
      success: true,
      session: {
        ...createDocumentSession(session.sessionId, conflict.hostRevision, conflict.projection, conflict.layout),
        processedEventIds: session.processedEventIds,
        processedTransactionIds: [...session.processedTransactionIds, resolution.transactionId].slice(-200),
      },
    }
  }
  if (!resolution.validate(session.source)) return { success: false, error: 'Local source failed rebase validation', session }
  try {
    const workingRevision = session.workingRevision + 1
    const projection = reparse(session.source, workingRevision)
    if (projection.family !== session.family) return { success: false, error: 'Diagram family changed', session }
    return {
      success: true,
      session: {
        ...session,
        baseHostRevision: conflict.hostRevision,
        workingRevision,
        baseSource: conflict.content,
        projection,
        baseLayout: conflict.layout,
        dirty: true,
        conflict: null,
        history: { past: [], future: [] },
        processedTransactionIds: [...session.processedTransactionIds, resolution.transactionId].slice(-200),
      },
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), session }
  }
}

export function markDocumentSessionSaved(
  session: DocumentSession,
  hostRevision: number,
  savedWorkingRevision: number,
): DocumentSession {
  if (savedWorkingRevision !== session.workingRevision) return { ...session, baseHostRevision: hostRevision }
  return {
    ...session,
    baseHostRevision: hostRevision,
    baseSource: session.source,
    baseLayout: session.layout,
    dirty: false,
    conflict: null,
  }
}
