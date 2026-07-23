import dagre from '@dagrejs/dagre'
import type { LayoutGeometry, LayoutStrategy, LayoutStrategyInput, LayoutStrategyResult } from '../../../../shared/diagram-contracts'

function validGeometry(value: LayoutGeometry | undefined): value is LayoutGeometry {
  return Boolean(value)
    && Number.isFinite(value!.x)
    && Number.isFinite(value!.y)
    && (value!.width === undefined || Number.isFinite(value!.width))
    && (value!.height === undefined || Number.isFinite(value!.height))
}

function classDagreLayout(input: LayoutStrategyInput): LayoutStrategyResult {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'TB', nodesep: 56, ranksep: 84 })

  const classes = input.canvas.elements.filter(element => element.kind === 'element')
  for (const element of classes) {
    const measured = input.geometry[element.id]
    graph.setNode(element.id, { width: measured?.width ?? 180, height: measured?.height ?? 96 })
  }
  for (const connector of input.canvas.connectors) {
    const type = connector.metadata?.type
    if ((type === 'inheritance' || type === 'realization') && graph.hasNode(connector.source) && graph.hasNode(connector.target)) {
      graph.setEdge(connector.source, connector.target)
    }
  }
  dagre.layout(graph)

  const elements: Record<string, LayoutGeometry> = {}
  for (const element of classes) {
    const retained = input.geometry[element.id]
    if (!input.options.reset && validGeometry(retained)) {
      elements[element.id] = { ...retained }
      continue
    }
    const computed = graph.node(element.id)
    if (!computed) continue
    elements[element.id] = {
      x: computed.x - computed.width / 2,
      y: computed.y - computed.height / 2,
      width: computed.width,
      height: computed.height,
    }
  }

  const containers = input.canvas.elements.filter(element => element.kind === 'container')
  for (const container of [...containers].reverse()) {
    const retained = input.geometry[container.id]
    if (!input.options.reset && validGeometry(retained)) {
      elements[container.id] = { ...retained }
      continue
    }
    const children = input.canvas.elements
      .filter(element => element.parentId === container.id)
      .map(element => elements[element.id])
      .filter((geometry): geometry is LayoutGeometry => Boolean(geometry))
    if (children.length === 0) {
      elements[container.id] = { x: 0, y: 0, width: retained?.width ?? 220, height: retained?.height ?? 140 }
      continue
    }
    const left = Math.min(...children.map(child => child.x)) - 24
    const top = Math.min(...children.map(child => child.y)) - 34
    const right = Math.max(...children.map(child => child.x + (child.width ?? 0))) + 24
    const bottom = Math.max(...children.map(child => child.y + (child.height ?? 0))) + 24
    elements[container.id] = { x: left, y: top, width: right - left, height: bottom - top }
  }
  return { elements }
}

export const classDagreStrategy: LayoutStrategy = Object.freeze({
  id: 'class-dagre',
  layout: classDagreLayout,
})

/**
 * Reapply persisted class positions while using current measured box dimensions.
 * A font/theme/member-count change can make a saved box larger than its saved
 * bounds, so retained positions are reconciled after measurement instead of
 * trusting old dimensions and letting classes overlap on reopen.
 */
export function restoreClassLayout(
  canvas: LayoutStrategyInput['canvas'],
  saved: Readonly<Record<string, LayoutGeometry>>,
  measured: Readonly<Record<string, LayoutGeometry>>,
): Record<string, LayoutGeometry> {
  const elements: Record<string, LayoutGeometry> = {}
  const placed: LayoutGeometry[] = []
  const gap = 24
  const classes = canvas.elements.filter(element => element.kind === 'element')

  for (const element of classes) {
    const persisted = saved[element.id]
    const size = measured[element.id] ?? persisted
    if (!persisted || !size) continue
    const geometry: LayoutGeometry = {
      x: persisted.x,
      y: persisted.y,
      ...(size.width !== undefined ? { width: size.width } : {}),
      ...(size.height !== undefined ? { height: size.height } : {}),
    }
    for (let attempts = 0; attempts < classes.length * 2; attempts += 1) {
      const width = geometry.width ?? 180
      const height = geometry.height ?? 96
      const collision = placed.find(other => geometry.x < other.x + (other.width ?? 180) + gap
        && geometry.x + width + gap > other.x
        && geometry.y < other.y + (other.height ?? 96) + gap
        && geometry.y + height + gap > other.y)
      if (!collision) break
      geometry.x = collision.x + (collision.width ?? 180) + gap
    }
    elements[element.id] = geometry
    placed.push(geometry)
  }

  const containers = canvas.elements.filter(element => element.kind === 'container')
  for (const container of [...containers].reverse()) {
    const children = canvas.elements
      .filter(element => element.parentId === container.id)
      .map(element => elements[element.id])
      .filter((geometry): geometry is LayoutGeometry => Boolean(geometry))
    const persisted = saved[container.id]
    if (children.length === 0) {
      if (persisted) elements[container.id] = { ...persisted }
      continue
    }
    const left = Math.min(...children.map(child => child.x)) - 24
    const top = Math.min(...children.map(child => child.y)) - 34
    const right = Math.max(...children.map(child => child.x + (child.width ?? 180))) + 24
    const bottom = Math.max(...children.map(child => child.y + (child.height ?? 96))) + 24
    elements[container.id] = {
      x: Math.min(persisted?.x ?? left, left),
      y: Math.min(persisted?.y ?? top, top),
      width: Math.max(persisted?.width ?? 0, right - Math.min(persisted?.x ?? left, left)),
      height: Math.max(persisted?.height ?? 0, bottom - Math.min(persisted?.y ?? top, top)),
    }
  }
  return elements
}
