import dagre from '@dagrejs/dagre'
import type {
  LayoutGeometry,
  LayoutStrategy,
  LayoutStrategyInput,
  LayoutStrategyResult,
} from '../../shared/diagram-contracts'
import { classDagreStrategy, restoreClassLayout } from '../features/class-diagram'

export { classDagreStrategy, restoreClassLayout }

export class LayoutStrategyRegistry {
  private readonly strategies: ReadonlyMap<string, LayoutStrategy>

  constructor(strategies: readonly LayoutStrategy[] = []) {
    const byId = new Map<string, LayoutStrategy>()
    for (const strategy of strategies) {
      if (!strategy.id) throw new Error('Layout strategy id is required')
      if (byId.has(strategy.id)) throw new Error(`Duplicate layout strategy: ${strategy.id}`)
      byId.set(strategy.id, strategy)
    }
    this.strategies = byId
  }

  get(id: string): LayoutStrategy | undefined {
    return this.strategies.get(id)
  }
}

function validGeometry(value: LayoutGeometry | undefined): value is LayoutGeometry {
  return Boolean(value)
    && Number.isFinite(value!.x)
    && Number.isFinite(value!.y)
    && (value!.width === undefined || Number.isFinite(value!.width))
    && (value!.height === undefined || Number.isFinite(value!.height))
}

function dagreLayout(input: LayoutStrategyInput): LayoutStrategyResult {
  const graph = new dagre.graphlib.Graph({ compound: true })
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'TD', nodesep: 50, ranksep: 70 })

  for (const element of input.canvas.elements.filter(item => item.kind === 'container')) {
    const retained = input.geometry[element.id]
    graph.setNode(element.id, { width: retained?.width ?? 300, height: retained?.height ?? 200 })
  }
  for (const element of input.canvas.elements.filter(item => item.kind !== 'container')) {
    const retained = input.geometry[element.id]
    graph.setNode(element.id, { width: retained?.width ?? 160, height: retained?.height ?? 64 })
  }
  for (const element of input.canvas.elements) {
    if (element.parentId && graph.hasNode(element.parentId)) graph.setParent(element.id, element.parentId)
  }
  for (const connector of input.canvas.connectors) {
    if (graph.hasNode(connector.source) && graph.hasNode(connector.target)) {
      graph.setEdge(connector.source, connector.target)
    }
  }
  dagre.layout(graph)

  // Retained nodes keep their saved coordinates while the rest take dagre's, and
  // those are two different origins: a file that pins only one node placed every
  // fresh node in dagre space, which drew them overlapping the pinned one.
  // Shifting the computed positions by the average pinned-vs-dagre delta puts
  // both sets back in one coordinate system.
  let shiftX = 0
  let shiftY = 0
  let pinned = 0
  if (!input.options.reset) {
    for (const element of input.canvas.elements) {
      const retained = input.geometry[element.id]
      const computed = graph.node(element.id)
      if (!validGeometry(retained) || !computed) continue
      shiftX += retained.x - (computed.x - computed.width / 2)
      shiftY += retained.y - (computed.y - computed.height / 2)
      pinned += 1
    }
    if (pinned > 0) {
      shiftX /= pinned
      shiftY /= pinned
    }
  }

  const elements: Record<string, LayoutGeometry> = {}
  for (const element of input.canvas.elements) {
    const retained = input.geometry[element.id]
    if (!input.options.reset && validGeometry(retained)) {
      elements[element.id] = { ...retained }
      continue
    }
    const computed = graph.node(element.id)
    if (!computed) continue
    elements[element.id] = {
      x: computed.x - computed.width / 2 + shiftX,
      y: computed.y - computed.height / 2 + shiftY,
      width: computed.width,
      height: computed.height,
    }
  }
  return { elements }
}

export const flowchartDagreStrategy: LayoutStrategy = Object.freeze({
  id: 'dagre',
  layout: dagreLayout,
})

export const layoutStrategyRegistry = new LayoutStrategyRegistry([flowchartDagreStrategy, classDagreStrategy])
