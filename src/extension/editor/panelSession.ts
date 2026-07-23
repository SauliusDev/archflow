import type { DiagramFamily, CommandResult } from '../../shared/diagram-contracts'
import type { SaveResultPayload } from '../../shared/protocol'

export interface SaveRequest {
  readonly transactionId: string
  readonly documentUri: string
  readonly expectedHostRevision: number
  readonly workingRevision: number
  readonly content: string
}

export interface PendingSave extends SaveRequest {
  readonly sessionId: string
}

export interface PanelSession {
  readonly sessionId: string
  readonly family: DiagramFamily
  readonly disposed: boolean
  readonly baseRevision: number
  readonly workingRevision: number
  beginSave(request: SaveRequest): CommandResult<PendingSave>
  completeSave(transactionId: string, result: SaveResultPayload): void
  findProcessed(transactionId: string): SaveResultPayload | undefined
  observeHostRevision(revision: number): void
  resetRevisions(revision: number): void
  dispose(): void
}

export interface PanelSessionOptions {
  readonly sessionId: string
  readonly family: DiagramFamily
  readonly revision: number
}

export class PanelSessionCoordinator implements PanelSession {
  private readonly processedTransactions = new Map<string, SaveResultPayload>()
  private _pendingSave: PendingSave | undefined
  private _disposed = false
  private _baseRevision: number
  private _workingRevision: number

  constructor({ sessionId, family, revision }: PanelSessionOptions) {
    this.sessionId = sessionId
    this.family = family
    this._baseRevision = revision
    this._workingRevision = revision
  }

  readonly sessionId: string
  readonly family: DiagramFamily

  get disposed(): boolean {
    return this._disposed
  }

  get baseRevision(): number {
    return this._baseRevision
  }

  get workingRevision(): number {
    return this._workingRevision
  }

  beginSave(request: SaveRequest): CommandResult<PendingSave> {
    if (this._disposed) {
      return { ok: false, code: 'invalid-operation', message: 'Panel session has been disposed' }
    }
    if (this._pendingSave) {
      return { ok: false, code: 'persistence-conflict', message: 'Panel session already has a pending save' }
    }
    this._pendingSave = { ...request, sessionId: this.sessionId }
    return { ok: true, value: { ...this._pendingSave } }
  }

  completeSave(transactionId: string, result: SaveResultPayload): void {
    const completed: SaveResultPayload = {
      ...result,
      sessionId: this.sessionId,
      transactionId,
      workingRevision: result.savedWorkingRevision,
    }
    this.processedTransactions.set(transactionId, { ...completed })
    if (this._pendingSave?.transactionId === transactionId) this._pendingSave = undefined
    if (completed.success) {
      this._baseRevision = Math.max(this._baseRevision, completed.hostRevision ?? this._baseRevision)
      this._workingRevision = Math.max(this._workingRevision, completed.savedWorkingRevision ?? this._workingRevision)
    }
  }

  findProcessed(transactionId: string): SaveResultPayload | undefined {
    const processed = this.processedTransactions.get(transactionId)
    return processed ? { ...processed } : undefined
  }

  observeHostRevision(revision: number): void {
    this._baseRevision = Math.max(this._baseRevision, revision)
  }

  resetRevisions(revision: number): void {
    this._baseRevision = revision
    this._workingRevision = revision
  }

  dispose(): void {
    this._disposed = true
    this._pendingSave = undefined
  }
}
