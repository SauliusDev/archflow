import * as crypto from 'crypto'
import * as vscode from 'vscode'
import { type GridStyle, type HostToWebviewMessage, type LayoutStyle, type NewEdgeRouteMode, parseWebviewToHostMessage, type SaveResultPayload, type WebviewToHostMessage } from '../shared/protocol'
import { detectDiagramFamily } from './diagramTypeDetector'
import { getWebviewHtml } from './editor/webviewHtml'
import { PanelSessionCoordinator, type PanelSession } from './editor/panelSession'
import { WebviewMessageRouter } from './messaging/webviewMessageRouter'
import { SaveCoordinator, type SaveHostPort } from './persistence/saveCoordinator'

interface DocumentState {
  content: string
  revision: number
  readonly panels: Map<PanelSession, (message: HostToWebviewMessage) => void>
  watcher?: vscode.FileSystemWatcher
}

export class FlowforgeEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'flowforge.editor'
  static readonly legacyViewType = 'archflow.editor'
  private static outputChannel: vscode.OutputChannel | undefined
  private readonly saveCoordinator = new SaveCoordinator()
  private readonly activePanels = new Map<PanelSession, (message: HostToWebviewMessage) => void>()
  private readonly documentStates = new Map<string, DocumentState>()
  private newEdgeRouteModeWriteQueue: Promise<void> | null = null
  private layoutStyleWriteQueue: Promise<void> | null = null
  private gridStyleWriteQueue: Promise<void> | null = null

  static register(context: vscode.ExtensionContext): vscode.Disposable {
    return this.registerViewType(context, this.viewType)
  }

  static registerLegacy(context: vscode.ExtensionContext): vscode.Disposable {
    return this.registerViewType(context, this.legacyViewType)
  }

  private static registerViewType(context: vscode.ExtensionContext, viewType: string): vscode.Disposable {
    if (!FlowforgeEditorProvider.outputChannel) {
      FlowforgeEditorProvider.outputChannel = vscode.window.createOutputChannel('Flowforge')
      context.subscriptions.push(FlowforgeEditorProvider.outputChannel)
    }
    return vscode.window.registerCustomEditorProvider(
      viewType,
      new FlowforgeEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } },
    )
  }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('flowforge.newEdgeRouteMode')) {
        this.broadcastNewEdgeRouteMode(this.globalNewEdgeRouteMode())
      }
      if (event.affectsConfiguration('flowforge.snapToGrid')) {
        this.broadcastSnapToGrid(vscode.workspace.getConfiguration('flowforge').get<boolean>('snapToGrid', true))
      }
      if (event.affectsConfiguration('flowforge.layoutStyle')) {
        this.broadcastLayoutStyle(this.globalLayoutStyle())
      }
      if (event.affectsConfiguration('flowforge.gridStyle')) {
        this.broadcastGridStyle(this.globalGridStyle())
      }
    }))
  }

  resolveCustomTextEditor(document: vscode.TextDocument, webviewPanel: vscode.WebviewPanel, token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) return
    const webview = webviewPanel.webview
    webview.options = { enableScripts: true, localResourceRoots: [this.context.extensionUri] }

    const documentState = this.getDocumentState(document)
    const detection = detectDiagramFamily(documentState.content)
    const session = new PanelSessionCoordinator({
      sessionId: crypto.randomUUID(),
      family: detection.family === 'empty' ? 'flowchart' : detection.family,
      revision: documentState.revision,
    })
    const post = (message: HostToWebviewMessage) => { void webview.postMessage(message) }
    this.activePanels.set(session, post)
    documentState.panels.set(session, post)
    const savePort = this.createSavePort(document, session, post, documentState)
    const router = new WebviewMessageRouter({
      session,
      document: {
        uri: document.uri.toString(),
        filename: document.uri.path.split('/').pop() ?? 'untitled.mmd',
        read: () => ({ content: documentState.content, revision: documentState.revision }),
      },
      post,
      autoSave: () => vscode.workspace.getConfiguration('flowforge').get<boolean>('autoSave', true),
      setAutoSave: value => vscode.workspace.getConfiguration('flowforge').update('autoSave', value, vscode.ConfigurationTarget.Global),
      smartRouting: () => vscode.workspace.getConfiguration('flowforge').get<boolean>('smartRouting', true),
      setSmartRouting: value => vscode.workspace.getConfiguration('flowforge').update('smartRouting', value, vscode.ConfigurationTarget.Global),
      snapToGrid: () => vscode.workspace.getConfiguration('flowforge').get<boolean>('snapToGrid', true),
      setSnapToGrid: value => vscode.workspace.getConfiguration('flowforge').update('snapToGrid', value, vscode.ConfigurationTarget.Global),
      newEdgeRouteMode: () => this.globalNewEdgeRouteMode(),
      setNewEdgeRouteMode: value => this.setGlobalNewEdgeRouteMode(value),
      layoutStyle: () => this.globalLayoutStyle(),
      setLayoutStyle: value => this.setGlobalLayoutStyle(value),
      gridStyle: () => this.globalGridStyle(),
      setGridStyle: value => this.setGlobalGridStyle(value),
      theme: () => this.themeKind(vscode.window.activeColorTheme.kind),
      newEventId: () => crypto.randomUUID(),
      save: { save: (owner, request) => this.saveCoordinator.save(owner, savePort, request) },
      output: FlowforgeEditorProvider.outputChannel ?? { appendLine: () => undefined },
      export: message => this.exportFromWebview(message, document),
    })
    const disposables: vscode.Disposable[] = [
      webview.onDidReceiveMessage((value: unknown) => {
        const parsed = parseWebviewToHostMessage(value)
        if (!parsed.ok) {
          FlowforgeEditorProvider.outputChannel?.appendLine(`[WARN] Rejected invalid webview message: ${parsed.message}`)
          return
        }
        router.route(parsed.value)
      }),
      vscode.workspace.onDidChangeTextDocument(event => {
        if (event.document.uri.toString() !== document.uri.toString() || session.disposed) return
        const { content, revision } = this.observeTextDocument(event.document, documentState)
        const origin = this.saveCoordinator.observeDocumentChange({ documentUri: document.uri.toString(), content, revision })
        session.observeHostRevision(revision)
        if (origin?.sessionId === session.sessionId) return
        post({
          type: 'EXTERNAL_FILE_CHANGE', sessionId: session.sessionId, baseRevision: revision, eventId: crypto.randomUUID(),
          payload: { content, hostRevision: revision, workingRevision: session.workingRevision, ...(origin ? { originTransactionId: origin.transactionId } : {}) },
        })
      }),
      vscode.window.onDidChangeActiveColorTheme(event => {
        if (!session.disposed) post({ type: 'THEME_CHANGED', payload: { kind: this.themeKind(event.kind) } })
      }),
    ]

    webview.html = getWebviewHtml({
      webview: {
        cspSource: webview.cspSource,
        asWebviewUri: path => webview.asWebviewUri(vscode.Uri.file(path)),
      },
      webviewOutPath: vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview').fsPath,
      serverUrl: process.env.VITE_DEV_SERVER_URL,
      log: message => FlowforgeEditorProvider.outputChannel?.appendLine(message),
    })

    webviewPanel.onDidDispose(() => {
      this.saveCoordinator.disposeSession(session)
      session.dispose()
      this.activePanels.delete(session)
      documentState.panels.delete(session)
      if (documentState.panels.size === 0) {
        documentState.watcher?.dispose()
        this.documentStates.delete(document.uri.toString())
      }
      disposables.forEach(disposable => disposable.dispose())
    })
  }

  private createSavePort(document: vscode.TextDocument, session: PanelSession, post: (message: HostToWebviewMessage) => void, documentState: DocumentState): SaveHostPort {
    return {
      documentUri: document.uri.toString(),
      readDocument: () => ({ content: documentState.content, revision: documentState.revision }),
      applyContent: content => {
        const edit = new vscode.WorkspaceEdit()
        edit.replace(document.uri, new vscode.Range(0, 0, document.lineCount, 0), content)
        return vscode.workspace.applyEdit(edit)
      },
      saveDocument: () => document.save(),
      postSaveResult: result => this.postSaveResult(post, session, result),
    }
  }

  private postSaveResult(post: (message: HostToWebviewMessage) => void, session: PanelSession, result: SaveResultPayload): void {
    post({
      type: 'SAVE_RESULT',
      sessionId: session.sessionId,
      baseRevision: result.hostRevision ?? session.baseRevision,
      eventId: result.transactionId,
      payload: result,
    })
  }

  private exportFromWebview(message: Extract<WebviewToHostMessage, { type: 'EXPORT' }>, document: vscode.TextDocument): void {
    const { content, subtype } = message.payload
    if (subtype === 'clipboard') {
      void vscode.env.clipboard.writeText(content).catch(error => this.logError('Clipboard write failed', error))
      return
    }
    void vscode.window.showSaveDialog({ defaultUri: document.uri, filters: { Mermaid: ['mmd'] }, saveLabel: 'Save' }).then(
      uri => {
        if (!uri) return
        void vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content)).catch(error => this.logError('Export file write failed', error))
      },
      error => this.logError('Save dialog failed', error),
    )
  }

  private logError(operation: string, error: unknown): void {
    FlowforgeEditorProvider.outputChannel?.appendLine(`[ERROR] ${operation}: ${String(error)}`)
  }

  private getDocumentState(document: vscode.TextDocument): DocumentState {
    const uri = document.uri.toString()
    const existing = this.documentStates.get(uri)
    if (existing) return existing

    const state: DocumentState = {
      content: document.getText(),
      revision: this.documentVersion(document),
      panels: new Map(),
    }
    if (document.uri.scheme === 'file') {
      const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(document.uri, '*'))
      const reload = () => { void this.reloadExternalFile(document.uri, state) }
      watcher.onDidChange(reload)
      watcher.onDidCreate(reload)
      state.watcher = watcher
    }
    this.documentStates.set(uri, state)
    return state
  }

  private observeTextDocument(document: vscode.TextDocument, state: DocumentState): { content: string; revision: number } {
    const content = document.getText()
    const documentRevision = this.documentVersion(document)
    state.revision = Math.max(documentRevision, content === state.content ? state.revision : state.revision + 1)
    state.content = content
    return state
  }

  private async reloadExternalFile(uri: vscode.Uri, state: DocumentState): Promise<void> {
    try {
      const content = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri))
      if (content === state.content) return
      state.content = content
      state.revision += 1
      for (const [session, post] of state.panels) {
        if (session.disposed) continue
        session.observeHostRevision(state.revision)
        post({
          type: 'EXTERNAL_FILE_CHANGE', sessionId: session.sessionId, baseRevision: state.revision, eventId: crypto.randomUUID(),
          payload: { content, hostRevision: state.revision, workingRevision: session.workingRevision },
        })
      }
    } catch (error) {
      this.logError(`External file reload failed for ${uri.toString()}`, error)
    }
  }

  private documentVersion(document: vscode.TextDocument): number {
    return typeof document.version === 'number' ? document.version : 0
  }

  private globalNewEdgeRouteMode(): NewEdgeRouteMode {
    const configuration = vscode.workspace.getConfiguration('flowforge')
    const inspect = (configuration as Partial<Pick<vscode.WorkspaceConfiguration, 'inspect'>>).inspect
    const globalValue = inspect?.call(configuration, 'newEdgeRouteMode')?.globalValue
    return globalValue === 'straight' || globalValue === 'orthogonal' || globalValue === 'curved'
      ? globalValue
      : 'curved'
  }

  private setGlobalNewEdgeRouteMode(value: NewEdgeRouteMode): Promise<void> {
    const previousWrite = this.newEdgeRouteModeWriteQueue
    const write = (async () => {
      if (previousWrite) await previousWrite.catch(() => undefined)
      await vscode.workspace.getConfiguration('flowforge').update('newEdgeRouteMode', value, vscode.ConfigurationTarget.Global)
    })()
    this.newEdgeRouteModeWriteQueue = write
    void write.finally(() => {
      if (this.newEdgeRouteModeWriteQueue === write) this.newEdgeRouteModeWriteQueue = null
    }).catch(() => undefined)
    return write
  }

  private broadcastNewEdgeRouteMode(value: NewEdgeRouteMode): void {
    for (const [session, post] of this.activePanels) {
      if (!session.disposed) post({ type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value } })
    }
  }

  private broadcastSnapToGrid(value: boolean): void {
    for (const [session, post] of this.activePanels) {
      if (!session.disposed) post({ type: 'PREFERENCE_CHANGED', payload: { preference: 'snapToGrid', value } })
    }
  }

  private globalLayoutStyle(): LayoutStyle {
    const configuration = vscode.workspace.getConfiguration('flowforge')
    const inspect = (configuration as Partial<Pick<vscode.WorkspaceConfiguration, 'inspect'>>).inspect
    const globalValue = inspect?.call(configuration, 'layoutStyle')?.globalValue
    return globalValue === 'modern' ? 'modern' : 'classic'
  }

  private setGlobalLayoutStyle(value: LayoutStyle): Promise<void> {
    return this.queuePreferenceWrite('layoutStyle', value, 'layoutStyleWriteQueue')
  }

  private broadcastLayoutStyle(value: LayoutStyle): void {
    for (const [session, post] of this.activePanels) {
      if (!session.disposed) post({ type: 'PREFERENCE_CHANGED', payload: { preference: 'layoutStyle', value } })
    }
  }

  private globalGridStyle(): GridStyle {
    const configuration = vscode.workspace.getConfiguration('flowforge')
    const inspect = (configuration as Partial<Pick<vscode.WorkspaceConfiguration, 'inspect'>>).inspect
    const globalValue = inspect?.call(configuration, 'gridStyle')?.globalValue
    return globalValue === 'dots' ? 'dots' : 'grid'
  }

  private setGlobalGridStyle(value: GridStyle): Promise<void> {
    return this.queuePreferenceWrite('gridStyle', value, 'gridStyleWriteQueue')
  }

  private broadcastGridStyle(value: GridStyle): void {
    for (const [session, post] of this.activePanels) {
      if (!session.disposed) post({ type: 'PREFERENCE_CHANGED', payload: { preference: 'gridStyle', value } })
    }
  }

  private queuePreferenceWrite(key: 'layoutStyle' | 'gridStyle', value: LayoutStyle | GridStyle, queueKey: 'layoutStyleWriteQueue' | 'gridStyleWriteQueue'): Promise<void> {
    const previousWrite = this[queueKey]
    const write = (async () => {
      if (previousWrite) await previousWrite.catch(() => undefined)
      await vscode.workspace.getConfiguration('flowforge').update(key, value, vscode.ConfigurationTarget.Global)
    })()
    this[queueKey] = write
    void write.finally(() => {
      if (this[queueKey] === write) this[queueKey] = null
    }).catch(() => undefined)
    return write
  }

  private themeKind(kind: vscode.ColorThemeKind): 'dark' | 'light' | 'highContrast' {
    if (kind === vscode.ColorThemeKind.Light) return 'light'
    if (kind === vscode.ColorThemeKind.Dark) return 'dark'
    return 'highContrast'
  }
}
