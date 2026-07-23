import { useEffect, useRef } from 'react'
import { useStore } from '@/state/createStore'
import { sendToHost } from '../vscode'
import type { DiagramFamily, LayoutState, LayoutStateV2 } from '../../shared/diagram-contracts'
import type { WebviewToHostMessage } from '../../shared/protocol'
import type { Edge, Node } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '@/features/flowchart'
import { embedLayoutInMermaid } from './embeddedLayout'
import { canonicalSourceForExport } from './adapterPlatform'

export const AUTO_SAVE_DEBOUNCE_MS = 1500

export function buildLayoutJson(
  nodes: Node<FlowNodeData>[],
  viewport: { x: number; y: number; zoom: number }
): LayoutState {
  const layoutNodes: LayoutState['nodes'] = {}
  for (const node of nodes) {
    layoutNodes[node.id] = {
      x: node.position.x,
      y: node.position.y,
      ...(node.width != null ? { width: node.width } : {}),
      ...(node.height != null ? { height: node.height } : {}),
    }
  }
  return { version: 1, nodes: layoutNodes, viewport }
}

export function buildLayoutStateV2(
  nodes: Node<FlowNodeData>[],
  viewport: { x: number; y: number; zoom: number },
  family: DiagramFamily,
  retained?: LayoutStateV2,
  activeEdges?: Edge<FlowEdgeData>[],
): LayoutStateV2 {
  const activeNodeHandles = new Set(nodes.map(node => `node:${node.id}`))
  const elements = Object.fromEntries(Object.entries(retained?.elements ?? {}).filter(([handle]) =>
    activeEdges === undefined || !handle.startsWith('node:') || activeNodeHandles.has(handle),
  ))
  for (const node of nodes) {
    elements[`node:${node.id}`] = {
      x: node.position.x,
      y: node.position.y,
      ...(node.width != null ? { width: node.width } : {}),
      ...(node.height != null ? { height: node.height } : {}),
    }
  }
  const activeEdgeHandles = activeEdges
    ? new Set(activeEdges.map(edge => `edge:${edge.id}`))
    : null
  const edges = Object.fromEntries(Object.entries(retained?.edges ?? {}).flatMap(([handle, route]) => {
    if (activeEdgeHandles && !activeEdgeHandles.has(handle)) return []
    const routeMode = route.routeMode === 'manual' ? 'orthogonal' : route.routeMode
    return [[handle, {
      routeMode,
      ...(routeMode === 'orthogonal' && route.waypoints?.length ? { waypoints: route.waypoints } : {}),
      ...(route.sourceSide !== undefined ? { sourceSide: route.sourceSide } : {}),
      ...(route.targetSide !== undefined ? { targetSide: route.targetSide } : {}),
    }]]
  }))
  const adapterMetadata = { ...(retained?.adapterMetadata ?? {}) }
  if (family === 'flowchart') {
    const flowchart = adapterMetadata.flowchart as Record<string, unknown> | undefined
    const { lanes: _legacyLanes, laneOrder: previousLaneOrder, ...rest } = flowchart ?? {}
    const laneIds = nodes.filter(node => node.data.isLane).map(node => node.id)
    const activeLaneIds = new Set(laneIds)
    const retainedOrder = Array.isArray(previousLaneOrder)
      ? previousLaneOrder.filter((id): id is string => typeof id === 'string' && activeLaneIds.has(id))
      : []
    adapterMetadata.flowchart = {
      ...rest,
      laneOrder: [...retainedOrder, ...laneIds.filter(id => !retainedOrder.includes(id))],
    }
  }
  return {
    version: 2,
    diagramFamily: family,
    viewport,
    inspectorVisible: retained?.inspectorVisible !== false,
    elements,
    edges,
    constraints: [...(retained?.constraints ?? [])],
    adapterMetadata,
  }
}

export function buildSaveMessage(): WebviewToHostMessage {
  const state = useStore.getState()
  const { nodes, edges, viewport, documentSession } = state
  const layout = documentSession
    ? buildLayoutStateV2(nodes, viewport, documentSession.family, documentSession.layout, edges)
    : buildLayoutJson(nodes, viewport)
  const semanticSource = canonicalSourceForExport(documentSession, state.codeSource)
  const content = embedLayoutInMermaid(semanticSource, layout)
  const prepared = documentSession && 'prepareDocumentSave' in state
    ? state.prepareDocumentSave(content, layout as LayoutStateV2)
    : documentSession
  const activeSession = prepared ?? documentSession
  const transactionId = crypto.randomUUID()
  return {
    type: 'SAVE',
    ...(activeSession ? {
      sessionId: activeSession.sessionId,
      baseRevision: activeSession.baseHostRevision,
      eventId: transactionId,
    } : {}),
    payload: {
      content,
      ...(activeSession ? {
        sessionId: activeSession.sessionId,
        transactionId,
        expectedHostRevision: activeSession.baseHostRevision,
        workingRevision: activeSession.workingRevision,
      } : {}),
    },
  }
}

export function useAutoSave(enabled: boolean): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const restartTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const state = useStore.getState()
        if (state.syncDirection === 'canvas' || state.documentSession?.conflict) {
          timerRef.current = null
          return
        }
        sendToHost(buildSaveMessage())
        timerRef.current = null
      }, AUTO_SAVE_DEBOUNCE_MS)
    }

    const unsubscribe = useStore.subscribe((state, prevState) => {
      const sessionChanged = state.documentSession !== prevState.documentSession
        && Boolean(state.documentSession?.dirty)
      if (!sessionChanged && state.history.past === prevState.history.past) return
      restartTimer()
    })

    return () => {
      unsubscribe()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled])
}

export function useManualSave(): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        if (useStore.getState().documentSession?.conflict) return
        sendToHost(buildSaveMessage())
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
