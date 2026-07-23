import type { Edge, Node, XYPosition } from '@xyflow/react'
import { SemanticValidationError, flowchartNodeConnections, type CommandResult, type EdgeAttachmentSide, type EdgeRouteMode, type FlowchartNodeConnections, type LayoutStateV2, type SemanticHandle } from '../../../../shared/diagram-contracts'
import type { NewEdgeRouteMode } from '../../../../shared/protocol'
import type { DocumentSession } from '../../../lib/documentSession'
import { commitDocumentTransaction, commitSourceOperationTransaction } from '../../../lib/documentSession'
import type { FlowchartSemanticOperation } from '../domain/types'
import type { FlowNodeData } from '../state/types'
import { flowchartCompatibilityAdapter, issueFlowchartOperation, type FlowchartAdapterModel } from './adapter'
import { applyDagreLayout } from './layout'
import { findTopLevelNodesInGroupBody } from './subgraphGeometry'
import { resolveEdgeAttachment } from '../../../lib/floatingEdge'

export interface CommandDependencies {
  createId(): string
}

export interface FlowchartCommandRequest {
  operations: readonly FlowchartSemanticOperation[]
  description: string
  selection?: readonly SemanticHandle[]
  layout?: LayoutStateV2
}

export interface FlowchartSessionNodesResult {
  session: DocumentSession
  nodes: Node<FlowNodeData>[]
  announcement?: string
}

export type FlowchartEdgeRoutingCommandRequest =
  | { kind: 'set-mode'; id: string; routeMode: EdgeRouteMode }
  | { kind: 'set-all-modes'; routeMode: Exclude<EdgeRouteMode, 'manual'> }
  | { kind: 'add-waypoint'; id: string; point: XYPosition }
  | { kind: 'move-waypoint'; id: string; index: number; point: XYPosition }
  | { kind: 'remove-waypoint'; id: string; index: number }

export type FlowchartNodeConnectionCommandRequest =
  | { kind: 'set-policy'; policy: FlowchartNodeConnections }
  | { kind: 'set-edge-side'; edgeId: string; endpoint: 'source' | 'target'; side: EdgeAttachmentSide }
  | { kind: 'retarget-edge'; edgeId: string; endpoint: 'source' | 'target'; nodeId: string; side?: EdgeAttachmentSide }

export type FlowchartLaneCommandRequest =
  | { kind: 'add'; id: string }
  | { kind: 'rename'; id: string; label: string }
  | { kind: 'reorder'; id: string; beforeId: string }
  | { kind: 'delete'; id: string; disposition: 'promote' | 'delete-contents' }
  | { kind: 'set-direction'; id: string; direction: 'TB' | 'TD' | 'BT' | 'RL' | 'LR' }

export interface FlowchartSubgraphCommandRequest {
  id: string
  nodes: Node<FlowNodeData>[]
  position?: XYPosition
}

export interface FlowchartSubgraphPlan {
  newNode: Node<FlowNodeData>
  childNodes: Node<FlowNodeData>[]
  nodes: Node<FlowNodeData>[]
}

export type FlowchartSubgraphMembershipRequest =
  | { kind: 'assign'; nodeId: string; subgraphId: string; position: XYPosition }
  | { kind: 'remove'; nodeId: string; position: XYPosition }

export interface FlowchartSubgraphMembershipPlan {
  nodes: Node<FlowNodeData>[]
  operation: FlowchartSemanticOperation
  description: string
  announcement: string
}

function failure(error: unknown): CommandResult<never> {
  return {
    ok: false,
    code: 'internal-error',
    message: 'Unexpected diagram command failure',
    cause: error,
  }
}

function invalidOperationFailure(error: unknown): CommandResult<never> {
  return {
    ok: false,
    code: 'invalid-operation',
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  }
}

function semanticPlanningFailure(error: unknown): CommandResult<never> {
  return error instanceof SemanticValidationError ? invalidOperationFailure(error) : failure(error)
}

