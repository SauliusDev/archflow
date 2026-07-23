import { useCallback, useEffect, useRef, useState } from 'react'
import type { DiagramFamily } from '../../shared/diagram-contracts'
import type { HostToWebviewMessage, LayoutStyle, NewEdgeRouteMode, SetPreferencePayload, WebviewToHostMessage } from '../../shared/protocol'
import { initializeAdapterProjection } from '../lib/adapterPlatform'
import { readEmbeddedLayoutV2 } from '../lib/embeddedLayout'
import { useStore } from '@/state/createStore'
import { onHostMessage, sendToHost } from '../vscode'
import { bootstrapDocument, withLayoutApplied } from './documentBootstrap'

export interface HostTransport {
  send(message: WebviewToHostMessage): void
  subscribe(handler: (message: HostToWebviewMessage) => void): () => void
}

export interface HostBridgeState {
  autoSave: boolean
  setAutoSave(value: boolean): void
  smartRouting: boolean
  setSmartRouting(value: boolean): void
  snapToGrid: boolean
  setSnapToGrid(value: boolean): void
  newEdgeRouteMode: NewEdgeRouteMode
  setNewEdgeRouteMode(value: NewEdgeRouteMode): void
  layoutStyle: LayoutStyle
  setLayoutStyle(value: LayoutStyle): void
  diagramFamily: DiagramFamily
  fallbackReason: string | null
}

const vscodeTransport: HostTransport = { send: sendToHost, subscribe: onHostMessage }

function fallbackReason(): string | null {
  return useStore.getState().documentSession?.projection.diagnostics
    .find(diagnostic => diagnostic.code === 'code-preview-fallback')?.message ?? null
}

