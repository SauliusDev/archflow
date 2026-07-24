import { describe, it, expect, beforeEach, vi } from 'vitest'
// Note: `vscode` is mocked via src/extension/setupTests.ts (vi.mock('vscode', ...))
import * as vscode from 'vscode'
import { FlowforgeEditorProvider } from './FlowforgeEditorProvider'
import type { WebviewToHostMessage } from '../shared/protocol'
import { detectDiagramFamily } from './diagramTypeDetector'

vi.mock('./diagramTypeDetector', () => ({
  detectDiagramFamily: vi.fn(() => ({ family: 'flowchart', declaration: 'flowchart' })),
}))

describe('FlowforgeEditorProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(vscode.workspace as unknown as { createFileSystemWatcher: ReturnType<typeof vi.fn> }).createFileSystemWatcher = vi.fn(() => ({
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
      dispose: vi.fn(),
    }))
    // Reset static field so each test gets a fresh channel creation + accurate mock call counts
    ;(FlowforgeEditorProvider as unknown as { outputChannel: vscode.OutputChannel | undefined }).outputChannel = undefined
  })

  it('has the correct viewType', () => {
    expect(FlowforgeEditorProvider.viewType).toBe('flowforge.editor')
  })

  it('register() calls createOutputChannel and registerCustomEditorProvider', () => {
    const fakeContext = {
      subscriptions: [] as { dispose(): void }[],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext

    FlowforgeEditorProvider.register(fakeContext)

    expect(vscode.window.createOutputChannel).toHaveBeenCalledWith('Flowforge')
    expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
      'flowforge.editor',
      expect.any(FlowforgeEditorProvider),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  })

  it('registerLegacy() keeps the pre-rename editor association working', () => {
    const fakeContext = {
      subscriptions: [] as { dispose(): void }[],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext

    FlowforgeEditorProvider.registerLegacy(fakeContext)

    expect(vscode.window.registerCustomEditorProvider).toHaveBeenCalledWith(
      'archflow.editor',
      expect.any(FlowforgeEditorProvider),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  })

  it('logs and ignores malformed webview messages before routing them', () => {
    const appendLine = vi.fn()
    ;(FlowforgeEditorProvider as unknown as { outputChannel: vscode.OutputChannel | undefined }).outputChannel = {
      appendLine,
      show: vi.fn(),
    } as unknown as vscode.OutputChannel

    let receive: ((message: unknown) => void) | undefined
    const panel = {
      webview: {
        options: {},
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
          receive = listener
          return { dispose: vi.fn() }
        }),
      },
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    }
    const document = {
      uri: vscode.Uri.file('/test/diagram.mmd'),
      getText: () => 'flowchart TD',
      lineCount: 1,
      version: 1,
    } as unknown as vscode.TextDocument

    new FlowforgeEditorProvider({
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext).resolveCustomTextEditor(
      document,
      panel as unknown as vscode.WebviewPanel,
      { isCancellationRequested: false } as vscode.CancellationToken,
    )

    receive!({ type: 'EXPORT', payload: { content: 'flowchart TD', format: 'mmd', subtype: 'download' } })

    expect(appendLine).toHaveBeenCalledWith('[WARN] Rejected invalid webview message: Invalid EXPORT message')
    expect(vscode.window.showSaveDialog).not.toHaveBeenCalled()
    expect(vscode.env.clipboard.writeText).not.toHaveBeenCalled()
  })

  it('writes global preferences and supplies their updated values to a newly opened panel', async () => {
    let autoSave = false
    let smartRouting = true
    let snapToGrid = true
    let newEdgeRouteMode = 'curved'
    const configuration = {
      get: vi.fn((key: string) => key === 'autoSave' ? autoSave : key === 'smartRouting' ? smartRouting : key === 'snapToGrid' ? snapToGrid : newEdgeRouteMode),
      inspect: vi.fn(() => ({ globalValue: newEdgeRouteMode, workspaceValue: 'straight' })),
      update: vi.fn((key: string, value: boolean | string, target: vscode.ConfigurationTarget) => {
        if (key === 'autoSave' && target === vscode.ConfigurationTarget.Global && typeof value === 'boolean') autoSave = value
        if (key === 'smartRouting' && target === vscode.ConfigurationTarget.Global && typeof value === 'boolean') smartRouting = value
        if (key === 'snapToGrid' && target === vscode.ConfigurationTarget.Global && typeof value === 'boolean') snapToGrid = value
        if (key === 'newEdgeRouteMode' && target === vscode.ConfigurationTarget.Global && typeof value === 'string') newEdgeRouteMode = value
        return Promise.resolve()
      }),
    } as unknown as vscode.WorkspaceConfiguration
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configuration)

    function makePanel() {
      let receive: ((message: unknown) => void) | undefined
      const postMessage = vi.fn()
      return {
        panel: {
          webview: {
            options: {},
            html: '',
            postMessage,
            onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
              receive = listener
              return { dispose: vi.fn() }
            }),
          },
          onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        } as unknown as vscode.WebviewPanel,
        postMessage,
        ready() { receive!({ type: 'READY', payload: {} }) },
        setAutoSave(value: boolean) { receive!({ type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value, requestId: 'auto-save' } }) },
        setSmartRouting(value: boolean) { receive!({ type: 'SET_PREFERENCE', payload: { preference: 'smartRouting', value, requestId: 'smart-routing' } }) },
        setSnapToGrid(value: boolean) { receive!({ type: 'SET_PREFERENCE', payload: { preference: 'snapToGrid', value, requestId: 'snap-to-grid' } }) },
        setNewEdgeRouteMode(value: 'straight' | 'orthogonal' | 'curved') { receive!({ type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value, requestId: 'route-mode' } }) },
      }
    }
    const document = {
      uri: vscode.Uri.file('/test/diagram.mmd'),
      getText: () => 'flowchart TD',
      lineCount: 1,
      version: 1,
    } as unknown as vscode.TextDocument

    const context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext
    const provider = new FlowforgeEditorProvider(context)
    const first = makePanel()
    provider.resolveCustomTextEditor(
      document,
      first.panel,
      { isCancellationRequested: false } as vscode.CancellationToken,
    )

    first.ready()
    first.setAutoSave(true)
    first.setSmartRouting(false)
    first.setSnapToGrid(false)
    first.setNewEdgeRouteMode('orthogonal')
    await Promise.resolve()

    const second = makePanel()
    provider.resolveCustomTextEditor(
      document,
      second.panel,
      { isCancellationRequested: false } as vscode.CancellationToken,
    )
    second.ready()

    expect(first.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'LOAD', payload: expect.objectContaining({ autoSave: false, smartRouting: true, snapToGrid: true, newEdgeRouteMode: 'curved' }),
    }))
    expect(configuration.update).toHaveBeenCalledWith('autoSave', true, vscode.ConfigurationTarget.Global)
    expect(configuration.update).toHaveBeenCalledWith('smartRouting', false, vscode.ConfigurationTarget.Global)
    expect(configuration.update).toHaveBeenCalledWith('snapToGrid', false, vscode.ConfigurationTarget.Global)
    expect(configuration.update).toHaveBeenCalledWith('newEdgeRouteMode', 'orthogonal', vscode.ConfigurationTarget.Global)
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'LOAD', payload: expect.objectContaining({ autoSave: true, smartRouting: false, snapToGrid: false, newEdgeRouteMode: 'orthogonal' }),
    }))
  })

  it('uses only a valid global route default when a workspace override conflicts', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(() => 'straight'),
      inspect: vi.fn(() => ({ globalValue: 'orthogonal', workspaceValue: 'straight' })),
      update: vi.fn(() => Promise.resolve()),
    } as unknown as vscode.WorkspaceConfiguration)
    let receive: ((message: unknown) => void) | undefined
    const postMessage = vi.fn()
    const panel = {
      webview: {
        options: {}, html: '', postMessage,
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => { receive = listener; return { dispose: vi.fn() } }),
      },
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as vscode.WebviewPanel
    const document = { uri: vscode.Uri.file('/test/diagram.mmd'), getText: () => 'flowchart TD', lineCount: 1, version: 1 } as unknown as vscode.TextDocument

    new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
      .resolveCustomTextEditor(document, panel, { isCancellationRequested: false } as vscode.CancellationToken)
    receive!({ type: 'READY', payload: {} })

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOAD', payload: expect.objectContaining({ newEdgeRouteMode: 'orthogonal' }) }))
  })

  it('uses only a valid global grid style when a workspace override conflicts', () => {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn((key: string) => key === 'gridStyle' ? 'grid' : true),
      inspect: vi.fn((key: string) => key === 'gridStyle' ? { globalValue: 'dots', workspaceValue: 'grid' } : undefined),
      update: vi.fn(() => Promise.resolve()),
    } as unknown as vscode.WorkspaceConfiguration)
    let receive: ((message: unknown) => void) | undefined
    const postMessage = vi.fn()
    const panel = {
      webview: {
        options: {}, html: '', postMessage,
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => { receive = listener; return { dispose: vi.fn() } }),
      },
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as vscode.WebviewPanel
    const document = { uri: vscode.Uri.file('/test/diagram.mmd'), getText: () => 'flowchart TD', lineCount: 1, version: 1 } as unknown as vscode.TextDocument

    new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
      .resolveCustomTextEditor(document, panel, { isCancellationRequested: false } as vscode.CancellationToken)
    receive!({ type: 'READY', payload: {} })

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOAD', payload: expect.objectContaining({ gridStyle: 'dots' }) }))
  })

  it('writes grid style globally and broadcasts configuration changes to active panels', async () => {
    let gridStyle: 'grid' | 'dots' = 'grid'
    let emitConfigurationChange: ((event: vscode.ConfigurationChangeEvent) => void) | undefined
    const configuration = {
      get: vi.fn((key: string) => key === 'gridStyle' ? gridStyle : true),
      inspect: vi.fn((key: string) => key === 'gridStyle' ? { globalValue: gridStyle } : undefined),
      update: vi.fn((key: string, value: 'grid' | 'dots', target: vscode.ConfigurationTarget) => {
        if (key === 'gridStyle' && target === vscode.ConfigurationTarget.Global) gridStyle = value
        return Promise.resolve()
      }),
    } as unknown as vscode.WorkspaceConfiguration
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configuration)
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(listener => {
      emitConfigurationChange = listener
      return { dispose: vi.fn() }
    })
    let receive: ((message: unknown) => void) | undefined
    const postMessage = vi.fn()
    const panel = {
      webview: {
        options: {}, html: '', postMessage,
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => { receive = listener; return { dispose: vi.fn() } }),
      },
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    } as unknown as vscode.WebviewPanel
    const document = { uri: vscode.Uri.file('/test/diagram.mmd'), getText: () => 'flowchart TD', lineCount: 1, version: 1 } as unknown as vscode.TextDocument
    const provider = new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
    provider.resolveCustomTextEditor(document, panel, { isCancellationRequested: false } as vscode.CancellationToken)
    receive!({ type: 'SET_PREFERENCE', payload: { preference: 'gridStyle', value: 'dots', requestId: 'grid-style' } })
    await vi.waitFor(() => expect(configuration.update).toHaveBeenCalledWith('gridStyle', 'dots', vscode.ConfigurationTarget.Global))

    emitConfigurationChange!({ affectsConfiguration: section => section === 'flowforge.gridStyle' } as vscode.ConfigurationChangeEvent)

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PREFERENCE_CHANGED', payload: { preference: 'gridStyle', value: 'dots' },
    }))
  })

  it('broadcasts snap-to-grid configuration changes to every active panel', () => {
    let emitConfigurationChange: ((event: vscode.ConfigurationChangeEvent) => void) | undefined
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: vi.fn(() => false) } as unknown as vscode.WorkspaceConfiguration)
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(listener => {
      emitConfigurationChange = listener
      return { dispose: vi.fn() }
    })
    const panels = Array.from({ length: 2 }, () => {
      const postMessage = vi.fn()
      return {
        postMessage,
        panel: {
          webview: { options: {}, html: '', postMessage, onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })) },
          onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        } as unknown as vscode.WebviewPanel,
      }
    })
    const document = { uri: vscode.Uri.file('/test/diagram.mmd'), getText: () => 'flowchart TD', lineCount: 1, version: 1 } as unknown as vscode.TextDocument
    const provider = new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
    for (const { panel } of panels) provider.resolveCustomTextEditor(document, panel, { isCancellationRequested: false } as vscode.CancellationToken)

    emitConfigurationChange!({ affectsConfiguration: section => section === 'flowforge.snapToGrid' } as vscode.ConfigurationChangeEvent)

    for (const { postMessage } of panels) {
      expect(postMessage).toHaveBeenCalledWith({ type: 'PREFERENCE_CHANGED', payload: { preference: 'snapToGrid', value: false } })
    }
  })

  it.each([
    ['layoutStyle', 'modern', 'classic'],
    ['gridStyle', 'dots', 'grid'],
  ] as const)('serializes %s writes so the last preference wins', async (key, firstValue, secondValue) => {
    const pendingUpdates: Array<{ value: string; resolve(): void }> = []
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      update: vi.fn((_key: string, value: string) => new Promise<void>(resolve => pendingUpdates.push({ value, resolve }))),
    } as unknown as vscode.WorkspaceConfiguration)
    const provider = new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
    const methods = provider as unknown as {
      setGlobalLayoutStyle(value: 'classic' | 'modern'): Promise<void>
      setGlobalGridStyle(value: 'grid' | 'dots'): Promise<void>
    }

    const write = key === 'layoutStyle' ? methods.setGlobalLayoutStyle.bind(methods) : methods.setGlobalGridStyle.bind(methods)
    const first = write(firstValue)
    const second = write(secondValue)
    await vi.waitFor(() => expect(pendingUpdates.map(update => update.value)).toEqual([firstValue]))
    pendingUpdates[0].resolve()
    await vi.waitFor(() => expect(pendingUpdates.map(update => update.value)).toEqual([firstValue, secondValue]))
    pendingUpdates[1].resolve()

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
  })

  it('serializes route-default writes, propagates changes, observes external settings, and stops after panel disposal', async () => {
    let globalRouteMode: 'straight' | 'orthogonal' | 'curved' = 'curved'
    let emitConfigurationChange: ((event: vscode.ConfigurationChangeEvent) => void) | undefined
    const pendingUpdates: Array<{ value: 'straight' | 'orthogonal' | 'curved'; resolve(): void }> = []
    const configuration = {
      get: vi.fn(() => globalRouteMode),
      inspect: vi.fn(() => ({ globalValue: globalRouteMode })),
      update: vi.fn((_key: string, value: 'straight' | 'orthogonal' | 'curved') => new Promise<void>(resolve => {
        pendingUpdates.push({ value, resolve: () => {
          globalRouteMode = value
          emitConfigurationChange?.({ affectsConfiguration: section => section === 'flowforge.newEdgeRouteMode' } as vscode.ConfigurationChangeEvent)
          resolve()
        } })
      })),
    } as unknown as vscode.WorkspaceConfiguration
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(configuration)
    vi.mocked(vscode.workspace.onDidChangeConfiguration).mockImplementation(listener => {
      emitConfigurationChange = listener
      return { dispose: vi.fn() }
    })
    vi.mocked(vscode.workspace.onDidChangeTextDocument).mockReturnValue({ dispose: vi.fn() })
    vi.mocked(vscode.window.onDidChangeActiveColorTheme).mockReturnValue({ dispose: vi.fn() })

    function makePanel() {
      let receive: ((message: unknown) => void) | undefined
      let dispose: (() => void) | undefined
      const postMessage = vi.fn()
      const panel = {
        webview: {
          options: {}, html: '', postMessage,
          onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => { receive = listener; return { dispose: vi.fn() } }),
        },
        onDidDispose: vi.fn((listener: () => void) => { dispose = listener; return { dispose: vi.fn() } }),
      } as unknown as vscode.WebviewPanel
      return {
        panel, postMessage,
        ready() { receive!({ type: 'READY', payload: {} }) },
        setRoute(value: 'straight' | 'orthogonal' | 'curved', requestId: string) { receive!({ type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value, requestId } }) },
        dispose() { dispose!() },
      }
    }

    const document = { uri: vscode.Uri.file('/test/diagram.mmd'), getText: () => 'flowchart TD', lineCount: 1, version: 1 } as unknown as vscode.TextDocument
    const provider = new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
    const first = makePanel()
    const second = makePanel()
    provider.resolveCustomTextEditor(document, first.panel, { isCancellationRequested: false } as vscode.CancellationToken)
    provider.resolveCustomTextEditor(document, second.panel, { isCancellationRequested: false } as vscode.CancellationToken)
    first.ready()
    second.ready()

    first.setRoute('straight', 'first')
    first.setRoute('orthogonal', 'second')
    await vi.waitFor(() => expect(pendingUpdates.map(update => update.value)).toEqual(['straight']))
    pendingUpdates[0].resolve()
    await vi.waitFor(() => expect(pendingUpdates.map(update => update.value)).toEqual(['straight', 'orthogonal']))
    pendingUpdates[1].resolve()
    await vi.waitFor(() => expect(first.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'orthogonal' },
    })))
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'orthogonal' },
    }))
    const broadcastsFor = (postMessage: ReturnType<typeof vi.fn>, value: 'straight' | 'orthogonal' | 'curved') => postMessage.mock.calls
      .filter(([message]) => (message as { type?: string; payload?: { value?: string } }).type === 'PREFERENCE_CHANGED'
        && (message as { payload?: { value?: string } }).payload?.value === value)
    expect(broadcastsFor(first.postMessage, 'straight')).toHaveLength(1)
    expect(broadcastsFor(first.postMessage, 'orthogonal')).toHaveLength(1)
    expect(broadcastsFor(second.postMessage, 'straight')).toHaveLength(1)
    expect(broadcastsFor(second.postMessage, 'orthogonal')).toHaveLength(1)

    globalRouteMode = 'straight'
    emitConfigurationChange!({ affectsConfiguration: section => section === 'flowforge.newEdgeRouteMode' } as vscode.ConfigurationChangeEvent)
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'straight' },
    }))

    first.dispose()
    first.postMessage.mockClear()
    globalRouteMode = 'curved'
    emitConfigurationChange!({ affectsConfiguration: section => section === 'flowforge.newEdgeRouteMode' } as vscode.ConfigurationChangeEvent)
    expect(first.postMessage).not.toHaveBeenCalled()
    expect(second.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'curved' },
    }))
  })

  it('recovers the route-default write queue after a rejected update', async () => {
    const update = vi.fn()
      .mockRejectedValueOnce(new Error('configuration unavailable'))
      .mockResolvedValueOnce(undefined)
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ update } as unknown as vscode.WorkspaceConfiguration)
    const provider = new FlowforgeEditorProvider({ subscriptions: [], extensionUri: vscode.Uri.file('/fake/extension') } as unknown as vscode.ExtensionContext)
    const writes = provider as unknown as { setGlobalNewEdgeRouteMode(value: 'straight' | 'orthogonal' | 'curved'): Promise<void> }

    const rejected = writes.setGlobalNewEdgeRouteMode('straight')
    const recovered = writes.setGlobalNewEdgeRouteMode('orthogonal')

    await expect(rejected).rejects.toThrow('configuration unavailable')
    await expect(recovered).resolves.toBeUndefined()
    expect(update).toHaveBeenNthCalledWith(1, 'newEdgeRouteMode', 'straight', vscode.ConfigurationTarget.Global)
    expect(update).toHaveBeenNthCalledWith(2, 'newEdgeRouteMode', 'orthogonal', vscode.ConfigurationTarget.Global)
  })

  it('rejects an invalid preference before configuration or document access', () => {
    const get = vi.fn(() => true)
    const update = vi.fn(() => Promise.resolve())
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get, update } as unknown as vscode.WorkspaceConfiguration)

    let receive: ((message: unknown) => void) | undefined
    const panel = {
      webview: {
        options: {},
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
          receive = listener
          return { dispose: vi.fn() }
        }),
      },
      onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    }
    const getText = vi.fn(() => 'flowchart TD')
    const document = {
      uri: vscode.Uri.file('/test/diagram.mmd'),
      getText,
      lineCount: 1,
      version: 1,
    } as unknown as vscode.TextDocument

    new FlowforgeEditorProvider({
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext).resolveCustomTextEditor(
      document,
      panel as unknown as vscode.WebviewPanel,
      { isCancellationRequested: false } as vscode.CancellationToken,
    )
    getText.mockClear()

    receive!({ type: 'SET_PREFERENCE', payload: { preference: 'not-autoSave', value: true } })

    expect(update).not.toHaveBeenCalled()
    expect(getText).not.toHaveBeenCalled()
  })

  describe('EXPORT handler', () => {
    const fakeContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext

    const fakeDocument = {
      uri: vscode.Uri.file('/test/diagram.mmd'),
      getText: vi.fn(() => 'flowchart TD\n  A[Test]'),
      lineCount: 2,
    } as unknown as vscode.TextDocument

    let capturedWebviewMessageHandler: ((msg: WebviewToHostMessage) => void) | undefined

    beforeEach(() => {
      capturedWebviewMessageHandler = undefined

      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(
        () => ({ dispose: vi.fn() })
      )

      vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true as never)

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as unknown as vscode.WorkspaceConfiguration)

      const fakePanel = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: vi.fn((cb: (msg: WebviewToHostMessage) => void) => {
            capturedWebviewMessageHandler = cb
            return { dispose: vi.fn() }
          }),
          postMessage: vi.fn(),
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      }

      const provider = new FlowforgeEditorProvider(fakeContext)
      provider.resolveCustomTextEditor(
        fakeDocument,
        fakePanel as unknown as vscode.WebviewPanel,
        { isCancellationRequested: false } as vscode.CancellationToken,
      )
    })

    it('EXPORT clipboard: calls vscode.env.clipboard.writeText with content', async () => {
      const canonicalSource = 'flowchart LR\n  A-->B\n'
      vi.mocked(vscode.env.clipboard.writeText).mockResolvedValue(undefined as never)
      capturedWebviewMessageHandler!({
        type: 'EXPORT',
        payload: { content: canonicalSource, format: 'mmd', subtype: 'clipboard' },
      })
      await Promise.resolve()
      expect(vscode.env.clipboard.writeText).toHaveBeenCalledWith(canonicalSource)
      expect(canonicalSource).not.toContain('FLOWFORGE LAYOUT')
    })

    it('EXPORT clipboard: does not crash when clipboard write rejects', async () => {
      vi.mocked(vscode.env.clipboard.writeText).mockRejectedValue(new Error('write failed') as never)
      await expect(async () => {
        capturedWebviewMessageHandler!({
          type: 'EXPORT',
          payload: { content: 'flowchart LR\n  A-->B', format: 'mmd', subtype: 'clipboard' },
        })
        await Promise.resolve()
      }).not.toThrow()
    })

    it('EXPORT file: calls showSaveDialog with Mermaid filter', async () => {
      const fakeUri = vscode.Uri.file('/test/output.mmd')
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(fakeUri as never)
      vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined as never)
      capturedWebviewMessageHandler!({
        type: 'EXPORT',
        payload: { content: 'flowchart LR\n  A-->B', format: 'mmd', subtype: 'file' },
      })
      await Promise.resolve()
      expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
        expect.objectContaining({ filters: { 'Mermaid': ['mmd'] } })
      )
    })

    it('EXPORT file: calls workspace.fs.writeFile with encoded content when dialog confirms', async () => {
      const canonicalSource = 'flowchart LR\n  A-->B\n'
      const fakeUri = vscode.Uri.file('/test/output.mmd')
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(fakeUri as never)
      vi.mocked(vscode.workspace.fs.writeFile).mockResolvedValue(undefined as never)
      capturedWebviewMessageHandler!({
        type: 'EXPORT',
        payload: { content: canonicalSource, format: 'mmd', subtype: 'file' },
      })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
        fakeUri,
        new TextEncoder().encode(canonicalSource),
      )
    })

    it('EXPORT file: does not call writeFile when dialog is cancelled (returns undefined)', async () => {
      vi.mocked(vscode.window.showSaveDialog).mockResolvedValue(undefined as never)
      capturedWebviewMessageHandler!({
        type: 'EXPORT',
        payload: { content: 'flowchart LR\n  A-->B', format: 'mmd', subtype: 'file' },
      })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled()
    })
  })

  describe('EXTERNAL_FILE_CHANGE suppress flag', () => {
    const fakeContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext

    const fakeDocument = {
      uri: vscode.Uri.file('/test/diagram.mmd'),
      getText: vi.fn(() => 'flowchart TD\n  A[Test]'),
      lineCount: 2,
    } as unknown as vscode.TextDocument

    let capturedOnDidChangeTextDocument: ((e: { document: vscode.TextDocument }) => void) | undefined
    let capturedWebviewMessageHandler: ((msg: WebviewToHostMessage) => void) | undefined
    let postMessageSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      capturedOnDidChangeTextDocument = undefined
      capturedWebviewMessageHandler = undefined

      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(
        (listener: (e: { document: vscode.TextDocument }) => void) => {
          capturedOnDidChangeTextDocument = listener
          return { dispose: vi.fn() }
        }
      )

      vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true as never)

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as unknown as vscode.WorkspaceConfiguration)

      postMessageSpy = vi.fn()

      const fakePanel = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: vi.fn((cb: (msg: WebviewToHostMessage) => void) => {
            capturedWebviewMessageHandler = cb
            return { dispose: vi.fn() }
          }),
          postMessage: postMessageSpy,
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      }

      const provider = new FlowforgeEditorProvider(fakeContext)
      provider.resolveCustomTextEditor(
        fakeDocument,
        fakePanel as unknown as vscode.WebviewPanel,
        { isCancellationRequested: false } as vscode.CancellationToken,
      )
    })

    it('does not send EXTERNAL_FILE_CHANGE after own SAVE triggers onDidChangeTextDocument', () => {
      capturedWebviewMessageHandler!({
        type: 'SAVE',
        payload: { content: 'flowchart TD\n  A[Test]' },
      })
      capturedOnDidChangeTextDocument!({ document: fakeDocument })
      expect(postMessageSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'EXTERNAL_FILE_CHANGE' }),
      )
    })

    it('sends EXTERNAL_FILE_CHANGE for genuine external edits (flag not set)', () => {
      capturedOnDidChangeTextDocument!({ document: fakeDocument })
      expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EXTERNAL_FILE_CHANGE',
        payload: expect.objectContaining({ content: 'flowchart TD\n  A[Test]' }),
      }))
    })

    it('forwards an on-disk edit that does not change the TextDocument', async () => {
      let fileChangeListener: ((uri: vscode.Uri) => void) | undefined
      const workspaceWithFileWatcher = vscode.workspace as unknown as {
        createFileSystemWatcher: ReturnType<typeof vi.fn>
      }
      workspaceWithFileWatcher.createFileSystemWatcher = vi.fn(() => ({
        onDidChange: vi.fn((listener: (uri: vscode.Uri) => void) => {
          fileChangeListener = listener
          return { dispose: vi.fn() }
        }),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      }))
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
        new TextEncoder().encode('flowchart TD\n  B[Written by an LLM]'),
      )

      const provider = new FlowforgeEditorProvider(fakeContext)
      provider.resolveCustomTextEditor(
        fakeDocument,
        {
          webview: {
            options: {}, html: '', postMessage: postMessageSpy,
            onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
          },
          onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
        } as unknown as vscode.WebviewPanel,
        { isCancellationRequested: false } as vscode.CancellationToken,
      )

      fileChangeListener!(fakeDocument.uri)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(postMessageSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EXTERNAL_FILE_CHANGE',
        payload: expect.objectContaining({ content: 'flowchart TD\n  B[Written by an LLM]' }),
      }))
    })

    it('does not report its pending write as external when the file watcher fires first', async () => {
      let fileChangeListener: ((uri: vscode.Uri) => void) | undefined
      let receive: ((message: WebviewToHostMessage) => void) | undefined
      const savedContent = 'flowchart TD\n  B[Saved by Flowforge]'
      const workspaceWithFileWatcher = vscode.workspace as unknown as {
        createFileSystemWatcher: ReturnType<typeof vi.fn>
      }
      workspaceWithFileWatcher.createFileSystemWatcher = vi.fn(() => ({
        onDidChange: vi.fn((listener: (uri: vscode.Uri) => void) => {
          fileChangeListener = listener
          return { dispose: vi.fn() }
        }),
        onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
        dispose: vi.fn(),
      }))
      let resolveEdit!: (value: boolean) => void
      vi.mocked(vscode.workspace.applyEdit).mockReturnValue(new Promise(resolve => { resolveEdit = resolve }) as never)
      vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(new TextEncoder().encode(savedContent))
      const document = {
        uri: vscode.Uri.file('/test/watcher-race.mmd'),
        getText: vi.fn(() => 'flowchart TD\n  A[Before save]'),
        lineCount: 2,
        version: 1,
        save: vi.fn().mockResolvedValue(true),
      } as unknown as vscode.TextDocument
      const panel = {
        webview: {
          options: {}, html: '', postMessage: postMessageSpy,
          onDidReceiveMessage: vi.fn((listener: (message: WebviewToHostMessage) => void) => {
            receive = listener
            return { dispose: vi.fn() }
          }),
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as vscode.WebviewPanel
      new FlowforgeEditorProvider(fakeContext).resolveCustomTextEditor(
        document, panel, { isCancellationRequested: false } as vscode.CancellationToken,
      )

      receive!({ type: 'SAVE', payload: { content: savedContent } })
      fileChangeListener!(document.uri)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(postMessageSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTERNAL_FILE_CHANGE' }))
      resolveEdit(true)
    })

    it('suppresses duplicate document events correlated to the same own save', () => {
      capturedWebviewMessageHandler!({
        type: 'SAVE',
        payload: { content: 'flowchart TD\n  A[Test]' },
      })
      capturedOnDidChangeTextDocument!({ document: fakeDocument })
      postMessageSpy.mockClear()
      capturedOnDidChangeTextDocument!({ document: fakeDocument })
      expect(postMessageSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTERNAL_FILE_CHANGE' }))
    })
  })

  describe('THEME_CHANGED', () => {
    const fakeContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext

    const fakeDocument = {
      uri: vscode.Uri.file('/test/diagram.mmd'),
      getText: vi.fn(() => 'flowchart TD\n  A[Test]'),
      lineCount: 2,
    } as unknown as vscode.TextDocument

    let capturedWebviewMessageHandler: ((msg: WebviewToHostMessage) => void) | undefined
    let capturedColorThemeListener: ((e: { kind: number }) => void) | undefined
    let postMessageSpy: ReturnType<typeof vi.fn>

    beforeEach(() => {
      capturedWebviewMessageHandler = undefined
      capturedColorThemeListener = undefined

      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(
        () => ({ dispose: vi.fn() })
      )

      vi.mocked(vscode.window.onDidChangeActiveColorTheme).mockImplementation(
        (listener: (e: { kind: number }) => void) => {
          capturedColorThemeListener = listener
          return { dispose: vi.fn() }
        }
      )

      vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true as never)

      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as unknown as vscode.WorkspaceConfiguration)

      postMessageSpy = vi.fn()

      const fakePanel = {
        webview: {
          options: {},
          html: '',
          onDidReceiveMessage: vi.fn((cb: (msg: WebviewToHostMessage) => void) => {
            capturedWebviewMessageHandler = cb
            return { dispose: vi.fn() }
          }),
          postMessage: postMessageSpy,
        },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      }

      const provider = new FlowforgeEditorProvider(fakeContext)
      provider.resolveCustomTextEditor(
        fakeDocument,
        fakePanel as unknown as vscode.WebviewPanel,
        { isCancellationRequested: false } as vscode.CancellationToken,
      )
    })

    it('sends THEME_CHANGED with "dark" kind on READY when VSCode theme is Dark', () => {
      // activeColorTheme.kind is Dark (2) by default in jest-mock-vscode
      capturedWebviewMessageHandler!({ type: 'READY', payload: {} })
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'THEME_CHANGED', payload: { kind: 'dark' } })
      )
    })

    it('sends THEME_CHANGED with "light" kind on READY when VSCode theme is Light', () => {
      vi.mocked(vscode.window).activeColorTheme = { kind: vscode.ColorThemeKind.Light } as vscode.ColorTheme
      capturedWebviewMessageHandler!({ type: 'READY', payload: {} })
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'THEME_CHANGED', payload: { kind: 'light' } })
      )
    })

    it('sends THEME_CHANGED with "highContrast" for HighContrast theme on READY', () => {
      vi.mocked(vscode.window).activeColorTheme = { kind: vscode.ColorThemeKind.HighContrast } as vscode.ColorTheme
      capturedWebviewMessageHandler!({ type: 'READY', payload: {} })
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'THEME_CHANGED', payload: { kind: 'highContrast' } })
      )
    })

    it('sends THEME_CHANGED when onDidChangeActiveColorTheme event fires', () => {
      capturedWebviewMessageHandler!({ type: 'READY', payload: {} })
      postMessageSpy.mockClear()
      capturedColorThemeListener!({ kind: vscode.ColorThemeKind.Light })
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'THEME_CHANGED',
        payload: { kind: 'light' },
      })
    })
  })

  describe('revisioned panel sessions and transaction-correlated saves', () => {
    interface HostEnvelope {
      type: string
      sessionId?: string
      baseRevision?: number
      eventId?: string
      payload: Record<string, unknown>
    }

    const context = {
      subscriptions: [],
      extensionUri: vscode.Uri.file('/fake/extension'),
    } as unknown as vscode.ExtensionContext

    function makeDocument(source = 'flowchart TD\n  A[Test]', version = 7) {
      let content = source
      return {
        uri: vscode.Uri.file('/test/session.mmd'),
        lineCount: 2,
        version,
        getText: vi.fn(() => content),
        save: vi.fn(async () => true),
        setContent(next: string, nextVersion: number) {
          content = next
          this.version = nextVersion
        },
      }
    }

    function makePanel() {
      let receive: ((message: unknown) => void) | undefined
      let dispose: (() => void) | undefined
      const postMessage = vi.fn()
      const panel = {
        webview: {
          options: {}, html: '', postMessage,
          onDidReceiveMessage: vi.fn((listener: (message: unknown) => void) => {
            receive = listener
            return { dispose: vi.fn() }
          }),
        },
        onDidDispose: vi.fn((listener: () => void) => {
          dispose = listener
          return { dispose: vi.fn() }
        }),
      }
      return {
        panel: panel as unknown as vscode.WebviewPanel,
        postMessage,
        send(message: unknown) { receive!(message) },
        dispose() { dispose!() },
      }
    }

    beforeEach(() => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as unknown as vscode.WorkspaceConfiguration)
      vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(true as never)
    })

    it('initializes separate panels with distinct current session identities and revisions', () => {
      const listeners: Array<(event: { document: vscode.TextDocument }) => void> = []
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(listener => {
        listeners.push(listener as (event: { document: vscode.TextDocument }) => void)
        return { dispose: vi.fn() }
      })
      const document = makeDocument()
      const first = makePanel()
      const second = makePanel()
      const provider = new FlowforgeEditorProvider(context)
      provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, first.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, second.panel, { isCancellationRequested: false } as vscode.CancellationToken)

      first.send({ type: 'READY', payload: {} })
      second.send({ type: 'READY', payload: {} })
      const firstLoad = first.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      const secondLoad = second.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope

      expect(firstLoad.sessionId).toEqual(expect.any(String))
      expect(secondLoad.sessionId).not.toBe(firstLoad.sessionId)
      expect(firstLoad).toMatchObject({ baseRevision: 7, payload: { content: document.getText(), workingRevision: 7, family: 'flowchart' } })
    })

    it('ignores foreign and duplicate saves and applies an accepted transaction once', async () => {
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockReturnValue({ dispose: vi.fn() })
      const document = makeDocument()
      const panel = makePanel()
      new FlowforgeEditorProvider(context).resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      panel.send({ type: 'READY', payload: {} })
      const load = panel.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      const save = { type: 'SAVE', sessionId: load.sessionId, baseRevision: 7, eventId: 'tx-1', payload: { content: 'flowchart TD\n  A[Saved]', workingRevision: 8 } }

      panel.send({ ...save, sessionId: 'foreign-session' })
      panel.send(save)
      panel.send(save)
      await Promise.resolve()

      expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1)
    })

    it('rejects a stale compare-and-swap save with the active host revision', () => {
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockReturnValue({ dispose: vi.fn() })
      const document = makeDocument()
      const panel = makePanel()
      new FlowforgeEditorProvider(context).resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      panel.send({ type: 'READY', payload: {} })
      const load = panel.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      panel.postMessage.mockClear()

      panel.send({ type: 'SAVE', sessionId: load.sessionId, baseRevision: 6, eventId: 'stale', payload: { content: 'stale', workingRevision: 8 } })

      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled()
      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'SAVE_RESULT', sessionId: load.sessionId, eventId: 'stale',
        payload: expect.objectContaining({ success: false, conflict: true, hostRevision: 7, workingRevision: 8 }),
      }))
    })

    it('rejects a competing panel save while the same document revision is being committed', () => {
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockReturnValue({ dispose: vi.fn() })
      vi.mocked(vscode.workspace.applyEdit).mockReturnValue(new Promise(() => {}) as never)
      const document = makeDocument()
      const owner = makePanel()
      const peer = makePanel()
      const provider = new FlowforgeEditorProvider(context)
      provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, owner.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, peer.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      owner.send({ type: 'READY', payload: {} })
      peer.send({ type: 'READY', payload: {} })
      const ownerLoad = owner.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      const peerLoad = peer.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      peer.postMessage.mockClear()

      owner.send({ type: 'SAVE', sessionId: ownerLoad.sessionId, baseRevision: 7, eventId: 'owner-pending', payload: { content: 'owner', workingRevision: 8 } })
      peer.send({ type: 'SAVE', sessionId: peerLoad.sessionId, baseRevision: 7, eventId: 'peer-competing', payload: { content: 'peer', workingRevision: 8 } })

      expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1)
      expect(peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'SAVE_RESULT', eventId: 'peer-competing',
        payload: expect.objectContaining({ success: false, conflict: true }),
      }))
    })

    it('correlates an own-save event while peer panels receive the revisioned change', async () => {
      const listeners: Array<(event: { document: vscode.TextDocument }) => void> = []
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(listener => {
        listeners.push(listener as (event: { document: vscode.TextDocument }) => void)
        return { dispose: vi.fn() }
      })
      let resolveEdit!: (success: boolean) => void
      vi.mocked(vscode.workspace.applyEdit).mockReturnValue(new Promise(resolve => { resolveEdit = resolve }) as never)
      const document = makeDocument()
      const owner = makePanel()
      const peer = makePanel()
      const provider = new FlowforgeEditorProvider(context)
      provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, owner.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      provider.resolveCustomTextEditor(document as unknown as vscode.TextDocument, peer.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      owner.send({ type: 'READY', payload: {} })
      peer.send({ type: 'READY', payload: {} })
      const ownerLoad = owner.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      owner.postMessage.mockClear()
      peer.postMessage.mockClear()

      owner.send({ type: 'SAVE', sessionId: ownerLoad.sessionId, baseRevision: 7, eventId: 'tx-owner', payload: { content: 'flowchart TD\n  A[Saved]', workingRevision: 8 } })
      document.setContent('flowchart TD\n  A[Saved]', 8)
      listeners.forEach(listener => listener({ document: document as unknown as vscode.TextDocument }))
      resolveEdit(true)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(owner.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTERNAL_FILE_CHANGE' }))
      expect(peer.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EXTERNAL_FILE_CHANGE', baseRevision: 8,
        payload: expect.objectContaining({ content: 'flowchart TD\n  A[Saved]', hostRevision: 8, originTransactionId: 'tx-owner' }),
      }))
      expect(owner.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'SAVE_RESULT', eventId: 'tx-owner',
        payload: expect.objectContaining({ success: true, hostRevision: 8, workingRevision: 8 }),
      }))
      expect(document.save).toHaveBeenCalledTimes(1)
    })

    it('suppresses a revisioned own save but forwards a later external edit to its owner', async () => {
      let listener!: (event: { document: vscode.TextDocument }) => void
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(callback => {
        listener = callback as (event: { document: vscode.TextDocument }) => void
        return { dispose: vi.fn() }
      })
      const document = makeDocument()
      const panel = makePanel()
      new FlowforgeEditorProvider(context).resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      panel.send({ type: 'READY', payload: {} })
      const load = panel.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      panel.postMessage.mockClear()

      panel.send({ type: 'SAVE', sessionId: load.sessionId, baseRevision: 7, eventId: 'tx-owner', payload: { content: 'flowchart TD\n  A[Saved]', workingRevision: 8 } })
      document.setContent('flowchart TD\n  A[Saved]', 8)
      listener({ document: document as unknown as vscode.TextDocument })
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(panel.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTERNAL_FILE_CHANGE' }))
      panel.postMessage.mockClear()
      document.setContent('flowchart TD\n  B[External]', 9)
      listener({ document: document as unknown as vscode.TextDocument })

      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EXTERNAL_FILE_CHANGE',
        baseRevision: 9,
        payload: expect.objectContaining({ content: 'flowchart TD\n  B[External]', hostRevision: 9 }),
      }))
    })

    it('does not swallow an unrelated event while a save is pending', () => {
      let listener!: (event: { document: vscode.TextDocument }) => void
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(callback => {
        listener = callback as (event: { document: vscode.TextDocument }) => void
        return { dispose: vi.fn() }
      })
      vi.mocked(vscode.workspace.applyEdit).mockReturnValue(new Promise(() => {}) as never)
      const document = makeDocument()
      const panel = makePanel()
      new FlowforgeEditorProvider(context).resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      panel.send({ type: 'READY', payload: {} })
      const load = panel.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      panel.postMessage.mockClear()
      panel.send({ type: 'SAVE', sessionId: load.sessionId, baseRevision: 7, eventId: 'tx-pending', payload: { content: 'candidate', workingRevision: 8 } })

      document.setContent('external edit', 8)
      listener({ document: document as unknown as vscode.TextDocument })

      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'EXTERNAL_FILE_CHANGE', payload: expect.objectContaining({ content: 'external edit' }),
      }))
    })

    it('reports failed edits and allows a retry transaction without suppressing later external changes', async () => {
      let listener!: (event: { document: vscode.TextDocument }) => void
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(callback => {
        listener = callback as (event: { document: vscode.TextDocument }) => void
        return { dispose: vi.fn() }
      })
      vi.mocked(vscode.workspace.applyEdit).mockResolvedValue(false as never)
      const document = makeDocument()
      const panel = makePanel()
      new FlowforgeEditorProvider(context).resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      panel.send({ type: 'READY', payload: {} })
      const load = panel.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      panel.postMessage.mockClear()
      panel.send({ type: 'SAVE', sessionId: load.sessionId, baseRevision: 7, eventId: 'failed', payload: { content: 'candidate', workingRevision: 8 } })
      await Promise.resolve()
      document.setContent('external', 8)
      listener({ document: document as unknown as vscode.TextDocument })

      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE_RESULT', eventId: 'failed', payload: expect.objectContaining({ success: false }) }))
      expect(panel.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'EXTERNAL_FILE_CHANGE', payload: expect.objectContaining({ content: 'external' }) }))
    })

    it('does not post delayed acknowledgements or events after panel disposal', async () => {
      let listener!: (event: { document: vscode.TextDocument }) => void
      vi.mocked(vscode.workspace.onDidChangeTextDocument).mockImplementation(callback => {
        listener = callback as (event: { document: vscode.TextDocument }) => void
        return { dispose: vi.fn() }
      })
      let resolveEdit!: (success: boolean) => void
      vi.mocked(vscode.workspace.applyEdit).mockReturnValue(new Promise(resolve => { resolveEdit = resolve }) as never)
      const document = makeDocument()
      const panel = makePanel()
      new FlowforgeEditorProvider(context).resolveCustomTextEditor(document as unknown as vscode.TextDocument, panel.panel, { isCancellationRequested: false } as vscode.CancellationToken)
      panel.send({ type: 'READY', payload: {} })
      const load = panel.postMessage.mock.calls.find(([message]) => message.type === 'LOAD')![0] as HostEnvelope
      panel.send({ type: 'SAVE', sessionId: load.sessionId, baseRevision: 7, eventId: 'disposed', payload: { content: 'candidate', workingRevision: 8 } })
      panel.postMessage.mockClear()
      panel.dispose()
      document.setContent('candidate', 8)
      listener({ document: document as unknown as vscode.TextDocument })
      resolveEdit(true)
      await Promise.resolve()

      expect(panel.postMessage).not.toHaveBeenCalled()
    })
  })

  describe('unsupported-family code-preview routing', () => {
    it('keeps the custom editor session open and initializes the detected family without changing bytes', () => {
      const source = 'sequenceDiagram\n  Alice->>Bob: Hello\n'
      const getText = vi.fn(() => source)
      const dispose = vi.fn()
      vi.mocked(detectDiagramFamily).mockReturnValueOnce({ family: 'sequence', declaration: 'sequenceDiagram' })
      let receive: ((message: WebviewToHostMessage) => void) | undefined
      const postMessage = vi.fn()

      const provider = new FlowforgeEditorProvider({
        subscriptions: [],
        extensionUri: vscode.Uri.file('/fake/extension'),
      } as unknown as vscode.ExtensionContext)
      const document = {
        uri: vscode.Uri.file('/test/sequence.mmd'),
        getText,
        version: 3,
      } as unknown as vscode.TextDocument
      const panel = {
        dispose,
        webview: { options: {}, html: '', postMessage, onDidReceiveMessage: vi.fn((listener: (message: WebviewToHostMessage) => void) => { receive = listener; return { dispose: vi.fn() } }) },
        onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as vscode.WebviewPanel

      provider.resolveCustomTextEditor(
        document,
        panel,
        { isCancellationRequested: false } as vscode.CancellationToken,
      )
      receive!({ type: 'READY', payload: {} })

      expect(dispose).not.toHaveBeenCalled()
      expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOAD', payload: expect.objectContaining({ content: source, family: 'sequence' }) }))
      expect(getText()).toBe(source)
      expect(vscode.workspace.applyEdit).not.toHaveBeenCalled()
    })
  })
})
