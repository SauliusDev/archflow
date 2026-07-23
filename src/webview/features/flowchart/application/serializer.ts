import type { Node, Edge } from '@xyflow/react'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { edgeConnectors, shapeTemplates } from '../domain/mermaidSyntax'

export interface SerializeInput {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
  passthroughLines?: string[]
}

function serializeNodeLabel(label: string): string {
  const mermaidLabel = label.replace(/\r\n?|\n/g, '<br/>')
  return /\r|\n/.test(label) ? JSON.stringify(mermaidLabel) : mermaidLabel
}

function serializeBlock(
  node: Node<FlowNodeData>,
  input: SerializeInput,
  indent: string
): string[] {
  if (node.data.shape === 'subgraph') {
    const children = input.nodes.filter(n => n.parentId === node.id)
    return [
      `${indent}subgraph ${node.id} [${serializeNodeLabel(node.data.label)}]`,
      ...children.flatMap(c => serializeBlock(c, input, indent + '  ')),
      `${indent}end`,
    ]
  }
  if (node.data.mermaidShape) {
    return [`${indent}${node.id}@{ shape: ${node.data.mermaidShape}, label: ${JSON.stringify(node.data.label.replace(/\r\n?|\n/g, '<br/>'))} }`]
  }
  const { open, close } = shapeTemplates[node.data.shape]
  return [`${indent}${node.id}${open}${serializeNodeLabel(node.data.label)}${close}`]
}

export function serialize(input: SerializeInput): string {
  const lines: string[] = ['flowchart TD']

  const childNodeIds = new Set(
    input.nodes.filter(n => n.parentId !== undefined).map(n => n.id)
  )

  for (const node of input.nodes) {
    if (childNodeIds.has(node.id)) continue
    lines.push(...serializeBlock(node, input, '  '))
  }

  for (const edge of input.edges) {
    const { source, target, data } = edge
    const connector = edgeConnectors[data?.style ?? 'arrow']
    const label = data?.label
    if (label) {
      lines.push(`  ${source} ${edge.id}@${connector}|${label}| ${target}`)
    } else {
      lines.push(`  ${source} ${edge.id}@${connector} ${target}`)
    }
  }

  for (const node of input.nodes) {
    const { fillColor, strokeColor, strokeWidth, textColor } = node.data
    if (!fillColor && !strokeColor && !strokeWidth && !textColor) continue
    const parts: string[] = []
    if (fillColor) parts.push(`fill:${fillColor}`)
    if (strokeColor) parts.push(`stroke:${strokeColor}`)
    if (strokeWidth) parts.push(`stroke-width:${strokeWidth}px`)
    if (textColor) parts.push(`color:${textColor}`)
    lines.push(`  style ${node.id} ${parts.join(',')}`)
  }

  if (input.passthroughLines) {
    for (const line of input.passthroughLines) {
      lines.push(`  ${line}`)
    }
  }

  return lines.join('\n') + '\n'
}