export function useHostBridge(transport: HostTransport = vscodeTransport): HostBridgeState {
  const [autoSave, setAutoSaveState] = useState(true)
  const [smartRouting, setSmartRoutingState] = useState(true)
  const [snapToGrid, setSnapToGridState] = useState(true)
  const [newEdgeRouteMode, setNewEdgeRouteModeState] = useState<NewEdgeRouteMode>('curved')
  const [layoutStyle, setLayoutStyleState] = useState<LayoutStyle>('classic')
  const [diagramFamily, setDiagramFamily] = useState<DiagramFamily>('flowchart')
  const pendingPreferenceRequests = useRef<Partial<Record<SetPreferencePayload['preference'], string>>>({})
  const storeFallbackReason = useStore(state => state.documentSession?.projection.diagnostics
    .find(diagnostic => diagnostic.code === 'code-preview-fallback')?.message ?? null)
  const setAutoSave = useCallback((value: boolean): void => {
    const requestId = crypto.randomUUID()
    pendingPreferenceRequests.current.autoSave = requestId
    setAutoSaveState(value)
    transport.send({ type: 'SET_PREFERENCE', payload: { preference: 'autoSave', value, requestId } })
  }, [transport])
  const setSmartRouting = useCallback((value: boolean): void => {
    const requestId = crypto.randomUUID()
    pendingPreferenceRequests.current.smartRouting = requestId
    setSmartRoutingState(value)
    transport.send({ type: 'SET_PREFERENCE', payload: { preference: 'smartRouting', value, requestId } })
  }, [transport])
  const setSnapToGrid = useCallback((value: boolean): void => {
    const requestId = crypto.randomUUID()
    pendingPreferenceRequests.current.snapToGrid = requestId
    setSnapToGridState(value)
    transport.send({ type: 'SET_PREFERENCE', payload: { preference: 'snapToGrid', value, requestId } })
  }, [transport])
  const setNewEdgeRouteMode = useCallback((value: NewEdgeRouteMode): void => {
    const requestId = crypto.randomUUID()
    pendingPreferenceRequests.current.newEdgeRouteMode = requestId
    setNewEdgeRouteModeState(value)
    transport.send({ type: 'SET_PREFERENCE', payload: { preference: 'newEdgeRouteMode', value, requestId } })
  }, [transport])
  const setLayoutStyle = useCallback((value: LayoutStyle): void => {
    const requestId = crypto.randomUUID()
    pendingPreferenceRequests.current.layoutStyle = requestId
    setLayoutStyleState(value)
    transport.send({ type: 'SET_PREFERENCE', payload: { preference: 'layoutStyle', value, requestId } })
  }, [transport])

  useEffect(() => {
    transport.send({ type: 'READY', payload: {} })
    return transport.subscribe(message => {
      switch (message.type) {
        case 'LOAD': {
          pendingPreferenceRequests.current = {}
          if (message.payload.filename) useStore.getState().setFilename(message.payload.filename)
          if (message.payload.autoSave !== undefined) setAutoSaveState(message.payload.autoSave)
          if (message.payload.smartRouting !== undefined) setSmartRoutingState(message.payload.smartRouting)
          if (message.payload.snapToGrid !== undefined) setSnapToGridState(message.payload.snapToGrid)
          if (message.payload.newEdgeRouteMode !== undefined) setNewEdgeRouteModeState(message.payload.newEdgeRouteMode)
          if (message.payload.layoutStyle !== undefined) setLayoutStyleState(message.payload.layoutStyle)
          const result = bootstrapDocument({ payload: message.payload, envelope: message }, { createId: () => crypto.randomUUID() })
          if (!result.ok) {
            transport.send({ type: 'LOG', payload: { level: 'error', message: `Load: failed to parse: ${result.message}` } })
            break
          }
          const bootstrapped = result.value
          for (const diagnostic of bootstrapped.diagnostics) {
            if (diagnostic.code === 'embedded-layout') {
              transport.send({ type: 'LOG', payload: { level: 'error', message: `Failed to parse embedded layout: ${diagnostic.message}` } })
            }
          }
          setDiagramFamily(bootstrapped.family)
          const state = useStore.getState()
          state.initializeDocumentSession(bootstrapped.session)
          if (bootstrapped.family !== 'flowchart' || fallbackReason()) {
            useStore.setState({ nodes: [], edges: [], isDirty: false })
            break
          }
          const parsed = bootstrapped.session.projection.model as Record<string, unknown>
          state.importFromCode({ ...parsed, nodes: bootstrapped.nodes, edges: bootstrapped.edges } as never)
          if (bootstrapped.hasEmbeddedLayout) state.requestViewportRestore(bootstrapped.viewport)
          else {
            state.setViewport({ x: 0, y: 0, zoom: 1 })
            if (bootstrapped.shouldFitView) state.requestFitView()
          }
          break
        }
        case 'THEME_CHANGED':
          break
        case 'PREFERENCE_RESULT':
          if (pendingPreferenceRequests.current[message.payload.preference] !== message.payload.requestId) break
          delete pendingPreferenceRequests.current[message.payload.preference]
          switch (message.payload.preference) {
            case 'autoSave':
              setAutoSaveState(message.payload.value)
              break
            case 'smartRouting':
              setSmartRoutingState(message.payload.value)
              break
            case 'snapToGrid':
              setSnapToGridState(message.payload.value)
              break
            case 'newEdgeRouteMode':
              setNewEdgeRouteModeState(message.payload.value)
              break
            case 'layoutStyle':
              setLayoutStyleState(message.payload.value)
              break
          }
          if (!message.payload.success) {
            const preferenceName = message.payload.preference === 'autoSave' ? 'Auto save' : message.payload.preference === 'smartRouting' ? 'Smart routing' : message.payload.preference === 'snapToGrid' ? 'Snap to grid' : message.payload.preference === 'newEdgeRouteMode' ? 'New-edge route mode' : 'Canvas design'
            transport.send({ type: 'LOG', payload: { level: 'error', message: `Unable to update ${preferenceName} preference: ${message.payload.error ?? 'unknown error'}` } })
          }
          break
        case 'PREFERENCE_CHANGED':
          if (pendingPreferenceRequests.current[message.payload.preference]) break
          switch (message.payload.preference) {
            case 'snapToGrid':
              setSnapToGridState(message.payload.value)
              break
            case 'newEdgeRouteMode':
              setNewEdgeRouteModeState(message.payload.value)
              break
            case 'layoutStyle':
              setLayoutStyleState(message.payload.value)
              break
          }
          break
        case 'EXTERNAL_FILE_CHANGE': {
          const current = useStore.getState().documentSession
          if (!current) break
          const hostRevision = message.payload.hostRevision ?? message.baseRevision ?? current.baseHostRevision + 1
          const eventId = message.payload.eventId ?? message.eventId ?? crypto.randomUUID()
          const embedded = readEmbeddedLayoutV2(message.payload.content, current.family)
          if (embedded.error) transport.send({ type: 'LOG', payload: { level: 'warn', message: `External layout ignored: ${embedded.error}` } })
          try {
            const projection = initializeAdapterProjection(current.family, message.payload.content, hostRevision)
            const layout = embedded.layout ?? {
              version: 2 as const, diagramFamily: current.family, viewport: { x: 0, y: 0, zoom: 1 },
              elements: {}, edges: {}, constraints: [],
            }
            useStore.getState().acceptExternalDocument(withLayoutApplied(current.family, projection, layout), layout, hostRevision, eventId)
            if (useStore.getState().documentSession?.conflict) {
              transport.send({ type: 'LOG', payload: { level: 'warn', message: 'External changes retained for explicit conflict resolution.' } })
            }
          } catch (error) {
            transport.send({ type: 'LOG', payload: { level: 'error', message: `External file change: failed to parse: ${error instanceof Error ? error.message : String(error)}` } })
          }
          break
        }
        case 'SAVE_RESULT': {
          if (message.payload.success) {
            const session = useStore.getState().documentSession
            const sessionId = message.payload.sessionId ?? message.sessionId
            const transactionId = message.payload.transactionId ?? message.eventId
            const workingRevision = message.payload.savedWorkingRevision ?? message.payload.workingRevision
            const hostRevision = message.payload.hostRevision ?? message.baseRevision
            if (session && sessionId && transactionId && workingRevision !== undefined && hostRevision !== undefined) {
              useStore.getState().acknowledgeDocumentSave({
                eventId: message.eventId ?? transactionId, sessionId, transactionId, workingRevision, hostRevision,
              })
            } else {
              useStore.getState().clearDirty()
            }
          } else if (message.payload.conflict && message.payload.externalContent) {
            const session = useStore.getState().documentSession
            if (session) {
              const hostRevision = message.payload.hostRevision ?? message.baseRevision ?? session.baseHostRevision + 1
              try {
                const projection = initializeAdapterProjection(session.family, message.payload.externalContent, hostRevision)
                const embedded = readEmbeddedLayoutV2(message.payload.externalContent, session.family)
                useStore.getState().acceptExternalDocument(projection, embedded.layout ?? session.layout, hostRevision, message.eventId ?? crypto.randomUUID())
              } catch (error) {
                const message = 'Unable to process the external conflict response'
                useStore.setState({ announcement: 'Something went wrong. Please try again.' })
                transport.send({ type: 'LOG', payload: { level: 'error', message: JSON.stringify({
                  code: 'internal-error', context: 'process external save conflict', message,
                }) } })
                void error
              }
            }
          } else {
            transport.send({ type: 'LOG', payload: { level: 'error', message: `Auto-save failed: ${message.payload.error ?? 'unknown error'}` } })
          }
          break
        }
        default: {
          const exhaustive: never = message
          void exhaustive
        }
      }
    })
  }, [transport])

  return { autoSave, setAutoSave, smartRouting, setSmartRouting, snapToGrid, setSnapToGrid, newEdgeRouteMode, setNewEdgeRouteMode, layoutStyle, setLayoutStyle, diagramFamily, fallbackReason: storeFallbackReason }
}
