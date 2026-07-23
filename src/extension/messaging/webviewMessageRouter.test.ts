import { describe, expect, it, vi } from 'vitest'
import { PanelSessionCoordinator } from '../editor/panelSession'
import { WebviewMessageRouter } from './webviewMessageRouter'

describe('WebviewMessageRouter', () => {
  it('routes validated READY, LOG, and EXPORT messages without parsing raw input', async () => {
    const post = vi.fn()
    const save = vi.fn()
    const log = vi.fn()
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read: () => ({ content: 'flowchart TD', revision: 4 }) },
      post,
      autoSave: () => true,
      setAutoSave: vi.fn(),
      smartRouting: () => true,
      setSmartRouting: vi.fn(),
      snapToGrid: () => true,
      setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved',
      setNewEdgeRouteMode: vi.fn(),
      theme: () => 'dark',
      newEventId: () => 'event',
      save: { save },
      output: { appendLine: log, show: vi.fn() },
      export: vi.fn(),
    })

    router.route({ type: 'READY', payload: {} })
    router.route({ type: 'LOG', payload: { level: 'error', message: 'broken' } })
    router.route({ type: 'EXPORT', payload: { content: 'x', format: 'mmd', subtype: 'clipboard' } })
    await Promise.resolve()

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOAD', sessionId: 's', baseRevision: 4 }))
    expect(post).toHaveBeenCalledWith({ type: 'THEME_CHANGED', payload: { kind: 'dark' } })
    expect(log).toHaveBeenCalledWith('[ERROR] broken')
  })

  it('persists only the whitelisted auto-save preference without touching the document', async () => {
    const setAutoSave = vi.fn()
    const read = vi.fn(() => ({ content: 'flowchart TD', revision: 4 }))
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read },
      post: vi.fn(),
      autoSave: () => false,
      setAutoSave,
      smartRouting: () => true,
      setSmartRouting: vi.fn(),
      snapToGrid: () => true,
      setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved',
      setNewEdgeRouteMode: vi.fn(),
      theme: () => 'dark',
      newEventId: () => 'event',
      save: { save: vi.fn() },
      output: { appendLine: vi.fn() },
      export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value: true, requestId: 'pref-1' } })
    await Promise.resolve()

    expect(setAutoSave).toHaveBeenCalledWith(true)
    expect(read).not.toHaveBeenCalled()
  })

  it('persists only the whitelisted smart-routing preference without touching the document', async () => {
    const setSmartRouting = vi.fn()
    const read = vi.fn(() => ({ content: 'flowchart TD', revision: 4 }))
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read },
      post: vi.fn(), autoSave: () => false, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting, snapToGrid: () => true, setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: vi.fn(),
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'smartRouting', value: false, requestId: 'pref-1' } })
    await Promise.resolve()

    expect(setSmartRouting).toHaveBeenCalledWith(false)
    expect(read).not.toHaveBeenCalled()
  })

  it('persists only the snap-to-grid preference without touching the document', async () => {
    const setSnapToGrid = vi.fn()
    const read = vi.fn(() => ({ content: 'flowchart TD', revision: 4 }))
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read },
      post: vi.fn(), autoSave: () => false, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: vi.fn(), snapToGrid: () => true, setSnapToGrid,
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: vi.fn(),
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'snapToGrid', value: false, requestId: 'pref-1' } })
    await Promise.resolve()

    expect(setSnapToGrid).toHaveBeenCalledWith(false)
    expect(read).not.toHaveBeenCalled()
  })

  it('persists the new-edge route default globally without touching the document', async () => {
    const setNewEdgeRouteMode = vi.fn()
    const read = vi.fn(() => ({ content: 'flowchart TD', revision: 4 }))
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read },
      post: vi.fn(), autoSave: () => false, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: vi.fn(), snapToGrid: () => true, setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode,
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value: 'orthogonal', requestId: 'pref-1' } })
    await Promise.resolve()

    expect(setNewEdgeRouteMode).toHaveBeenCalledWith('orthogonal')
    expect(read).not.toHaveBeenCalled()
  })

  it('loads and persists the grid style without touching the document', async () => {
    const post = vi.fn()
    const setGridStyle = vi.fn()
    const read = vi.fn(() => ({ content: 'flowchart TD', revision: 4 }))
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read }, post,
      autoSave: () => false, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: vi.fn(), snapToGrid: () => true, setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: vi.fn(), gridStyle: () => 'dots', setGridStyle,
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'READY', payload: {} })
    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'gridStyle', value: 'grid', requestId: 'pref-grid' } })
    await vi.waitFor(() => expect(setGridStyle).toHaveBeenCalledWith('grid'))

    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'LOAD', payload: expect.objectContaining({ gridStyle: 'dots' }) }))
    expect(post).toHaveBeenCalledWith({ type: 'PREFERENCE_RESULT', payload: { preference: 'gridStyle', success: true, value: 'grid', requestId: 'pref-grid' } })
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('restores the persisted grid style after a rejected write', async () => {
    const post = vi.fn()
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read: vi.fn() }, post,
      autoSave: () => true, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: vi.fn(), snapToGrid: () => true, setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: vi.fn(), gridStyle: () => 'dots', setGridStyle: () => Promise.reject(new Error('configuration unavailable')),
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn(), show: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'gridStyle', value: 'grid', requestId: 'pref-grid' } })

    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'PREFERENCE_RESULT', payload: expect.objectContaining({ preference: 'gridStyle', success: false, value: 'dots' }) }))
  })

  it.each([
    ['layoutStyle', 'modern', 'classic'],
    ['gridStyle', 'dots', 'grid'],
  ] as const)('rejects %s updates when its setter is unavailable', async (preference, value, persistedValue) => {
    const post = vi.fn()
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read: vi.fn() }, post,
      autoSave: () => true, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: vi.fn(), snapToGrid: () => true, setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: vi.fn(), layoutStyle: () => 'classic', gridStyle: () => 'grid',
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn(), show: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference, value, requestId: 'missing-setter' } })

    await vi.waitFor(() => expect(post).toHaveBeenCalledWith({ type: 'PREFERENCE_RESULT', payload: expect.objectContaining({ preference, success: false, value: persistedValue }) }))
  })

  it('restores the acknowledged route default after a rejected write', async () => {
    const post = vi.fn()
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read: vi.fn() }, post,
      autoSave: () => true, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: vi.fn(), snapToGrid: () => true, setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: () => Promise.reject(new Error('configuration unavailable')),
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn(), show: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value: 'straight', requestId: 'pref-1' } })
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith({ type: 'PREFERENCE_RESULT', payload: expect.objectContaining({ preference: 'newEdgeRouteMode', success: false, value: 'curved' }) })
    })
  })

  it('reports a rejected Smart-routing write to the active panel with the persisted value', async () => {
    const post = vi.fn()
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read: vi.fn() }, post,
      autoSave: () => true, setAutoSave: vi.fn(), smartRouting: () => true, setSmartRouting: () => Promise.reject(new Error('configuration unavailable')), snapToGrid: () => true, setSnapToGrid: vi.fn(), newEdgeRouteMode: () => 'curved', setNewEdgeRouteMode: vi.fn(),
      theme: () => 'dark', newEventId: () => 'event', save: { save: vi.fn() }, output: { appendLine: vi.fn(), show: vi.fn() }, export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'smartRouting', value: false, requestId: 'pref-1' } })
    await vi.waitFor(() => {
      expect(post).toHaveBeenCalledWith({ type: 'PREFERENCE_RESULT', payload: expect.objectContaining({ preference: 'smartRouting', success: false, value: true }) })
    })
  })

  it.each([
    () => Promise.reject(new Error('configuration unavailable')),
    () => { throw new Error('configuration unavailable') },
  ])('reports asynchronous and synchronous preference persistence failures to the output channel', async setAutoSaveImplementation => {
    const setAutoSave = vi.fn(setAutoSaveImplementation)
    const appendLine = vi.fn()
    const show = vi.fn()
    const router = new WebviewMessageRouter({
      session: new PanelSessionCoordinator({ sessionId: 's', family: 'flowchart', revision: 4 }),
      document: { uri: 'file:///diagram.mmd', filename: 'diagram.mmd', read: vi.fn() },
      post: vi.fn(),
      autoSave: () => false,
      setAutoSave,
      smartRouting: () => true,
      setSmartRouting: vi.fn(),
      snapToGrid: () => true,
      setSnapToGrid: vi.fn(),
      newEdgeRouteMode: () => 'curved',
      setNewEdgeRouteMode: vi.fn(),
      theme: () => 'dark',
      newEventId: () => 'event',
      save: { save: vi.fn() },
      output: { appendLine, show },
      export: vi.fn(),
    })

    router.route({ type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value: true, requestId: 'pref-1' } })
    await vi.waitFor(() => {
      expect(appendLine).toHaveBeenCalledWith('[ERROR] Unable to update Auto save preference: Error: configuration unavailable')
    })

    expect(show).toHaveBeenCalledWith(true)
  })
})
