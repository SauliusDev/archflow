import type { DiagramFamily, SemanticHandle, SourceOperation } from './diagram'
import type { LayoutGeometry, LayoutStateV2 } from './layout'

export interface RevisionedEnvelope<Type extends string, Payload> {
  type: Type
  sessionId: string
  baseRevision: number
  eventId: string
  payload: Payload
}

export interface DocumentSessionState {
  sessionId: string
  family: DiagramFamily
  baseRevision: number
  workingRevision: number
  source: string
  dirty: boolean
}

export interface ConflictState {
  hostRevision: number
  externalSource: string
  localSource: string
  localWorkingRevision: number
}

export interface DocumentTransaction {
  id: string
  family: DiagramFamily
  baseRevision: number
  resultRevision: number
  forward: SourceOperation[]
  inverse: SourceOperation[]
  layoutBefore: LayoutStateV2 | null
  layoutAfter: LayoutStateV2 | null
  layoutDeltas?: Array<{ handle: SemanticHandle; before: LayoutGeometry; after: LayoutGeometry }>
  selectionBefore: SemanticHandle[]
  selectionAfter: SemanticHandle[]
  description: string
}

export interface TransactionHistory {
  past: DocumentTransaction[]
  future: DocumentTransaction[]
}
