import type { Edge, Node } from '@xyflow/react'
import type {
  AdapterDiagnostic,
  CommandResult,
  DiagramFamily,
  LayoutState,
  LayoutStateV2,
} from '../../shared/diagram-contracts'
import type { LoadPayload, MessageRevision } from '../../shared/protocol'
import { classNodeDimensions } from '../features/class-diagram'
import type { ClassAdapterModel } from '../features/class-diagram'
import { applyDagreLayout } from '@/features/flowchart'
import { initializeAdapterProjection } from '../lib/adapterPlatform'
import { createDocumentSession, type DocumentSession } from '../lib/documentSession'
import { readEmbeddedLayoutV2 } from '../lib/embeddedLayout'
import { classDagreStrategy, restoreClassLayout } from '../lib/layoutStrategy'
import { projectFlowchartSession, type FlowchartAdapterModel } from '@/features/flowchart'
import type { FlowEdgeData, FlowNodeData } from '@/features/flowchart'

export interface DocumentBootstrapInput {
  payload: LoadPayload
  envelope: MessageRevision
}

export interface DocumentBootstrapDependencies {
  createId(): string
}

export interface DocumentBootstrapResult {
  family: DiagramFamily
  session: DocumentSession
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
  viewport: LayoutStateV2['viewport']
  shouldFitView: boolean
  hasEmbeddedLayout: boolean
  diagnostics: AdapterDiagnostic[]
}

type ParsedFlowchart = FlowchartAdapterModel

function emptyLayout(family: DiagramFamily): LayoutStateV2 {
  return {
    version: 2,
    diagramFamily: family,
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: {},
    edges: {},
    constraints: [],
    adapterMetadata: {},
  }
}

export function applyLayoutToParsedNodes(
  parsed: ParsedFlowchart,
  layout: LayoutState | LayoutStateV2,
): ParsedFlowchart {
  const dagreNodes = parsed.nodes.length > 0
    ? applyDagreLayout(parsed.nodes, parsed.edges)
    : parsed.nodes
  const dagreById = new Map(dagreNodes.map(node => [node.id, node]))
  const savedFor = (id: string): { x: number; y: number; width?: number; height?: number } | undefined =>
    layout.version === 1 ? layout.nodes[id] : layout.elements[`node:${id}`]

  let shiftX = 0
  let shiftY = 0
  let pinned = 0
  for (const node of parsed.nodes) {
    const saved = savedFor(node.id)
    const computed = dagreById.get(node.id)
    if (!saved || !computed) continue
    shiftX += saved.x - computed.position.x
    shiftY += saved.y - computed.position.y
    pinned += 1
  }
  if (pinned > 0) {
    shiftX /= pinned
    shiftY /= pinned
  }

  const nodes = parsed.nodes.map(node => {
    const saved = savedFor(node.id)
    if (saved) {
      return {
        ...node,
        position: { x: saved.x, y: saved.y },
        ...(saved.width != null ? { width: saved.width } : {}),
        ...(saved.height != null ? { height: saved.height } : {}),
      }
    }
    const computed = dagreById.get(node.id)
    if (!computed) return node
    return { ...computed, position: { x: computed.position.x + shiftX, y: computed.position.y + shiftY } }
  })

  const boxOf = (node: typeof nodes[number]): { x: number; y: number; w: number; h: number } => ({
    x: node.position.x,
    y: node.position.y,
    w: node.width ?? node.measured?.width ?? 160,
    h: node.height ?? node.measured?.height ?? 64,
  })
  const gap = 24
  const placed = nodes.filter(node => savedFor(node.id)).map(boxOf)
  for (const node of nodes) {
    if (savedFor(node.id)) continue
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const box = boxOf(node)
      const hit = placed.find(other =>
        box.x < other.x + other.w + gap && box.x + box.w + gap > other.x
        && box.y < other.y + other.h + gap && box.y + box.h + gap > other.y,
      )
      if (!hit) break
      node.position = { ...node.position, x: hit.x + hit.w + gap }
    }
    placed.push(boxOf(node))
  }
  return { ...parsed, nodes }
}

