import type { Node, Edge } from '@xyflow/react'
import type { EdgeStyle, NodeShape } from '../domain/types'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { edgeConnectors, shapeTemplates } from '../domain/mermaidSyntax'
import { allocateCompactIdentifier } from '../domain/compactIdentifiers'

// ── Exported Types ─────────────────────────────────────────────────────────────

export interface ParseSuccess {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
  passthroughLines: string[]
}

export type ParseResult = ParseSuccess | { error: string }

export interface NodeColorDirective {
  id: string
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  textColor?: string
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function decodeNodeLabel(rawLabel: string): string {
  let label = rawLabel
  if (label.startsWith('"') && label.endsWith('"')) {
    try { label = JSON.parse(label) as string } catch { label = label.slice(1, -1) }
  }
  return label.replace(/<br\s*\/?\s*>/gi, '\n')
}

/** Only accept the exact, node-specific style form owned by the color controls. */
export function parseOwnedNodeColorDirective(text: string): NodeColorDirective | null {
  const match = /^\s*style\s+([A-Za-z_][A-Za-z0-9_-]*)\s+(.+?)\s*$/.exec(text)
  if (!match) return null
  const colors: Omit<NodeColorDirective, 'id'> = {}
  for (const part of match[2].split(',')) {
    const property = /^\s*(fill|stroke|color|stroke-width)\s*:\s*(#[0-9a-fA-F]{6}|[1-9][0-9]*px)\s*$/.exec(part)
    if (!property || (property[1] !== 'stroke-width' && !HEX_COLOR.test(property[2]))) return null
    const key = property[1] === 'fill' ? 'fillColor' : property[1] === 'stroke' ? 'strokeColor' : property[1] === 'color' ? 'textColor' : 'strokeWidth'
    if (colors[key] !== undefined) return null
    if (key === 'strokeWidth') colors.strokeWidth = Number.parseInt(property[2], 10)
    else colors[key] = property[2]
  }
  return Object.keys(colors).length === 0 ? null : { id: match[1], ...colors }
}

// ── Module-level constants (computed once at load time) ───────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Shape detection order: longest open token first to avoid prefix conflicts.
// Subgraph is excluded — it uses special block syntax handled separately.
const SHAPE_DETECTION_ORDER = (
  Object.entries(shapeTemplates) as Array<[NodeShape, { open: string; close: string }]>
)
  .filter(([shape]) => shape !== 'subgraph')
  .sort((a, b) => b[1].open.length - a[1].open.length)

// Edge connector regex alternation: longest connector first (-.-> before -->)
const connectorAlt = Object.values(edgeConnectors)
  .sort((a, b) => b.length - a.length)
  .map(escapeRegex)
  .join('|')

// Two separate regexes for labeled vs unlabeled edges to avoid ambiguity
const EDGE_ENDPOINT = '([A-Za-z_][A-Za-z0-9_-]*)'
const LABELED_EDGE_RE = new RegExp(`^${EDGE_ENDPOINT}\\s+(${connectorAlt})\\|([^|]*)\\|\\s+${EDGE_ENDPOINT}$`)
const UNLABELED_EDGE_RE = new RegExp(`^${EDGE_ENDPOINT}\\s+(${connectorAlt})\\s+${EDGE_ENDPOINT}$`)

function parseSubgraphLine(text: string): { id: string; label: string } | null {
  const explicit = /^subgraph\s+([A-Za-z_][A-Za-z0-9_-]*)(?:\s+\[([^\]]*)\])?$/.exec(text)
  if (explicit) return { id: explicit[1], label: decodeNodeLabel(explicit[2] ?? explicit[1]) }
  const titled = /^subgraph\s+"([\s\S]*)"$/.exec(text)
  if (!titled) return null
  const label = titled[1]
  const id = label.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'subgraph'
  return { id, label: decodeNodeLabel(label) }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEdgeStyle(connector: string): EdgeStyle {
  const entry = Object.entries(edgeConnectors).find(([, v]) => v === connector)
  return (entry?.[0] ?? 'arrow') as EdgeStyle
}

function parseNodeLine(text: string): { id: string; shape: NodeShape; label: string } | null {
  const bracketStart = text.search(/[([{]/)
  if (bracketStart === -1) return null

  const id = text.slice(0, bracketStart)
  const rest = text.slice(bracketStart)

  for (const [shape, { open, close }] of SHAPE_DETECTION_ORDER) {
    if (!rest.startsWith(open)) continue
    const closeIdx = rest.lastIndexOf(close)
    if (closeIdx < open.length || closeIdx + close.length !== rest.length) continue
    const label = decodeNodeLabel(rest.slice(open.length, closeIdx))
    return { id, shape, label }
  }

  return null
}

const GENERALIZED_NODE_RE = /^([A-Za-z_][A-Za-z0-9_-]*)\s*@\{([\s\S]*)\}$/

function parseGeneralizedNodeLine(text: string): { id: string; shape: NodeShape; label: string; mermaidShape: string } | null {
  const match = GENERALIZED_NODE_RE.exec(text.trim())
  if (!match) return null
  const [, id, body] = match
  const mermaidShape = body.match(/(?:^|,)\s*shape\s*:\s*["']?([A-Za-z0-9_-]+)/i)?.[1]
    ?? (/(?:^|,)\s*icon\s*:/i.test(body) ? 'icon' : undefined)
    ?? (/(?:^|,)\s*img\s*:/i.test(body) ? 'image' : undefined)
    ?? 'rect'
  const label = decodeNodeLabel(body.match(/(?:^|,)\s*label\s*:\s*(["'])(.*?)\1/i)?.[2] ?? id)
  const approximations: Record<string, NodeShape> = {
    rect: 'rectangle', rectangle: 'rectangle', rounded: 'rounded', stadium: 'pill', pill: 'pill',
    diamond: 'diamond', diam: 'diamond', decision: 'diamond', circle: 'circle',
    hex: 'hexagon', hexagon: 'hexagon', cyl: 'cylinder', cylinder: 'cylinder', database: 'cylinder',
  }
  return { id, shape: approximations[mermaidShape] ?? 'rectangle', label, mermaidShape }
}

interface ParsedChainEdge {
  source: string
  target: string
  style: EdgeStyle
  label?: string
  explicitId?: string
  connector: string
  directionality: NonNullable<FlowEdgeData['directionality']>
  startEndpoint?: NonNullable<FlowEdgeData['startEndpoint']>
  endEndpoint?: NonNullable<FlowEdgeData['endEndpoint']>
  minimumLength: number
}

function endpointMarker(marker: string): NonNullable<FlowEdgeData['startEndpoint']> | undefined {
  return marker === 'o' ? 'circle' : marker === 'x' ? 'cross' : marker ? 'arrow' : undefined
}

function edgeDirectionality(start: string, end: string, line: string): NonNullable<FlowEdgeData['directionality']> {
  if (start === '<' && end === '>') return 'bidirectional'
  if (start === '<') return 'backward'
  if (end === '>') return 'forward'
  return 'none'
}

function edgeStyleFromConnector(connector: string): EdgeStyle {
  if (connector.includes('~')) return 'open'
  if (connector.includes('=')) return 'thick'
  if (connector.includes('.')) return 'dotted'
  if (!/[<>ox]/.test(connector) && /^-+$/.test(connector)) return 'open'
  return 'arrow'
}

function parseEdgeProperties(text: string): { id: string; properties: Record<string, string> } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_-]*)@\{([\s\S]*)\}$/.exec(text.trim())
  if (!match || /\b(?:shape|icon|img|label)\s*:/.test(match[2])) return null
  const properties: Record<string, string> = {}
  for (const part of match[2].split(',')) {
    const property = /^\s*([A-Za-z][A-Za-z0-9_-]*)\s*:\s*["']?([^"']*?)["']?\s*$/.exec(part)
    if (property) properties[property[1]] = property[2]
  }
  return Object.keys(properties).length ? { id: match[1], properties } : null
}

function parseChainEdges(text: string): {
  edges: ParsedChainEdge[]
  declaredNodes: Array<ReturnType<typeof parseNodeLine> | ReturnType<typeof parseGeneralizedNodeLine>>
} | null {
  // This matches Mermaid's link body as one token, including text inserted
  // between dash runs. Keeping the raw body lets Canvas represent it without
  // pretending it can safely rewrite advanced syntax.
  const connector = /\s*(?:([A-Za-z_][A-Za-z0-9_-]*)@)?([<ox]?)([-.=~]+)(?:(?:([>ox])\|([^|]*)\|)|([>ox])|(?:\|([^|]*)\|)|(?:\s+([^|]*?)\s+([-.=~]+)([>ox]?)))?/g
  const matches = [...text.matchAll(connector)]
  if (matches.length === 0) return null
  const endpointText = [
    text.slice(0, matches[0].index),
    ...matches.map((match, index) => text.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? text.length)),
  ]
  const endpointIds = endpointText.map(value => value.trim().match(/^([A-Za-z_][A-Za-z0-9_-]*)/)?.[1])
  if (endpointIds.some(id => !id)) return null
  return {
    edges: matches.map((match, index) => {
      const start = match[2]
      const base = match[3]
      const endWithPipe = match[4] ?? ''
      const pipeAfterEnd = match[5]
      const simpleEnd = match[6] ?? ''
      const pipeLabel = match[7]
      const textLabel = match[8]
      const tail = match[9] ?? ''
      const tailEnd = match[10] ?? ''
      const end = tailEnd || endWithPipe || simpleEnd
      const label = pipeAfterEnd ?? pipeLabel ?? textLabel?.trim()
      const raw = `${start}${base}${endWithPipe || simpleEnd}${textLabel !== undefined ? ` ${textLabel} ${tail}${tailEnd}` : label !== undefined ? `|${label}|` : ''}`
      const dashes = `${base}${tail}`.replace(/[^-=]/g, '')
      return {
        source: endpointIds[index]!, target: endpointIds[index + 1]!,
        style: edgeStyleFromConnector(raw), connector: raw,
        directionality: edgeDirectionality(start, end, raw),
        minimumLength: Math.max(1, dashes.length - 2),
        ...(label !== undefined ? { label } : {}),
        ...(match[1] ? { explicitId: match[1] } : {}),
        ...(endpointMarker(start) ? { startEndpoint: endpointMarker(start) } : {}),
        ...(endpointMarker(end) ? { endEndpoint: endpointMarker(end) } : {}),
      }
    }),
    declaredNodes: endpointText.map(value => parseGeneralizedNodeLine(value.trim()) ?? parseNodeLine(value.trim())),
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSubgraphChildren(
  rawLines: string[],
  startIndex: number,
  parentId: string,
  nodes: Node<FlowNodeData>[],
  edges: Edge<FlowEdgeData>[],
  edgeIds: Set<string>,
  passthroughLines: string[]
): number {
  let i = startIndex
  while (i < rawLines.length) {
    const childLine = rawLines[i].trim()
    i++
    if (childLine === 'end') break
    if (!childLine) continue

    const nestedMatch = parseSubgraphLine(childLine)
    if (nestedMatch) {
      const { id: nestedId, label: nestedLabel } = nestedMatch
      nodes.push({
        id: nestedId,
        type: 'subgraphNode',
        position: { x: 0, y: 0 },
        parentId,
        extent: 'parent' as const,
        data: { label: nestedLabel, shape: 'subgraph', isSubgraph: true },
      })
      i = parseSubgraphChildren(rawLines, i, nestedId, nodes, edges, edgeIds, passthroughLines)
      continue
    }

    if (/^direction\s+(?:TB|TD|BT|RL|LR)$/.test(childLine)) {
      const parent = nodes.find(node => node.id === parentId)
      if (parent) parent.data.direction = childLine.split(/\s+/)[1] as FlowNodeData['direction']
      passthroughLines.push(childLine)
      continue
    }

    if (/^(?:%%|click\b|class(?:Def)?\b|style\b|linkStyle\b)/.test(childLine)) {
      passthroughLines.push(childLine)
      continue
    }

    const childProperties = parseEdgeProperties(childLine)
    if (childProperties) {
      const edge = edges.find(candidate => candidate.id === childProperties.id)
      if (edge) {
        edge.data.properties = childProperties.properties
        edge.data.ownership = 'represented'
      }
      else passthroughLines.push(childLine)
      continue
    }

    const cLabeled = LABELED_EDGE_RE.exec(childLine)
    if (cLabeled) {
      const [, src, conn, lbl, tgt] = cLabeled
      const eid = makeEdgeId(src, tgt, edgeIds)
      edgeIds.add(eid)
      edges.push({ id: eid, source: src, target: tgt, data: { style: getEdgeStyle(conn), label: lbl } })
      continue
    }
    const cUnlabeled = UNLABELED_EDGE_RE.exec(childLine)
    if (cUnlabeled) {
      const [, src, conn, tgt] = cUnlabeled
      const eid = makeEdgeId(src, tgt, edgeIds)
      edgeIds.add(eid)
      edges.push({ id: eid, source: src, target: tgt, data: { style: getEdgeStyle(conn) } })
      continue
    }
    if (/(?:--|==|~~|-\.|<--|o--|x--)/.test(childLine)) {
      const childChain = parseChainEdges(childLine)
      if (childChain) {
        for (const declared of childChain.declaredNodes) {
          if (!declared) continue
          nodes.push({
            id: declared.id, type: 'flowNode', position: { x: 0, y: 0 }, parentId,
            extent: 'parent' as const,
            data: { label: declared.label, shape: declared.shape, ...('mermaidShape' in declared ? { mermaidShape: declared.mermaidShape, ownership: 'represented' as const } : {}) },
          })
        }
        for (const parsedEdge of childChain.edges) {
          const eid = parsedEdge.explicitId ?? makeEdgeId(parsedEdge.source, parsedEdge.target, edgeIds)
          edgeIds.add(eid)
          edges.push({ id: eid, source: parsedEdge.source, target: parsedEdge.target, data: { style: parsedEdge.style, label: parsedEdge.label, explicitId: parsedEdge.explicitId, connector: parsedEdge.connector, directionality: parsedEdge.directionality, startEndpoint: parsedEdge.startEndpoint, endEndpoint: parsedEdge.endEndpoint, minimumLength: parsedEdge.minimumLength, ownership: childChain.edges.length > 1 ? 'represented' : 'editable' } })
        }
        continue
      }
    }
    const childChain = parseChainEdges(childLine)
    if (childChain) {
      for (const declared of childChain.declaredNodes) {
        if (!declared) continue
        nodes.push({
          id: declared.id, type: 'flowNode', position: { x: 0, y: 0 }, parentId,
          extent: 'parent' as const,
          data: {
            label: declared.label, shape: declared.shape,
            ...('mermaidShape' in declared
              ? { mermaidShape: declared.mermaidShape, ownership: 'represented' as const }
              : {}),
          },
        })
      }
      for (const parsedEdge of childChain.edges) {
        const eid = parsedEdge.explicitId ?? makeEdgeId(parsedEdge.source, parsedEdge.target, edgeIds)
        edgeIds.add(eid)
        edges.push({
          id: eid, source: parsedEdge.source, target: parsedEdge.target,
          data: {
            style: parsedEdge.style, label: parsedEdge.label, explicitId: parsedEdge.explicitId,
            connector: parsedEdge.connector, directionality: parsedEdge.directionality,
            startEndpoint: parsedEdge.startEndpoint, endEndpoint: parsedEdge.endEndpoint,
            minimumLength: parsedEdge.minimumLength,
            ownership: childChain.edges.length > 1 ? 'represented' : 'editable',
          },
        })
      }
      continue
    }
    const generalizedChild = parseGeneralizedNodeLine(childLine)
    if (generalizedChild) {
      nodes.push({
        id: generalizedChild.id,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        parentId,
        extent: 'parent' as const,
        data: {
          label: generalizedChild.label,
          shape: generalizedChild.shape,
          mermaidShape: generalizedChild.mermaidShape,
          ownership: 'represented',
        },
      })
      continue
    }

    const childNodeResult = parseNodeLine(childLine)
    if (childNodeResult) {
      nodes.push({
        id: childNodeResult.id,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        parentId,
        extent: 'parent' as const,
        data: { label: childNodeResult.label, shape: childNodeResult.shape },
      })
      continue
    }
    passthroughLines.push(childLine)
  }
  return i
}

// ── Main Export ───────────────────────────────────────────────────────────────

export function parseMermaidFlowchart(input: string): ParseResult {
  try {
    if (!input.trim()) return { error: 'Empty input' }

    const rawLines = input.split(/\r\n|\n|\r/)
    if (!rawLines.some(l => /^(?:flowchart|graph)\b/.test(l.trim()))) {
      return { error: 'Missing flowchart header' }
    }

    const nodes: Node<FlowNodeData>[] = []
    const edges: Edge<FlowEdgeData>[] = []
    const passthroughLines: string[] = []
    const edgeIds = new Set<string>()

    let i = 0
    while (i < rawLines.length) {
      const trimmed = rawLines[i].trim()
      i++

      if (!trimmed || /^(?:flowchart|graph)\b/.test(trimmed)) continue

      if (/^(?:%%|click\b|class(?:Def)?\b|style\b|linkStyle\b)/.test(trimmed)) {
        passthroughLines.push(trimmed)
        continue
      }

      const edgeProperties = parseEdgeProperties(trimmed)
      if (edgeProperties) {
        const edge = edges.find(candidate => candidate.id === edgeProperties.id)
        if (edge) {
          edge.data.properties = edgeProperties.properties
          edge.data.ownership = 'represented'
        }
        else passthroughLines.push(trimmed)
        continue
      }

      // Subgraph block
      const subMatch = parseSubgraphLine(trimmed)
      if (subMatch) {
        const { id, label } = subMatch
        nodes.push({
          id,
          type: 'subgraphNode',
          position: { x: 0, y: 0 },
          data: { label, shape: 'subgraph', isSubgraph: true },
        })
        i = parseSubgraphChildren(rawLines, i, id, nodes, edges, edgeIds, passthroughLines)
        continue
      }

      // Labeled edge
      const labeledMatch = LABELED_EDGE_RE.exec(trimmed)
      if (labeledMatch) {
        const [, source, connectorStr, label, target] = labeledMatch
        const id = makeEdgeId(source, target, edgeIds)
        edgeIds.add(id)
        edges.push({ id, source, target, data: { style: getEdgeStyle(connectorStr), label } })
        continue
      }

      // Unlabeled edge
      const unlabeledMatch = UNLABELED_EDGE_RE.exec(trimmed)
      if (unlabeledMatch) {
        const [, source, connectorStr, target] = unlabeledMatch
        const id = makeEdgeId(source, target, edgeIds)
        edgeIds.add(id)
        edges.push({ id, source, target, data: { style: getEdgeStyle(connectorStr) } })
        continue
      }

      if (/(?:--|==|~~|-\.|<--|o--|x--)/.test(trimmed)) {
        const chain = parseChainEdges(trimmed)
        if (chain) {
          for (const declared of chain.declaredNodes) {
            if (!declared) continue
            nodes.push({
              id: declared.id, type: 'flowNode', position: { x: 0, y: 0 },
              data: { label: declared.label, shape: declared.shape, ...('mermaidShape' in declared ? { mermaidShape: declared.mermaidShape, ownership: 'represented' as const } : {}) },
            })
          }
          for (const parsedEdge of chain.edges) {
            const id = parsedEdge.explicitId ?? makeEdgeId(parsedEdge.source, parsedEdge.target, edgeIds)
            edgeIds.add(id)
            edges.push({ id, source: parsedEdge.source, target: parsedEdge.target, data: { style: parsedEdge.style, label: parsedEdge.label, explicitId: parsedEdge.explicitId, connector: parsedEdge.connector, directionality: parsedEdge.directionality, startEndpoint: parsedEdge.startEndpoint, endEndpoint: parsedEdge.endEndpoint, minimumLength: parsedEdge.minimumLength, ownership: chain.edges.length > 1 ? 'represented' : 'editable' } })
          }
          continue
        }
      }

      // Generalized Mermaid 11 node declarations (including icon and image nodes).
      const generalizedNode = parseGeneralizedNodeLine(trimmed)
      if (generalizedNode) {
        nodes.push({
          id: generalizedNode.id,
          type: 'flowNode',
          position: { x: 0, y: 0 },
          data: {
            label: generalizedNode.label,
            shape: generalizedNode.shape,
            mermaidShape: generalizedNode.mermaidShape,
            ownership: 'represented',
          },
        })
        continue
      }

      // Node declaration
      const nodeResult = parseNodeLine(trimmed)
      if (nodeResult) {
        nodes.push({
          id: nodeResult.id,
          type: 'flowNode',
          position: { x: 0, y: 0 },
          data: { label: nodeResult.label, shape: nodeResult.shape },
        })
        continue
      }

      // Chained links, explicit edge ids, and inline node declarations are represented
      // without claiming that a later targeted edit can safely rewrite the whole line.
      const chain = parseChainEdges(trimmed)
      if (chain) {
        for (const declared of chain.declaredNodes) {
          if (!declared) continue
          nodes.push({
            id: declared.id,
            type: 'flowNode',
            position: { x: 0, y: 0 },
            data: {
              label: declared.label,
              shape: declared.shape,
              ...('mermaidShape' in declared
                ? { mermaidShape: declared.mermaidShape, ownership: 'represented' as const }
                : {}),
            },
          })
        }
        for (const parsedEdge of chain.edges) {
          const id = parsedEdge.explicitId ?? makeEdgeId(parsedEdge.source, parsedEdge.target, edgeIds)
          edgeIds.add(id)
          edges.push({
            id,
            source: parsedEdge.source,
            target: parsedEdge.target,
            data: {
              style: parsedEdge.style, label: parsedEdge.label, explicitId: parsedEdge.explicitId,
              connector: parsedEdge.connector, directionality: parsedEdge.directionality,
              startEndpoint: parsedEdge.startEndpoint, endEndpoint: parsedEdge.endEndpoint,
              minimumLength: parsedEdge.minimumLength,
              ownership: chain.edges.length > 1 ? 'represented' : 'editable',
            },
          })
        }
        continue
      }

      // Passthrough
      passthroughLines.push(trimmed)
    }

    // Mermaid permits referenced-only nodes. Materialize them for Canvas while
    // retaining represented ownership so unsafe shape/label controls stay disabled.
    const representedIds = new Set(nodes.map(node => node.id))
    for (const id of new Set(edges.flatMap(edge => [edge.source, edge.target]))) {
      if (representedIds.has(id)) continue
      nodes.push({
        id,
        type: 'flowNode',
        position: { x: 0, y: 0 },
        data: { label: id, shape: 'rectangle', ownership: 'represented' },
      })
      representedIds.add(id)
    }

    const directivesByNode = new Map<string, NodeColorDirective[]>()
    for (const directive of rawLines.map(parseOwnedNodeColorDirective).filter((candidate): candidate is NodeColorDirective => candidate !== null)) {
      const directives = directivesByNode.get(directive.id) ?? []
      directives.push(directive)
      directivesByNode.set(directive.id, directives)
    }
    for (const [id, directives] of directivesByNode) {
      const matches = nodes.filter(node => node.id === id)
      if (matches.length === 1 && directives.length === 1) {
        const directive = directives[0]
        matches[0].data = {
          ...matches[0].data,
          fillColor: directive.fillColor,
          strokeColor: directive.strokeColor,
          strokeWidth: directive.strokeWidth,
          textColor: directive.textColor,
        }
      }
    }
    return { nodes, edges, passthroughLines }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

function makeEdgeId(source: string, target: string, existing: Set<string>): string {
  return allocateCompactIdentifier('edge', existing)
}
