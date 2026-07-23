import { describe, expect, it } from 'vitest'
import { parseHostToWebviewMessage, parseWebviewToHostMessage } from './validation'

describe('parseWebviewToHostMessage', () => {
  it.each([
    { type: 'SAVE', sessionId: 'session', baseRevision: 2, eventId: 'save-1', payload: { content: 'flowchart TD', workingRevision: 3 } },
    { type: 'READY', payload: {} },
    { type: 'EXPORT', payload: { content: 'flowchart TD', format: 'mmd', subtype: 'file' } },
    { type: 'LOG', payload: { level: 'info', message: 'ready' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value: false, requestId: 'pref-1' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'smartRouting', value: true, requestId: 'pref-2' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'snapToGrid', value: false, requestId: 'pref-grid' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value: 'orthogonal', requestId: 'pref-3' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'layoutStyle', value: 'modern', requestId: 'pref-layout' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'gridStyle', value: 'dots', requestId: 'pref-grid-style' } },
  ])('accepts valid $type messages', message => {
    expect(parseWebviewToHostMessage(message)).toEqual({ ok: true, value: message })
  })

  it.each([
    null,
    'SAVE',
    [],
    { type: 'UNKNOWN', payload: {} },
    { type: 'SAVE', payload: {} },
    { type: 'SAVE', payload: { content: 42 } },
    { type: 'EXPORT', payload: { content: 'diagram', format: 'svg', subtype: 'file' } },
    { type: 'EXPORT', payload: { content: 'diagram', format: 'json', subtype: 'file' } },
    { type: 'IMPORT_JSON', payload: {} },
    { type: 'EXPORT', payload: { content: 'diagram', format: 'mmd', subtype: 'download' } },
    { type: 'LOG', payload: { level: 'debug', message: 'details' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'theme', value: true } },
    { type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value: 'false' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value: false } },
    { type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value: 'automatic' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'layoutStyle', value: 'glass' } },
    { type: 'SET_PREFERENCE', payload: { preference: 'gridStyle', value: 'lines', requestId: 'pref-grid-style' } },
  ])('rejects malformed webview messages', message => {
    expect(parseWebviewToHostMessage(message).ok).toBe(false)
  })
})

describe('parseHostToWebviewMessage', () => {
  it.each([
    { type: 'LOAD', sessionId: 'session', baseRevision: 2, eventId: 'load-1', payload: { content: 'flowchart TD', filename: 'diagram.mmd', autoSave: true, smartRouting: true, snapToGrid: false, gridStyle: 'dots', newEdgeRouteMode: 'curved', layoutStyle: 'modern', family: 'flowchart' } },
    { type: 'THEME_CHANGED', payload: { kind: 'dark' } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: false, value: 'straight', requestId: 'pref-3', error: 'unavailable' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'orthogonal' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'snapToGrid', value: false } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'layoutStyle', success: true, value: 'modern', requestId: 'pref-layout' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'layoutStyle', value: 'modern' } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'gridStyle', success: true, value: 'grid', requestId: 'pref-grid-style' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'gridStyle', value: 'dots' } },
    { type: 'EXTERNAL_FILE_CHANGE', payload: { content: 'flowchart TD', hostRevision: 3 } },
    { type: 'SAVE_RESULT', payload: { success: true, hostRevision: 3 } },
  ])('accepts valid $type messages', message => {
    expect(parseHostToWebviewMessage(message)).toEqual({ ok: true, value: message })
  })

  it.each([
    undefined,
    'LOAD',
    [],
    { type: 'UNKNOWN', payload: {} },
    { type: 'LOAD', payload: {} },
    { type: 'LOAD', payload: { content: 42 } },
    { type: 'THEME_CHANGED', payload: { kind: 'system' } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'smartRouting', success: false } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: false, value: 'automatic' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'automatic' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'snapToGrid', value: 'false' } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'layoutStyle', success: true, value: 'glass', requestId: 'pref-layout' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'layoutStyle', value: 'glass' } },
    { type: 'LOAD', payload: { content: 'flowchart TD', gridStyle: 'lines' } },
    { type: 'PREFERENCE_RESULT', payload: { preference: 'gridStyle', success: true, value: 'lines', requestId: 'pref-grid-style' } },
    { type: 'PREFERENCE_CHANGED', payload: { preference: 'gridStyle', value: 'lines' } },
    { type: 'EXTERNAL_FILE_CHANGE', payload: { content: 'flowchart TD', workingRevision: '3' } },
    { type: 'SAVE_RESULT', payload: {} },
    { type: 'SAVE_RESULT', payload: { success: 'yes' } },
    { type: 'LOAD_JSON', payload: { content: '{"version":1}' } },
    { type: 'HOST_COMMAND', payload: { command: 'export-json' } },
  ])('rejects malformed host messages', message => {
    expect(parseHostToWebviewMessage(message).ok).toBe(false)
  })
})
