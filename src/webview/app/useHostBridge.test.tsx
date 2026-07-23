import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../shared/protocol'
import { useStore } from '@/state/createStore'
import { useHostBridge, type HostTransport } from './useHostBridge'

vi.mock('@/features/flowchart', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/features/flowchart')>(),
  applyDagreLayout: vi.fn((nodes: Array<{ position: { x: number; y: number } }>) => nodes),
}))

function transport(): HostTransport & { sent: WebviewToHostMessage[]; emit(message: HostToWebviewMessage): void } {
  let handler: ((message: HostToWebviewMessage) => void) | undefined
  const sent: WebviewToHostMessage[] = []
  return {
    sent,
    send: message => { sent.push(message) },
    subscribe: next => { handler = next; return () => { handler = undefined } },
    emit: message => handler?.(message),
  }
}

describe('useHostBridge', () => {
  it('sends READY, applies a bootstrapped LOAD, and exposes host state', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))

    expect(host.sent).toEqual([{ type: 'READY', payload: {} }])
    act(() => host.emit({ type: 'LOAD', payload: {
      content: 'flowchart TD\n  A[Start]', filename: 'diagram.mmd', autoSave: false, smartRouting: false, snapToGrid: false, newEdgeRouteMode: 'orthogonal', layoutStyle: 'modern',
      sessionId: 'session-1', hostRevision: 2, workingRevision: 3,
    } }))

    expect(result.current).toMatchObject({ autoSave: false, smartRouting: false, snapToGrid: false, newEdgeRouteMode: 'orthogonal', layoutStyle: 'modern', diagramFamily: 'flowchart', fallbackReason: null })
    expect(host.sent).toEqual([{ type: 'READY', payload: {} }])
    expect(useStore.getState()).toMatchObject({ filename: 'diagram.mmd', documentSession: {
      sessionId: 'session-1', baseHostRevision: 2, workingRevision: 3,
    } })
  })

  it('reverts a rejected new-edge route preference without mutating document state', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))
    act(() => host.emit({ type: 'LOAD', payload: { content: 'flowchart TD', newEdgeRouteMode: 'curved', sessionId: 's', hostRevision: 1 } }))
    const before = {
      codeSource: useStore.getState().codeSource,
      layout: useStore.getState().documentSession?.layout,
      history: useStore.getState().history,
      isDirty: useStore.getState().isDirty,
    }

    act(() => result.current.setNewEdgeRouteMode('straight'))
    expect(result.current.newEdgeRouteMode).toBe('straight')
    const request = host.sent.find(message => message.type === 'SET_PREFERENCE' && message.payload.preference === 'newEdgeRouteMode')!
    if (request.type !== 'SET_PREFERENCE') throw new Error('Expected preference request')
    expect(request.payload).toMatchObject({ preference: 'newEdgeRouteMode', value: 'straight', requestId: expect.any(String) })
    act(() => host.emit({ type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: false, value: 'curved', requestId: request.payload.requestId, error: 'configuration unavailable' } }))

    expect(result.current.newEdgeRouteMode).toBe('curved')
    expect(useStore.getState().codeSource).toBe(before.codeSource)
    expect(useStore.getState().documentSession?.layout).toBe(before.layout)
    expect(useStore.getState().history).toBe(before.history)
    expect(useStore.getState().isDirty).toBe(before.isDirty)
  })

  it('ignores a stale route-default acknowledgement after a newer selection', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))

    act(() => result.current.setNewEdgeRouteMode('straight'))
    act(() => result.current.setNewEdgeRouteMode('orthogonal'))
    const requests = host.sent.filter((message): message is Extract<WebviewToHostMessage, { type: 'SET_PREFERENCE' }> =>
      message.type === 'SET_PREFERENCE' && message.payload.preference === 'newEdgeRouteMode')

    act(() => host.emit({ type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: true, value: 'orthogonal', requestId: requests[1].payload.requestId } }))
    act(() => host.emit({ type: 'PREFERENCE_RESULT', payload: { preference: 'newEdgeRouteMode', success: true, value: 'straight', requestId: requests[0].payload.requestId } }))

    expect(result.current.newEdgeRouteMode).toBe('orthogonal')
  })

  it('keeps a pending local route-default selection when an older global broadcast arrives', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))

    act(() => result.current.setNewEdgeRouteMode('orthogonal'))
    act(() => host.emit({ type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'straight' } }))

    expect(result.current.newEdgeRouteMode).toBe('orthogonal')
  })

  it('applies an independently configured global route default when there is no pending selection', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))

    act(() => host.emit({ type: 'PREFERENCE_CHANGED', payload: { preference: 'newEdgeRouteMode', value: 'straight' } }))

    expect(result.current.newEdgeRouteMode).toBe('straight')
  })

  it('applies an independently configured snap-to-grid setting when there is no pending selection', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))

    act(() => host.emit({ type: 'PREFERENCE_CHANGED', payload: { preference: 'snapToGrid', value: false } }))

    expect(result.current.snapToGrid).toBe(false)
  })

  it('retains an external document as a conflict when the active session is dirty', () => {
    const host = transport()
    renderHook(() => useHostBridge(host))
    act(() => host.emit({ type: 'LOAD', sessionId: 's', baseRevision: 1, payload: { content: 'flowchart TD\n  A[Local]' } }))
    const session = useStore.getState().documentSession!
    useStore.setState({ documentSession: { ...session, dirty: true }, isDirty: true })

    act(() => host.emit({ type: 'EXTERNAL_FILE_CHANGE', eventId: 'external', payload: { content: 'flowchart TD\n  A[External]', hostRevision: 2 } }))

    expect(useStore.getState().documentSession?.conflict).toMatchObject({ content: 'flowchart TD\n  A[External]', hostRevision: 2 })
  })

  it('sends a typed auto-save preference update without mutating diagram state', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))
    const before = useStore.getState().codeSource

    act(() => result.current.setAutoSave(false))

    expect(host.sent).toContainEqual(expect.objectContaining({ type: 'SET_PREFERENCE', payload: expect.objectContaining({ preference: 'autoSave', value: false, requestId: expect.any(String) }) }))
    expect(result.current.autoSave).toBe(false)
    expect(useStore.getState().codeSource).toBe(before)
  })

  it('sends and reverts a layout-style preference without mutating diagram state', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))
    const before = useStore.getState().codeSource

    act(() => result.current.setLayoutStyle('modern'))
    const request = host.sent.find(message => message.type === 'SET_PREFERENCE' && message.payload.preference === 'layoutStyle')
    expect(request).toMatchObject({ type: 'SET_PREFERENCE', payload: { preference: 'layoutStyle', value: 'modern', requestId: expect.any(String) } })
    expect(result.current.layoutStyle).toBe('modern')

    if (!request || request.type !== 'SET_PREFERENCE') throw new Error('Expected layout-style request')
    act(() => host.emit({ type: 'PREFERENCE_RESULT', payload: { preference: 'layoutStyle', success: false, value: 'classic', requestId: request.payload.requestId, error: 'configuration unavailable' } }))

    expect(result.current.layoutStyle).toBe('classic')
    expect(useStore.getState().codeSource).toBe(before)
  })

  it('sends a typed smart-routing preference update without mutating diagram state', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))
    act(() => host.emit({ type: 'LOAD', payload: {
      content: 'flowchart TD\n  A[Start]', sessionId: 'session-1', hostRevision: 2,
    } }))
    const before = {
      codeSource: useStore.getState().codeSource,
      layout: useStore.getState().documentSession?.layout,
      history: useStore.getState().history,
      isDirty: useStore.getState().isDirty,
    }

    act(() => result.current.setSmartRouting(false))

    const request = host.sent.find(message => message.type === 'SET_PREFERENCE' && message.payload.preference === 'smartRouting')
    expect(request).toMatchObject({ type: 'SET_PREFERENCE', payload: { preference: 'smartRouting', value: false, requestId: expect.any(String) } })
    expect(result.current.smartRouting).toBe(false)
    expect(useStore.getState().codeSource).toBe(before.codeSource)
    expect(useStore.getState().documentSession?.layout).toBe(before.layout)
    expect(useStore.getState().history).toBe(before.history)
    expect(useStore.getState().isDirty).toBe(before.isDirty)
  })

  it('reverts Smart routing after a host persistence failure without mutating document state', () => {
    const host = transport()
    const { result } = renderHook(() => useHostBridge(host))
    act(() => host.emit({ type: 'LOAD', payload: { content: 'flowchart TD', smartRouting: true, sessionId: 's', hostRevision: 1 } }))
    const before = {
      codeSource: useStore.getState().codeSource,
      layout: useStore.getState().documentSession?.layout,
      history: useStore.getState().history,
      isDirty: useStore.getState().isDirty,
    }

    act(() => result.current.setSmartRouting(false))
    expect(result.current.smartRouting).toBe(false)
    const request = host.sent.find(message => message.type === 'SET_PREFERENCE' && message.payload.preference === 'smartRouting')
    if (!request || request.type !== 'SET_PREFERENCE') throw new Error('Expected preference request')
    act(() => host.emit({ type: 'PREFERENCE_RESULT', payload: { preference: 'smartRouting', success: false, value: true, requestId: request.payload.requestId, error: 'configuration unavailable' } }))

    expect(result.current.smartRouting).toBe(true)
    expect(host.sent).toContainEqual(expect.objectContaining({ type: 'LOG', payload: expect.objectContaining({ level: 'error' }) }))
    expect(useStore.getState().codeSource).toBe(before.codeSource)
    expect(useStore.getState().documentSession?.layout).toBe(before.layout)
    expect(useStore.getState().history).toBe(before.history)
    expect(useStore.getState().isDirty).toBe(before.isDirty)
  })
})
