import type { SaveResultPayload } from '../../shared/protocol'
import type { PanelSession, PendingSave, SaveRequest } from '../editor/panelSession'

export interface SaveHostPort {
  readonly documentUri: string
  readDocument(): { content: string; revision: number }
  applyContent(content: string): Promise<boolean>
  saveDocument(): Promise<boolean>
  postSaveResult(result: SaveResultPayload): void
}

interface TrackedSave extends PendingSave {
  readonly session: PanelSession
  observedHostRevision?: number
}

export interface DocumentChange {
  readonly documentUri: string
  readonly content: string
  readonly revision: number
}

export class SaveCoordinator {
  private readonly pendingByDocument = new Map<string, TrackedSave>()
  private readonly committedByDocument = new Map<string, TrackedSave>()
  private readonly inFlightBySession = new Map<PanelSession, Map<string, Promise<void>>>()

  async save(session: PanelSession, port: SaveHostPort, request: SaveRequest): Promise<void> {
    if (session.disposed) return

    const previous = session.findProcessed(request.transactionId)
    if (previous) {
      port.postSaveResult(previous)
      return
    }

    const inFlight = this.inFlightBySession.get(session)?.get(request.transactionId)
    if (inFlight) {
      await inFlight
      const completed = session.findProcessed(request.transactionId)
      if (!session.disposed && completed) port.postSaveResult(completed)
      return
    }

    const attempt = this.performSave(session, port, request)
    let sessionSaves = this.inFlightBySession.get(session)
    if (!sessionSaves) {
      sessionSaves = new Map()
      this.inFlightBySession.set(session, sessionSaves)
    }
    sessionSaves.set(request.transactionId, attempt)
    try {
      await attempt
    } finally {
      if (sessionSaves.get(request.transactionId) === attempt) sessionSaves.delete(request.transactionId)
      if (sessionSaves.size === 0) this.inFlightBySession.delete(session)
    }
  }

  private async performSave(session: PanelSession, port: SaveHostPort, request: SaveRequest): Promise<void> {
    const current = port.readDocument()
    if (session.disposed || request.expectedHostRevision !== current.revision || this.pendingByDocument.has(request.documentUri)) {
      this.post(session, port, request.transactionId, {
        success: false,
        conflict: true,
        hostRevision: current.revision,
        savedWorkingRevision: request.workingRevision,
        externalContent: current.content,
      })
      return
    }

    const begun = session.beginSave(request)
    if (!begun.ok) {
      this.post(session, port, request.transactionId, {
        success: false,
        conflict: begun.code === 'persistence-conflict',
        error: begun.message,
        hostRevision: current.revision,
        savedWorkingRevision: request.workingRevision,
      })
      return
    }

    const pending: TrackedSave = { ...begun.value, session }
    this.pendingByDocument.set(request.documentUri, pending)
    try {
      const applied = await port.applyContent(request.content)
      const persisted = applied && await port.saveDocument()
      this.releasePending(pending)
      if (session.disposed) return

      const updated = port.readDocument()
      const accepted = persisted && (pending.observedHostRevision !== undefined || updated.content === pending.content)
      if (accepted) this.committedByDocument.set(request.documentUri, pending)
      this.post(session, port, request.transactionId, {
        success: accepted,
        ...(accepted ? {} : { conflict: applied }),
        hostRevision: updated.revision,
        savedWorkingRevision: request.workingRevision,
      })
    } catch (error: unknown) {
      this.releasePending(pending)
      if (session.disposed) return
      const updated = port.readDocument()
      this.post(session, port, request.transactionId, {
        success: false,
        error: String(error),
        hostRevision: updated.revision,
        savedWorkingRevision: request.workingRevision,
      })
    }
  }

  observeDocumentChange(change: DocumentChange): TrackedSave | undefined {
    const candidate = this.pendingByDocument.get(change.documentUri) ?? this.committedByDocument.get(change.documentUri)
    if (!candidate
      || candidate.content !== change.content
      || change.revision < candidate.expectedHostRevision
      || (candidate.observedHostRevision !== undefined && candidate.observedHostRevision !== change.revision)) return undefined
    candidate.observedHostRevision ??= change.revision
    candidate.session.observeHostRevision(change.revision)
    return candidate
  }

  findOrigin(change: DocumentChange): TrackedSave | undefined {
    return this.observeDocumentChange(change)
  }

  disposeSession(session: PanelSession): void {
    for (const [documentUri, pending] of this.pendingByDocument) {
      if (pending.session === session && this.pendingByDocument.get(documentUri) === pending) this.pendingByDocument.delete(documentUri)
    }
    for (const [documentUri, committed] of this.committedByDocument) {
      if (committed.session === session && this.committedByDocument.get(documentUri) === committed) this.committedByDocument.delete(documentUri)
    }
    this.inFlightBySession.delete(session)
  }

  private releasePending(pending: TrackedSave): void {
    if (this.pendingByDocument.get(pending.documentUri) === pending) this.pendingByDocument.delete(pending.documentUri)
  }

  private post(session: PanelSession, port: SaveHostPort, transactionId: string, result: SaveResultPayload): void {
    session.completeSave(transactionId, result)
    if (!session.disposed) port.postSaveResult(session.findProcessed(transactionId)!)
  }
}
