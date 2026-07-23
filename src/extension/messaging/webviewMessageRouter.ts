import type { GridStyle, HostToWebviewMessage, LayoutStyle, NewEdgeRouteMode, WebviewToHostMessage } from '../../shared/protocol'
import type { PanelSession, SaveRequest } from '../editor/panelSession'

export interface RouterDocument {
  readonly uri: string
  readonly filename: string
  read(): { content: string; revision: number }
}

export interface WebviewMessageRouterDependencies {
  readonly session: PanelSession
  readonly document: RouterDocument
  readonly post: (message: HostToWebviewMessage) => void
  readonly autoSave: () => boolean
  readonly setAutoSave: (value: boolean) => void | PromiseLike<void>
  readonly smartRouting: () => boolean
  readonly setSmartRouting: (value: boolean) => void | PromiseLike<void>
  readonly snapToGrid: () => boolean
  readonly setSnapToGrid: (value: boolean) => void | PromiseLike<void>
  readonly newEdgeRouteMode: () => NewEdgeRouteMode
  readonly setNewEdgeRouteMode: (value: NewEdgeRouteMode) => void | PromiseLike<void>
  readonly layoutStyle?: () => LayoutStyle
  readonly setLayoutStyle?: (value: LayoutStyle) => void | PromiseLike<void>
  readonly gridStyle?: () => GridStyle
  readonly setGridStyle?: (value: GridStyle) => void | PromiseLike<void>
  readonly theme: () => 'dark' | 'light' | 'highContrast'
  readonly newEventId: () => string
  readonly save: { save(session: PanelSession, request: SaveRequest): void | Promise<void> }
  readonly output: { appendLine(message: string): void; show?(preserveFocus?: boolean): void }
  readonly export: (message: Extract<WebviewToHostMessage, { type: 'EXPORT' }>) => void
}

export class WebviewMessageRouter {
  constructor(private readonly dependencies: WebviewMessageRouterDependencies) {}

  route(message: WebviewToHostMessage): void {
    const { session, document, post } = this.dependencies
    if (session.disposed) return
    switch (message.type) {
      case 'READY': {
        const snapshot = document.read()
        session.resetRevisions(snapshot.revision)
        post({
          type: 'LOAD', sessionId: session.sessionId, baseRevision: snapshot.revision, eventId: this.dependencies.newEventId(),
          payload: { content: snapshot.content, filename: document.filename, autoSave: this.dependencies.autoSave(), smartRouting: this.dependencies.smartRouting(), snapToGrid: this.dependencies.snapToGrid(), newEdgeRouteMode: this.dependencies.newEdgeRouteMode(), layoutStyle: this.dependencies.layoutStyle?.() ?? 'classic', gridStyle: this.dependencies.gridStyle?.() ?? 'grid', sessionId: session.sessionId, eventId: this.dependencies.newEventId(), family: session.family, hostRevision: snapshot.revision, workingRevision: session.workingRevision },
        })
        post({ type: 'THEME_CHANGED', payload: { kind: this.dependencies.theme() } })
        return
      }
      case 'SAVE': {
        if (typeof message.sessionId === 'string' && message.sessionId !== session.sessionId) return
        const snapshot = document.read()
        void this.dependencies.save.save(session, {
          transactionId: message.eventId ?? this.dependencies.newEventId(),
          documentUri: document.uri,
          expectedHostRevision: typeof message.baseRevision === 'number' ? message.baseRevision : snapshot.revision,
          workingRevision: typeof message.payload.workingRevision === 'number' ? message.payload.workingRevision : session.workingRevision + 1,
          content: message.payload.content,
        })
        return
      }
      case 'LOG':
        this.dependencies.output.appendLine(`[${message.payload.level.toUpperCase()}] ${message.payload.message}`)
        if (message.payload.level === 'error') this.dependencies.output.show?.(true)
        return
      case 'EXPORT':
        this.dependencies.export(message)
        return
      case 'SET_PREFERENCE':
        void Promise.resolve().then(() => {
          switch (message.payload.preference) {
            case 'autoSave': return this.dependencies.setAutoSave(message.payload.value)
            case 'smartRouting': return this.dependencies.setSmartRouting(message.payload.value)
            case 'snapToGrid': return this.dependencies.setSnapToGrid(message.payload.value)
            case 'newEdgeRouteMode': return this.dependencies.setNewEdgeRouteMode(message.payload.value)
            case 'layoutStyle': {
              if (!this.dependencies.setLayoutStyle) throw new Error('Layout style preference is unavailable')
              return this.dependencies.setLayoutStyle(message.payload.value)
            }
            case 'gridStyle': {
              if (!this.dependencies.setGridStyle) throw new Error('Grid style preference is unavailable')
              return this.dependencies.setGridStyle(message.payload.value)
            }
          }
        }).then(() => {
          if (message.payload.preference === 'newEdgeRouteMode') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: true, value: message.payload.value, requestId: message.payload.requestId } })
          } else if (message.payload.preference === 'layoutStyle') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'layoutStyle', success: true, value: message.payload.value, requestId: message.payload.requestId } })
          } else if (message.payload.preference === 'gridStyle') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'gridStyle', success: true, value: message.payload.value, requestId: message.payload.requestId } })
          } else {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: message.payload.preference, success: true, value: message.payload.value, requestId: message.payload.requestId } })
          }
        }).catch(error => {
          const preferenceName = message.payload.preference === 'autoSave' ? 'Auto save' : message.payload.preference === 'smartRouting' ? 'Smart routing' : message.payload.preference === 'snapToGrid' ? 'Snap to grid' : message.payload.preference === 'newEdgeRouteMode' ? 'New-edge route mode' : message.payload.preference === 'layoutStyle' ? 'Layout style' : 'Grid style'
          this.dependencies.output.appendLine(`[ERROR] Unable to update ${preferenceName} preference: ${String(error)}`)
          this.dependencies.output.show?.(true)
          if (message.payload.preference === 'newEdgeRouteMode') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: false, value: this.dependencies.newEdgeRouteMode(), requestId: message.payload.requestId, error: String(error) } })
          } else if (message.payload.preference === 'layoutStyle') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'layoutStyle', success: false, value: this.dependencies.layoutStyle?.() ?? 'classic', requestId: message.payload.requestId, error: String(error) } })
          } else if (message.payload.preference === 'gridStyle') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'gridStyle', success: false, value: this.dependencies.gridStyle?.() ?? 'grid', requestId: message.payload.requestId, error: String(error) } })
          } else if (message.payload.preference === 'autoSave') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'autoSave', success: false, value: this.dependencies.autoSave(), requestId: message.payload.requestId, error: String(error) } })
          } else if (message.payload.preference === 'snapToGrid') {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'snapToGrid', success: false, value: this.dependencies.snapToGrid(), requestId: message.payload.requestId, error: String(error) } })
          } else {
            post({ type: 'PREFERENCE_RESULT', payload: { preference: 'smartRouting', success: false, value: this.dependencies.smartRouting(), requestId: message.payload.requestId, error: String(error) } })
          }
        })
        return
    }
  }
}