export function withLayoutApplied<T extends { model: unknown }>(
  family: DiagramFamily,
  projection: T,
  layout: LayoutState | LayoutStateV2,
): T {
  if (family !== 'flowchart') return projection
  const model = projection.model as ParsedFlowchart
  if (!model?.nodes?.length) return projection
  return { ...projection, model: applyLayoutToParsedNodes(model, layout) }
}

export function classLayoutForReopen(
  projection: ReturnType<typeof initializeAdapterProjection>,
  layout: LayoutStateV2,
  hasSavedLayout: boolean,
): LayoutStateV2 {
  const model = projection.model as ClassAdapterModel
  const measured = Object.fromEntries(model.classes.map(definition => {
    const size = classNodeDimensions(definition)
    const persisted = layout.elements[`class:${definition.id}`]
    return [`class:${definition.id}`, {
      x: persisted?.x ?? 0,
      y: persisted?.y ?? 0,
      width: size.width,
      height: size.height,
    }]
  }))
  const elements = hasSavedLayout
    ? restoreClassLayout(projection.canvas, layout.elements, measured)
    : classDagreStrategy.layout({
      canvas: projection.canvas,
      geometry: measured,
      constraints: layout.constraints,
      options: { reset: true },
    }).elements
  return { ...layout, elements: { ...layout.elements, ...elements } }
}

export function bootstrapDocument(
  input: DocumentBootstrapInput,
  dependencies: DocumentBootstrapDependencies,
): CommandResult<DocumentBootstrapResult> {
  const { payload, envelope } = input
  const detectedFamily = payload.family ?? 'flowchart'
  const family = detectedFamily === 'empty' ? 'flowchart' : detectedFamily
  const source = detectedFamily === 'empty' && !payload.content.trim()
    ? 'flowchart TD\n'
    : payload.content
  const embedded = readEmbeddedLayoutV2(source, family)
  const diagnostics: AdapterDiagnostic[] = embedded.error
    ? [{ severity: 'warning', code: 'embedded-layout', message: embedded.error }]
    : []
  const workingRevision = payload.workingRevision ?? 1

  try {
    const projection = initializeAdapterProjection(family, source, workingRevision)
    diagnostics.push(...projection.diagnostics)
    let layout = embedded.layout ?? emptyLayout(family)
    if (family === 'class' && !projection.diagnostics.some(diagnostic => diagnostic.code === 'code-preview-fallback')) {
      layout = classLayoutForReopen(projection, layout, Boolean(embedded.layout))
    }
    const session = createDocumentSession(
      payload.sessionId ?? envelope.sessionId ?? dependencies.createId(),
      payload.hostRevision ?? envelope.baseRevision ?? 1,
      projection,
      layout,
    )
    const fallback = projection.diagnostics.some(diagnostic => diagnostic.code === 'code-preview-fallback')
    if (family !== 'flowchart' || fallback) {
      return {
        ok: true,
        value: { family, session, nodes: [], edges: [], viewport: layout.viewport, shouldFitView: false, hasEmbeddedLayout: Boolean(embedded.layout), diagnostics },
      }
    }

    const parsed = projection.model as ParsedFlowchart
    const laidOut = embedded.layout
      ? applyLayoutToParsedNodes(parsed, embedded.layout)
      : { ...parsed, nodes: parsed.nodes.length > 0 ? applyDagreLayout(parsed.nodes, parsed.edges) : parsed.nodes }
    const projected = projectFlowchartSession(session, laidOut.nodes)
    return {
      ok: true,
      value: {
        family,
        session,
        nodes: projected.nodes,
        edges: projected.edges,
        viewport: layout.viewport,
        shouldFitView: !embedded.layout,
        hasEmbeddedLayout: Boolean(embedded.layout),
        diagnostics,
      },
    }
  } catch (cause) {
    return {
      ok: false,
      code: 'invalid-source',
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    }
  }
}