function groupedSourceOperations(session: DocumentSession, operations: readonly FlowchartSemanticOperation[]) {
  type MoveToSubgraphOperation = Extract<FlowchartSemanticOperation, { kind: 'move-node-to-subgraph' }>
  const projection = session.projection as import('../../../../shared/diagram-contracts').AdapterResult<FlowchartAdapterModel>
  const model = projection.model
  const addedSubgraphIds = new Set(operations.flatMap(operation => operation.kind === 'add-subgraph' ? [operation.id] : []))
  const embeddedMoves = new Set<FlowchartSemanticOperation>(operations.filter(
    (operation): operation is MoveToSubgraphOperation => operation.kind === 'move-node-to-subgraph'
      && operation.subgraphId !== null && addedSubgraphIds.has(operation.subgraphId),
  ))
  const issued = operations.flatMap(operation => {
    if (operation.kind !== 'add-subgraph') {
      return embeddedMoves.has(operation) ? [] : issueFlowchartOperation(projection, operation)
    }
    const moves = operations.filter((candidate): candidate is MoveToSubgraphOperation =>
      candidate.kind === 'move-node-to-subgraph' && candidate.subgraphId === operation.id,
    )
    if (moves.length === 0) return issueFlowchartOperation(projection, operation)

    const add = issueFlowchartOperation(projection, operation)
    const insert = add[0]
    if (!insert || insert.kind !== 'insert') throw new SemanticValidationError(`Subgraph ${operation.id} has no stable insertion point`)
    const members = moves.map(move => {
      const node = model.nodes.find(candidate => candidate.id === move.id)
      const owned = model.nodeLines.get(move.id)
      if (!node || !owned || node.data.isSubgraph || model.ambiguousNodeIds.has(move.id)) {
        throw new SemanticValidationError(`Node ${move.id} has no stable membership handle`)
      }
      return owned
    })
    const childIndent = `${model.insertionPrefix.match(/^[\r\n]*(\s*)/)?.[1] ?? '  '}  `
    const block = `${model.insertionPrefix}subgraph ${operation.id} [${operation.label}]${members.map(member => `${model.insertionPrefix}${childIndent}${member.text.trim()}`).join('')}${model.insertionPrefix}end`
    return [
      { ...insert, text: block },
      ...members.map(member => ({
        kind: 'delete' as const,
        range: member.fullLineRange,
        expectedText: session.source.slice(member.fullLineRange.start, member.fullLineRange.end),
        expectedRevision: session.workingRevision,
      })),
    ]
  })
  const seen = new Set<string>()
  return issued.filter(operation => {
    const key = operation.kind === 'insert'
      ? `insert:${operation.at}:${operation.text}`
      : `${operation.kind}:${operation.range.start}:${operation.range.end}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function executeFlowchartCommand(
  session: DocumentSession,
  request: FlowchartCommandRequest,
  dependencies: CommandDependencies,
): CommandResult<DocumentSession> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  let operations
  try {
    operations = groupedSourceOperations(session, request.operations)
  } catch (error) {
    return semanticPlanningFailure(error)
  }
  try {
    const committed = commitSourceOperationTransaction(session, {
      id: dependencies.createId(),
      description: request.description,
      operations,
      selection: request.selection,
      layout: request.layout,
    }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
    return committed.success
      ? { ok: true, value: committed.session }
      : { ok: false, code: /stale|revision/i.test(committed.error) ? 'stale-transaction' : 'invalid-source', message: committed.error }
  } catch (error) {
    return failure(error)
  }
}

export function flowchartLaneOrder(layout: LayoutStateV2): string[] {
  const current = layout.adapterMetadata?.flowchart as { laneOrder?: unknown; lanes?: unknown } | undefined
  const order = current?.laneOrder ?? current?.lanes
  return Array.isArray(order) && order.every(id => typeof id === 'string') ? order : []
}

export function withFlowchartLanes(layout: LayoutStateV2, laneOrder: string[]): LayoutStateV2 {
  const current = layout.adapterMetadata?.flowchart as Record<string, unknown> | undefined
  const { lanes: _legacyLanes, laneOrder: _previousLaneOrder, ...rest } = current ?? {}
  return { ...layout, adapterMetadata: { ...layout.adapterMetadata, flowchart: { ...rest, laneOrder } } }
}

/** Adds the explicit visual default for an edge without changing Mermaid semantics. */
export function withCurvedFlowchartRoute(layout: LayoutStateV2, edgeId: string): LayoutStateV2 {
  return { ...layout, edges: { ...layout.edges, [`edge:${edgeId}`]: { routeMode: 'curved' } } }
}

export function withFlowchartRoute(
  layout: LayoutStateV2,
  edgeId: string,
  routeMode: NewEdgeRouteMode,
  attachment?: { sourceSide?: EdgeAttachmentSide; targetSide?: EdgeAttachmentSide },
): LayoutStateV2 {
  return { ...layout, edges: { ...layout.edges, [`edge:${edgeId}`]: { routeMode, ...attachment } } }
}

export interface FlowchartTextAlignment {
  horizontal?: 'left' | 'center' | 'right'
  vertical?: 'top' | 'center' | 'bottom'
}

export function flowchartTextAlignment(layout: LayoutStateV2, nodeId: string): FlowchartTextAlignment | undefined {
  const flowchart = layout.adapterMetadata?.flowchart as { textAlignments?: unknown } | undefined
  const candidate = flowchart?.textAlignments && typeof flowchart.textAlignments === 'object'
    ? (flowchart.textAlignments as Record<string, unknown>)[nodeId]
    : undefined
  if (!candidate || typeof candidate !== 'object') return undefined
  const value = candidate as Record<string, unknown>
  const horizontal = ['left', 'center', 'right'].includes(String(value.horizontal)) ? value.horizontal as FlowchartTextAlignment['horizontal'] : undefined
  const vertical = ['top', 'center', 'bottom'].includes(String(value.vertical)) ? value.vertical as FlowchartTextAlignment['vertical'] : undefined
  return horizontal || vertical ? { horizontal, vertical } : undefined
}

export function withFlowchartTextAlignment(
  layout: LayoutStateV2,
  nodeId: string,
  alignment: FlowchartTextAlignment,
): LayoutStateV2 {
  const current = layout.adapterMetadata?.flowchart as Record<string, unknown> | undefined
  const textAlignments = current?.textAlignments && typeof current.textAlignments === 'object'
    ? current.textAlignments as Record<string, FlowchartTextAlignment>
    : {}
  const previous = textAlignments[nodeId] ?? {}
  return {
    ...layout,
    adapterMetadata: {
      ...layout.adapterMetadata,
      flowchart: {
        ...current,
        textAlignments: { ...textAlignments, [nodeId]: { ...previous, ...alignment } },
      },
    },
  }
}

export function executeFlowchartTextAlignmentCommand(
  session: DocumentSession,
  nodeId: string,
  alignment: FlowchartTextAlignment,
  dependencies: CommandDependencies,
): CommandResult<DocumentSession> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  if (!session.projection.canvas.elements.some(element => element.id === `node:${nodeId}`)) {
    return { ok: false, code: 'invalid-operation', message: `Unknown node ${nodeId}` }
  }
  const current = flowchartTextAlignment(session.layout, nodeId) ?? {}
  const next = { ...current, ...alignment }
  if (current.horizontal === next.horizontal && current.vertical === next.vertical) {
    return { ok: false, code: 'invalid-operation', message: 'Text alignment did not change' }
  }
  const layoutAfter = withFlowchartTextAlignment(session.layout, nodeId, alignment)
  const committed = commitDocumentTransaction(session, {
    id: dependencies.createId(), family: 'flowchart', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
    forward: [], inverse: [], layoutBefore: session.layout, layoutAfter,
    selectionBefore: session.selection, selectionAfter: [`node:${nodeId}`], description: `Align text in ${nodeId}`,
  }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
  return committed.success
    ? { ok: true, value: committed.session }
    : { ok: false, code: /stale|revision/i.test(committed.error) ? 'stale-transaction' : 'invalid-source', message: committed.error }
}

export function nodeGeometry(node: Node<FlowNodeData>): LayoutStateV2['elements'][string] {
  return { x: node.position.x, y: node.position.y, ...(node.width !== undefined ? { width: node.width } : {}), ...(node.height !== undefined ? { height: node.height } : {}) }
}

function absoluteNodePosition(node: Node<FlowNodeData>, nodeById: ReadonlyMap<string, Node<FlowNodeData>>, seen = new Set<string>()): XYPosition {
  if (!node.parentId || seen.has(node.id)) return node.position
  const parent = nodeById.get(node.parentId)
  if (!parent) return node.position
  seen.add(node.id)
  const parentPosition = absoluteNodePosition(parent, nodeById, seen)
  return { x: parentPosition.x + node.position.x, y: parentPosition.y + node.position.y }
}

function optimalAttachmentSide(source: Node<FlowNodeData>, target: Node<FlowNodeData>, nodeById: ReadonlyMap<string, Node<FlowNodeData>>): EdgeAttachmentSide {
  const toInternalNode = (node: Node<FlowNodeData>) => ({
    measured: { width: node.width ?? node.measured?.width ?? 160, height: node.height ?? node.measured?.height ?? 64 },
    internals: { positionAbsolute: absoluteNodePosition(node, nodeById) },
  })
  return resolveEdgeAttachment(toInternalNode(source) as never, toInternalNode(target) as never).side as EdgeAttachmentSide
}

export function commitFlowchartGeometryTransaction(
  session: DocumentSession,
  beforeNodes: Node<FlowNodeData>[],
  afterNodes: Node<FlowNodeData>[],
  description: string,
  dependencies: CommandDependencies,
): CommandResult<DocumentSession> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
    const beforeById = new Map(beforeNodes.map(node => [node.id, node]))
    const deltas = afterNodes.flatMap(node => {
    const beforeNode = beforeById.get(node.id)
    if (!beforeNode) return []
    const before = session.layout.elements[`node:${node.id}`] ?? nodeGeometry(beforeNode)
    const after = nodeGeometry(node)
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ handle: `node:${node.id}`, before, after }]
    })
    if (deltas.length === 0) return { ok: false, code: 'invalid-operation', message: 'Geometry did not change' }
    const layoutBefore = { ...session.layout, elements: { ...session.layout.elements, ...Object.fromEntries(deltas.map(delta => [delta.handle, delta.before])) } }
    let layoutAfter: LayoutStateV2 = { ...session.layout, elements: { ...session.layout.elements, ...Object.fromEntries(deltas.map(delta => [delta.handle, delta.after])) } }
    const policy = flowchartNodeConnections(session.layout)
    if (policy.mode === 'side' && policy.autoReassign) {
      const affectedNodeIds = new Set(deltas.map(delta => delta.handle.slice('node:'.length)))
      const nodesAfter = new Map(afterNodes.map(node => [node.id, node]))
      const changedEdges: Record<string, LayoutStateV2['edges'][string]> = {}
      const model = session.projection.model as FlowchartAdapterModel
      for (const edge of model.edges) {
        if (!affectedNodeIds.has(edge.source) && !affectedNodeIds.has(edge.target)) continue
        const sourceNode = nodesAfter.get(edge.source)
        const targetNode = nodesAfter.get(edge.target)
        if (!sourceNode || !targetNode) continue
        const handle = `edge:${edge.id}`
        const current = layoutAfter.edges[handle]
        const sourceSide = optimalAttachmentSide(sourceNode, targetNode, nodesAfter)
        const targetSide = optimalAttachmentSide(targetNode, sourceNode, nodesAfter)
        const next = { ...(current ?? { routeMode: 'straight' }) }
        let changed = false
        if (current?.sourceSide !== sourceSide) {
          next.sourceSide = sourceSide
          changed = true
        }
        if (current?.targetSide !== targetSide) {
          next.targetSide = targetSide
          changed = true
        }
        if (changed) changedEdges[handle] = next
      }
      if (Object.keys(changedEdges).length > 0) layoutAfter = { ...layoutAfter, edges: { ...layoutAfter.edges, ...changedEdges } }
    }
    const committed = commitDocumentTransaction(session, {
      id: dependencies.createId(), family: 'flowchart', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
      forward: [], inverse: [], layoutBefore, layoutAfter, selectionBefore: session.selection,
      selectionAfter: afterNodes.filter(node => node.selected).map(node => `node:${node.id}`), description,
    }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
    return committed.success ? { ok: true, value: committed.session } : { ok: false, code: 'invalid-source', message: committed.error }
  } catch (error) { return failure(error) }
}

/** Applies edge-routing policy and persists it as one layout-only document transaction. */
export function executeFlowchartEdgeRoutingCommand(
  session: DocumentSession,
  request: FlowchartEdgeRoutingCommandRequest,
  dependencies: CommandDependencies,
): CommandResult<DocumentSession> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
  if (request.kind === 'set-all-modes') {
    const edges = { ...session.layout.edges }
    let changed = false
    for (const connector of session.projection.canvas.connectors) {
      const current = session.layout.edges[connector.id]
      const { waypoints, ...compatibleFields } = current ?? {}
      const next = {
        ...compatibleFields,
        routeMode: request.routeMode,
        ...(request.routeMode === 'orthogonal' && waypoints ? { waypoints } : {}),
      }
      if (JSON.stringify(current) !== JSON.stringify(next)) changed = true
      edges[connector.id] = next
    }
    if (!changed) return { ok: false, code: 'invalid-operation', message: 'Route modes did not change' }

    const layoutAfter = { ...session.layout, edges }
    const committed = commitDocumentTransaction(session, {
      id: dependencies.createId(), family: 'flowchart', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
      forward: [], inverse: [], layoutBefore: session.layout, layoutAfter,
      selectionBefore: session.selection, selectionAfter: session.selection, description: `Route all edges as ${request.routeMode}`,
    }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
    return committed.success
      ? { ok: true, value: committed.session }
      : { ok: false, code: /stale|revision/i.test(committed.error) ? 'stale-transaction' : 'invalid-source', message: committed.error }
  }

  if (!session.projection.canvas.connectors.some(edge => edge.id === `edge:${request.id}`)) {
    return { ok: false, code: 'invalid-operation', message: `Unknown edge ${request.id}` }
  }

  const handle = `edge:${request.id}`
  const current = session.layout.edges[handle]
  let edgeLayout: LayoutStateV2['edges'][string]
  let description: string
  switch (request.kind) {
    case 'set-mode': {
      const routeMode = request.routeMode === 'manual' ? 'orthogonal' : request.routeMode
      if (current?.routeMode === routeMode && (routeMode === 'orthogonal' || !current.waypoints?.length)) {
        return { ok: false, code: 'invalid-operation', message: 'Route mode did not change' }
      }
      const { waypoints, ...compatibleFields } = current ?? {}
      edgeLayout = { ...compatibleFields, routeMode, ...(routeMode === 'orthogonal' && waypoints ? { waypoints } : {}) }
      description = `Route edge ${request.id} as ${routeMode}`
      break
    }
    case 'add-waypoint':
      edgeLayout = { routeMode: 'orthogonal', waypoints: [...(current?.waypoints ?? []), request.point] }
      description = `Add waypoint to ${request.id}`
      break
    case 'move-waypoint': {
      if (!current?.waypoints?.[request.index]) return { ok: false, code: 'invalid-operation', message: `Unknown waypoint ${request.index}` }
      edgeLayout = { routeMode: 'orthogonal', waypoints: current.waypoints.map((point, index) => index === request.index ? request.point : point) }
      description = `Move waypoint on ${request.id}`
      break
    }
    case 'remove-waypoint': {
      if (!current?.waypoints?.[request.index]) return { ok: false, code: 'invalid-operation', message: `Unknown waypoint ${request.index}` }
      const waypoints = current.waypoints.filter((_, index) => index !== request.index)
      edgeLayout = { routeMode: 'orthogonal', ...(waypoints.length ? { waypoints } : {}) }
      description = `Remove waypoint from ${request.id}`
      break
    }
  }

  const layoutAfter = { ...session.layout, edges: { ...session.layout.edges, [handle]: edgeLayout } }
  const committed = commitDocumentTransaction(session, {
    id: dependencies.createId(), family: 'flowchart', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
    forward: [], inverse: [], layoutBefore: session.layout, layoutAfter,
    selectionBefore: session.selection, selectionAfter: [handle], description,
  }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
  return committed.success
    ? { ok: true, value: committed.session }
    : { ok: false, code: /stale|revision/i.test(committed.error) ? 'stale-transaction' : 'invalid-source', message: committed.error }
  } catch (error) { return failure(error) }
}

/** Persists flowchart endpoint connection policy and attachment sides without rewriting Mermaid. */
export function executeFlowchartNodeConnectionCommand(
  session: DocumentSession,
  request: FlowchartNodeConnectionCommandRequest,
  dependencies: CommandDependencies,
): CommandResult<DocumentSession> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
    if (request.kind === 'retarget-edge') {
      const layoutEdge = session.layout.edges[`edge:${request.edgeId}`] ?? { routeMode: 'straight' }
      const { sourceSide, targetSide, ...route } = layoutEdge
      const layout = {
        ...session.layout,
        edges: {
          ...session.layout.edges,
          [`edge:${request.edgeId}`]: {
            ...route,
            ...(request.endpoint === 'source' ? { sourceSide: request.side, ...(targetSide ? { targetSide } : {}) } : { targetSide: request.side, ...(sourceSide ? { sourceSide } : {}) }),
          },
        },
      }
      return executeFlowchartCommand(session, {
        operations: [{ kind: 'update-edge', id: request.edgeId, [request.endpoint]: request.nodeId }],
        description: `Retarget ${request.endpoint} endpoint of ${request.edgeId}`,
        selection: [`edge:${request.edgeId}`],
        layout,
      }, dependencies)
    }
    let layoutAfter: LayoutStateV2
    let selectionAfter: SemanticHandle[]
    let description: string

    if (request.kind === 'set-policy') {
      const flowchart = session.layout.adapterMetadata?.flowchart
      const currentFlowchart = flowchart && typeof flowchart === 'object' && !Array.isArray(flowchart)
        ? flowchart as Record<string, unknown>
        : {}
      layoutAfter = {
        ...session.layout,
        adapterMetadata: {
          ...session.layout.adapterMetadata,
          flowchart: { ...currentFlowchart, nodeConnections: request.policy },
        },
      }
      selectionAfter = [...session.selection]
      description = 'Set flowchart node connection policy'
    } else {
      if (!session.projection.canvas.connectors.some(edge => edge.id === `edge:${request.edgeId}`)) {
        return { ok: false, code: 'invalid-operation', message: `Unknown edge ${request.edgeId}` }
      }
      const handle = `edge:${request.edgeId}`
      layoutAfter = {
        ...session.layout,
        edges: {
          ...session.layout.edges,
          [handle]: {
            ...(session.layout.edges[handle] ?? { routeMode: 'straight' }),
            [request.endpoint === 'source' ? 'sourceSide' : 'targetSide']: request.side,
          },
        },
      }
      selectionAfter = [handle]
      description = `Set ${request.endpoint} attachment of ${request.edgeId} to ${request.side}`
    }

    const committed = commitDocumentTransaction(session, {
      id: dependencies.createId(), family: 'flowchart', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
      forward: [], inverse: [], layoutBefore: session.layout, layoutAfter,
      selectionBefore: session.selection, selectionAfter, description,
    }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
    return committed.success
      ? { ok: true, value: committed.session }
      : { ok: false, code: /stale|revision/i.test(committed.error) ? 'stale-transaction' : 'invalid-source', message: committed.error }
  } catch (error) { return failure(error) }
}

/** Materializes geometry for nodes created by a parsed-source import without creating a second transaction. */
export function materializeFlowchartSourceImportLayout(
  session: DocumentSession,
  nodes: readonly Node<FlowNodeData>[],
): DocumentSession {
  if (session.family !== 'flowchart') return session
  const elements = { ...session.layout.elements }
  let materialized = false
  for (const node of nodes) {
    const handle = `node:${node.id}`
    if (elements[handle]) continue
    elements[handle] = nodeGeometry(node)
    materialized = true
  }
  if (!materialized) return session
  const layout = { ...session.layout, elements }
  return { ...session, layout, ...(!session.dirty ? { baseLayout: layout } : {}) }
}

/** Applies the automatic layout policy and resets persisted edge routes in one layout-only transaction. */
export function planFlowchartAutoLayout(nodes: Node<FlowNodeData>[], edges: Edge[]): Node<FlowNodeData>[] {
  return applyDagreLayout(nodes, edges)
}

export function executeFlowchartAutoLayoutCommand(
  session: DocumentSession,
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  dependencies: CommandDependencies,
): CommandResult<FlowchartSessionNodesResult> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
  const nextNodes = planFlowchartAutoLayout(nodes, edges)
  const layoutAfter: LayoutStateV2 = {
    ...session.layout,
    elements: {
      ...session.layout.elements,
      ...Object.fromEntries(nextNodes.map(node => [`node:${node.id}`, nodeGeometry(node)])),
    },
    edges: {},
  }
  const geometryChanged = JSON.stringify(layoutAfter.elements) !== JSON.stringify(session.layout.elements)
  const routesChanged = Object.keys(session.layout.edges).length > 0
  if (!geometryChanged && !routesChanged) return { ok: false, code: 'invalid-operation', message: 'Auto-layout did not change geometry or routes' }
  const committed = commitDocumentTransaction(session, {
    id: dependencies.createId(), family: 'flowchart', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
    forward: [], inverse: [], layoutBefore: session.layout, layoutAfter,
    selectionBefore: session.selection,
    selectionAfter: nextNodes.filter(node => node.selected).map(node => `node:${node.id}`),
    description: 'Apply auto-layout and reset routes',
  }, (source, revision) => flowchartCompatibilityAdapter.parse(source, revision))
  return committed.success
    ? { ok: true, value: { session: committed.session, nodes: nextNodes } }
    : { ok: false, code: 'invalid-source', message: committed.error }
  } catch (error) { return failure(error) }
}

function isTopLevelLane(session: DocumentSession, id: string): boolean {
  const model = session.projection.model as FlowchartAdapterModel
  return flowchartLaneOrder(session.layout).includes(id) && !model.nodes.find(node => node.id === id)?.parentId
}

function laneLayoutAfterDeletion(session: DocumentSession, id: string, disposition: 'promote' | 'delete-contents'): LayoutStateV2 {
  const elements = { ...session.layout.elements }
  delete elements[`node:${id}`]
  if (disposition === 'delete-contents') {
    const model = session.projection.model as FlowchartAdapterModel
    const removedIds = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const node of model.nodes) {
        if (node.parentId && removedIds.has(node.parentId) && !removedIds.has(node.id)) {
          removedIds.add(node.id)
          changed = true
        }
      }
    }
    for (const removedId of removedIds) delete elements[`node:${removedId}`]
  }
  return withFlowchartLanes({ ...session.layout, elements }, flowchartLaneOrder(session.layout).filter(laneId => laneId !== id))
}

/** Executes all lane-specific source and metadata decisions inside the flowchart feature. */
export function executeFlowchartLaneCommand(
  session: DocumentSession,
  request: FlowchartLaneCommandRequest,
  dependencies: CommandDependencies,
): CommandResult<DocumentSession> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
    const laneOrder = flowchartLaneOrder(session.layout)
    switch (request.kind) {
    case 'add': {
      const position = { x: 48 + laneOrder.length * 340, y: 48 }
      return executeFlowchartCommand(session, {
        operations: [{ kind: 'add-subgraph', id: request.id, label: 'Lane' }],
        description: `Add lane ${request.id}`,
        selection: [`node:${request.id}`],
        layout: withFlowchartLanes({ ...session.layout, elements: { ...session.layout.elements, [`node:${request.id}`]: { ...position, width: 300, height: 240 } } }, [...laneOrder, request.id]),
      }, dependencies)
    }
    case 'rename':
      if (!isTopLevelLane(session, request.id)) return { ok: false, code: 'invalid-operation', message: `Unknown lane ${request.id}` }
      if ((session.projection.model as FlowchartAdapterModel).nodes.find(node => node.id === request.id)?.data.label === request.label) {
        return { ok: false, code: 'invalid-operation', message: 'Lane label did not change' }
      }
      return executeFlowchartCommand(session, { operations: [{ kind: 'rename-subgraph', id: request.id, label: request.label }], description: `Rename lane ${request.id}`, selection: [`node:${request.id}`] }, dependencies)
    case 'reorder': {
      if (request.id === request.beforeId || !isTopLevelLane(session, request.id) || !isTopLevelLane(session, request.beforeId)) {
        return { ok: false, code: 'invalid-operation', message: 'Both lanes must be distinct top-level lanes' }
      }
      const nextLaneOrder = laneOrder.filter(laneId => laneId !== request.id)
      nextLaneOrder.splice(nextLaneOrder.indexOf(request.beforeId), 0, request.id)
      return executeFlowchartCommand(session, {
        operations: [{ kind: 'reorder-top-level-subgraph', id: request.id, beforeId: request.beforeId }],
        description: `Reorder lane ${request.id}`,
        selection: [`node:${request.id}`],
        layout: withFlowchartLanes(session.layout, nextLaneOrder),
      }, dependencies)
    }
    case 'delete':
      if (!isTopLevelLane(session, request.id)) return { ok: false, code: 'invalid-operation', message: `Unknown lane ${request.id}` }
      return executeFlowchartCommand(session, {
        operations: [{ kind: 'delete-subgraph', id: request.id, disposition: request.disposition }],
        description: `${request.disposition === 'promote' ? 'Promote children from' : 'Delete'} lane ${request.id}`,
        selection: [],
        layout: laneLayoutAfterDeletion(session, request.id, request.disposition),
      }, dependencies)
    case 'set-direction':
      if (!(session.projection.model as FlowchartAdapterModel).nodes.find(node => node.id === request.id)?.data.isSubgraph) {
        return { ok: false, code: 'invalid-operation', message: `Unknown subgraph ${request.id}` }
      }
      return executeFlowchartCommand(session, { operations: [{ kind: 'set-subgraph-direction', id: request.id, direction: request.direction }], description: `Set ${request.id} direction ${request.direction}`, selection: [`node:${request.id}`] }, dependencies)
    }
  } catch (error) { return failure(error) }
}

/** Creates the visual group, determines membership, and atomically commits source and layout changes. */
export function planFlowchartSubgraph(request: FlowchartSubgraphCommandRequest): FlowchartSubgraphPlan {
  const position = request.position
    ? { x: Math.round(request.position.x / 24) * 24, y: Math.round(request.position.y / 24) * 24 }
    : { x: 60 + request.nodes.length * 20, y: 60 }
  const newNode: Node<FlowNodeData> = {
    id: request.id, position, type: 'subgraphNode', width: 300, height: 200,
    data: { label: 'Group', shape: 'subgraph', isSubgraph: true },
  }
  const members = findTopLevelNodesInGroupBody(newNode, request.nodes)
  const memberIds = new Set(members.map(node => node.id))
  const childNodes = members.map(node => ({ ...node, parentId: request.id, position: { x: node.position.x - newNode.position.x, y: node.position.y - newNode.position.y }, extent: 'parent' as const }))
  return { newNode, childNodes, nodes: [...request.nodes.filter(node => !memberIds.has(node.id)), newNode, ...childNodes] }
}

export function executeFlowchartSubgraphCommand(
  session: DocumentSession,
  request: FlowchartSubgraphCommandRequest,
  dependencies: CommandDependencies,
): CommandResult<FlowchartSessionNodesResult> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
    const { newNode, childNodes, nodes } = planFlowchartSubgraph(request)
    const layout = {
    ...session.layout,
    elements: {
      ...session.layout.elements,
      [`node:${request.id}`]: nodeGeometry(newNode),
      ...Object.fromEntries(childNodes.map(node => [`node:${node.id}`, nodeGeometry(node)])),
    },
    }
    const result = executeFlowchartCommand(session, {
    operations: [{ kind: 'add-subgraph', id: request.id, label: 'Group' }, ...childNodes.map(node => ({ kind: 'move-node-to-subgraph' as const, id: node.id, subgraphId: request.id }))],
    description: `Add subgraph ${request.id}`,
    selection: [`node:${request.id}`],
    layout,
    }, dependencies)
    return result.ok ? { ok: true, value: { session: result.value, nodes } } : result
  } catch (error) { return failure(error) }
}

function isPositionOutsideSubgraphBounds(position: XYPosition, node: Node<FlowNodeData>, subgraph: Node<FlowNodeData>): boolean {
  const width = node.width ?? node.measured?.width ?? 80
  const height = node.height ?? node.measured?.height ?? 40
  const groupWidth = subgraph.width ?? subgraph.measured?.width ?? 300
  const groupHeight = subgraph.height ?? subgraph.measured?.height ?? 200
  const center = { x: position.x + width / 2, y: position.y + height / 2 }
  return center.x < subgraph.position.x
    || center.x > subgraph.position.x + groupWidth
    || center.y < subgraph.position.y
    || center.y > subgraph.position.y + groupHeight
}

/** Calculates a subgraph membership change before either local history or source transaction application. */
export function planFlowchartSubgraphMembership(
  nodes: Node<FlowNodeData>[],
  request: FlowchartSubgraphMembershipRequest,
): FlowchartSubgraphMembershipPlan | null {
  const node = nodes.find(candidate => candidate.id === request.nodeId)
  if (!node) return null
  if (request.kind === 'assign') {
    const group = nodes.find(candidate => candidate.id === request.subgraphId && candidate.data.isSubgraph)
    if (!group || node.parentId === request.subgraphId) return null
    const updated = { ...node, parentId: request.subgraphId, position: request.position, extent: 'parent' as const }
    const remaining = nodes.filter(candidate => candidate.id !== request.nodeId)
    const groupIndex = remaining.findIndex(candidate => candidate.id === request.subgraphId)
    if (groupIndex === -1) return null
    return {
      nodes: [...remaining.slice(0, groupIndex + 1), updated, ...remaining.slice(groupIndex + 1)],
      operation: { kind: 'move-node-to-subgraph', id: request.nodeId, subgraphId: request.subgraphId },
      description: `Move ${request.nodeId} to ${request.subgraphId}`,
      announcement: `Moved to ${group.data.label ?? 'group'}`,
    }
  }
  if (!node.parentId) return null
  const parent = nodes.find(candidate => candidate.id === node.parentId)
  if (!parent || !isPositionOutsideSubgraphBounds(request.position, node, parent)) return null
  const { parentId: _parentId, extent: _extent, ...topLevelNode } = node
  return {
    nodes: nodes.map(candidate => candidate.id === request.nodeId ? { ...topLevelNode, position: request.position } : candidate),
    operation: { kind: 'move-node-to-subgraph', id: request.nodeId, subgraphId: null },
    description: `Move ${request.nodeId} to top level`,
    announcement: 'Moved to top level',
  }
}

/** Commits source and geometry for assigning or removing a node from a subgraph. */
export function executeFlowchartSubgraphMembershipCommand(
  session: DocumentSession,
  nodes: Node<FlowNodeData>[],
  request: FlowchartSubgraphMembershipRequest,
  dependencies: CommandDependencies,
): CommandResult<FlowchartSessionNodesResult> {
  if (session.family !== 'flowchart') return { ok: false, code: 'unsupported-family', message: 'This command requires a flowchart document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
    const plan = planFlowchartSubgraphMembership(nodes, request)
    if (!plan) return { ok: false, code: 'invalid-operation', message: 'Subgraph membership did not change' }
    const layout = {
    ...session.layout,
    elements: {
      ...session.layout.elements,
      [`node:${request.nodeId}`]: { ...session.layout.elements[`node:${request.nodeId}`], ...request.position },
    },
    }
    const result = executeFlowchartCommand(session, {
    operations: [plan.operation], description: plan.description, selection: [`node:${request.nodeId}`], layout,
    }, dependencies)
    return result.ok ? { ok: true, value: { session: result.value, nodes: plan.nodes, announcement: plan.announcement } } : result
  } catch (error) { return failure(error) }
}
