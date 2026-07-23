import type { Edge, Node } from '@xyflow/react'
import type {
  AdapterDescriptor,
  AdapterResult,
  ConcreteSourceHandle,
  SourceOperation,
  SourceRange,
} from '../../../../shared/diagram-contracts'
import { SemanticValidationError } from '../../../../shared/diagram-contracts'
import type { FlowchartOwnership, FlowchartSemanticOperation, NodeShape } from '../domain/types'
import type { FlowEdgeData, FlowNodeData } from '../state/types'
import { parseMermaidFlowchart, parseOwnedNodeColorDirective, type NodeColorDirective } from './parser'
import { edgeConnectors, shapeTemplates } from '../domain/mermaidSyntax'

interface OwnedRange {
  range: SourceRange
  fullLineRange: SourceRange
  text: string
}

export type FlowchartConstructKind =
  | 'declaration' | 'node' | 'edge' | 'subgraph' | 'direction'
  | 'style' | 'class' | 'class-def' | 'property' | 'comment'
  | 'frontmatter' | 'config' | 'click' | 'preserved-only'

export interface FlowchartSourceConstruct {
  identity: string
  kind: FlowchartConstructKind
  ownership: FlowchartOwnership
  range: SourceRange
  text: string
  parentIdentity?: string
}

export interface FlowchartSourceMap {
  declaration?: FlowchartSourceConstruct
  constructs: FlowchartSourceConstruct[]
  diagnostics: Array<{ code: string; message: string; range: SourceRange }>
}

export interface FlowchartAdapterModel {
  nodes: Node<FlowNodeData>[]
  edges: Edge<FlowEdgeData>[]
  passthroughLines: string[]
  nodeLabels: Map<string, OwnedRange>
  nodeLines: Map<string, OwnedRange>
  nodeShapeNames: Map<string, OwnedRange>
  nodeColorStyles: Map<string, OwnedRange & { colors: Omit<NodeColorDirective, 'id'> }>
  nodeColorStyleLines: Map<string, OwnedRange[]>
  nodeColorUnavailableIds: Set<string>
  edgeLines: Map<string, OwnedRange>
  subgraphBlocks: Map<string, { opening: OwnedRange; closing: OwnedRange }>
  ambiguousNodeIds: Set<string>
  insertionPoint: number
  insertionPrefix: string
  sourceMap: FlowchartSourceMap
}

export type { FlowchartOwnership, FlowchartSemanticOperation } from '../domain/types'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineSpans(source: string): Array<{ text: string; start: number; end: number; fullEnd: number }> {
  const spans: Array<{ text: string; start: number; end: number; fullEnd: number }> = []
  const matcher = /.*(?:\r\n|\n|\r|$)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(source)) !== null) {
    if (match[0] === '') break
    const newlineLength = match[0].endsWith('\r\n') ? 2 : (/[\r\n]$/.test(match[0]) ? 1 : 0)
    spans.push({ text: match[0].slice(0, match[0].length - newlineLength), start: match.index, end: match.index + match[0].length - newlineLength, fullEnd: match.index + match[0].length })
  }
  return spans
}

function buildSourceMap(source: string, spans: ReturnType<typeof lineSpans>): FlowchartSourceMap {
  const constructs: FlowchartSourceConstruct[] = []
  const diagnostics: FlowchartSourceMap['diagnostics'] = []
  const nodeIds = new Set<string>()
  const subgraphIds = new Set<string>()
  const edgeIds = new Set<string>()
  const edgeOccurrences = new Map<string, number>()
  const stack: Array<{ identity: string; range: SourceRange }> = []
  let declaration: FlowchartSourceConstruct | undefined
  let inFrontmatter = false

  const add = (kind: FlowchartConstructKind, ownership: FlowchartOwnership, identity: string, span: typeof spans[number], parentIdentity?: string) => {
    const construct = { kind, ownership, identity, range: { start: span.start, end: span.end }, text: span.text, ...(parentIdentity ? { parentIdentity } : {}) }
    constructs.push(construct)
    return construct
  }
  const malformed = (message: string, span: typeof spans[number]) => {
    diagnostics.push({ code: 'malformed-flowchart-source', message, range: { start: span.start, end: span.end } })
  }

  for (let index = 0; index < spans.length; index++) {
    const span = spans[index]
    const trimmed = span.text.trim()
    if (trimmed === '---') {
      inFrontmatter = !inFrontmatter
      add('frontmatter', 'preserved-only', `frontmatter:${index}`, span)
      continue
    }
    if (inFrontmatter) {
      add('frontmatter', 'preserved-only', `frontmatter:${index}`, span)
      continue
    }
    if (!trimmed) continue
    const declarationMatch = /^(?:flowchart|graph)\s+(TD|TB|BT|RL|LR)\b/i.exec(trimmed)
    if (declarationMatch) {
      const construct = add('declaration', 'represented', `declaration:${declaration ? index : 0}`, span)
      if (!declaration) declaration = construct
      continue
    }
    if (trimmed.startsWith('%%{')) {
      add('config', 'preserved-only', `config:${index}`, span)
      continue
    }
    if (trimmed.startsWith('%%')) {
      add('comment', 'preserved-only', `comment:${index}`, span)
      continue
    }
    if (/^click\b/.test(trimmed)) {
      add('click', 'preserved-only', `click:${index}`, span)
      continue
    }
    const subgraphMatch = /^subgraph\s+(?:([A-Za-z_][A-Za-z0-9_-]*)(?:\s+\[[^\]]*\])?|"([\s\S]*)")\s*$/i.exec(trimmed)
    if (subgraphMatch) {
      const id = subgraphMatch[1]
        ?? subgraphMatch[2].replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
      if (subgraphIds.has(id) || nodeIds.has(id)) malformed(`Ambiguous subgraph identity: ${id}`, span)
      subgraphIds.add(id)
      const identity = `subgraph:${id}`
      add('subgraph', 'represented', identity, span, stack.at(-1)?.identity)
      stack.push({ identity, range: { start: span.start, end: span.end } })
      continue
    }
    if (trimmed === 'end') {
      if (!stack.pop()) malformed('Unexpected subgraph end', span)
      continue
    }
    const directionMatch = /^direction\s+(TD|TB|BT|RL|LR)\s*$/i.exec(trimmed)
    if (directionMatch) {
      add('direction', 'represented', `direction:${stack.at(-1)?.identity ?? 'root'}:${index}`, span, stack.at(-1)?.identity)
      continue
    }
    if (trimmed.includes('@{') && !/^([A-Za-z_][A-Za-z0-9_-]*)@\{[\s\S]*\}\s*$/.test(trimmed)) {
      malformed('Malformed generalized node or property syntax', span)
      continue
    }
    const generalizedMatch = /^([A-Za-z_][A-Za-z0-9_-]*)@\{[\s\S]*\}\s*$/.exec(trimmed)
    if (generalizedMatch) {
      const id = generalizedMatch[1]
      if (edgeIds.has(id)) {
        add('property', 'preserved-only', `property:${id}:${index}`, span, `edge:${id}`)
        continue
      }
      if (nodeIds.has(id) || subgraphIds.has(id)) malformed(`Ambiguous node identity: ${id}`, span)
      nodeIds.add(id)
      add('node', 'represented', `node:${id}`, span, stack.at(-1)?.identity)
      continue
    }
    const edgeMatch = /^([A-Za-z_][A-Za-z0-9_-]*)(?:::[A-Za-z0-9_-]+)?\s+(?:([A-Za-z_][A-Za-z0-9_-]*)@)?(?:-->|-.->|==>|---|--[^\n]*?-->)\s*(?:\|[^|]*\|\s*)?([A-Za-z_][A-Za-z0-9_-]*)\b/.exec(trimmed)
    if (edgeMatch) {
      const [, sourceId, explicitId, targetId] = edgeMatch
      const base = `${sourceId}:${targetId}`
      const occurrence = edgeOccurrences.get(base) ?? 0
      edgeOccurrences.set(base, occurrence + 1)
      const identity = explicitId ? `edge:${explicitId}` : `edge:${base}:${occurrence}`
      if (explicitId && edgeIds.has(explicitId)) malformed(`Ambiguous edge identity: ${explicitId}`, span)
      if (explicitId) edgeIds.add(explicitId)
      const connectorCount = (trimmed.match(/(?:-->|-.->|==>|---|<-->|o--o|x--x)/g) ?? []).length
      add('edge', explicitId || connectorCount > 1 ? 'represented' : 'editable', identity, span, stack.at(-1)?.identity)
      continue
    }
    if (/^style\s+/.test(trimmed)) {
      add('style', 'represented', `style:${index}`, span)
      continue
    }
    if (/^classDef\s+/.test(trimmed)) {
      add('class-def', 'represented', `class-def:${index}`, span)
      continue
    }
    if (/^class\s+/.test(trimmed) || /:::[A-Za-z0-9_-]+/.test(trimmed)) {
      add('class', 'represented', `class:${index}`, span)
      continue
    }
    const legacyNode = /^([A-Za-z_][A-Za-z0-9_-]*)(?:\s*)(?:\[|\(\[|\(\(|\(|\{\{|\{|\[\()/.exec(trimmed)
    if (legacyNode) {
      const id = legacyNode[1]
      if (nodeIds.has(id) || subgraphIds.has(id)) malformed(`Ambiguous node identity: ${id}`, span)
      nodeIds.add(id)
      add('node', 'editable', `node:${id}`, span, stack.at(-1)?.identity)
      continue
    }
    add('preserved-only', 'preserved-only', `preserved:${index}`, span, stack.at(-1)?.identity)
  }

  for (const unclosed of stack) {
    diagnostics.push({ code: 'unterminated-subgraph', message: `Unterminated subgraph ${unclosed.identity.slice('subgraph:'.length)}`, range: unclosed.range })
  }
  if (inFrontmatter) diagnostics.push({ code: 'unterminated-frontmatter', message: 'Unterminated frontmatter block', range: { start: 0, end: source.length } })
  return { declaration, constructs, diagnostics }
}

function buildModel(source: string): FlowchartAdapterModel {
  const parsed = parseMermaidFlowchart(source)
  if ('error' in parsed) throw new Error(parsed.error)

  const spans = lineSpans(source)
  const sourceMap = buildSourceMap(source, spans)
  const structuralDiagnostics = sourceMap.diagnostics.filter(diagnostic => !/^Ambiguous /.test(diagnostic.message))
  if (structuralDiagnostics.length > 0) throw new Error(structuralDiagnostics.map(diagnostic => diagnostic.message).join('; '))
  // The legacy parser can mistake directive payloads for nodes. The compatibility
  // boundary keeps them opaque instead of projecting them into Canvas.
  const nodes = parsed.nodes.filter(node => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(node.id))
  const nodeCounts = new Map<string, number>()
  for (const node of nodes) nodeCounts.set(node.id, (nodeCounts.get(node.id) ?? 0) + 1)
  const ambiguousNodeIds = new Set([...nodeCounts].filter(([, count]) => count > 1).map(([id]) => id))
  const nodeLabels = new Map<string, OwnedRange>()
  const nodeLines = new Map<string, OwnedRange>()
  const nodeShapeNames = new Map<string, OwnedRange>()
  const nodeColorStyles = new Map<string, OwnedRange & { colors: Omit<NodeColorDirective, 'id'> }>()
  const nodeColorStyleLines = new Map<string, OwnedRange[]>()
  const nodeColorUnavailableIds = new Set<string>()

  for (const node of nodes) {
    if (ambiguousNodeIds.has(node.id) || nodeLabels.has(node.id)) continue
    const idPattern = escapeRegex(node.id)
    const inlineDeclaration = new RegExp(`(?:^|\\s)${idPattern}(?=@|\\[|\\(|\\{)|^subgraph\\s+${idPattern}(?=\\s|\\[|$)`)
    const standaloneDeclaration = new RegExp(`^${idPattern}(?=@|\\[|\\(|\\{)|^subgraph\\s+${idPattern}(?=\\s|\\[|$)`)
    const candidates = spans.filter(span => {
      const trimmed = span.text.trim()
      return (span.text.includes(node.data.label) || (node.data.label.includes('\n') && /<br\s*\/?\s*>/i.test(span.text)))
        && inlineDeclaration.test(trimmed)
    })
    if (candidates.length !== 1) {
      ambiguousNodeIds.add(node.id)
      continue
    }
    const span = candidates[0]
    // Whole-line mutations (delete and color directives) are unsafe for an
    // inline declaration because they can also rewrite its edge or neighbour.
    if (standaloneDeclaration.test(span.text.trim())) {
      nodeLines.set(node.id, {
        range: { start: span.start, end: span.end },
        fullLineRange: { start: span.start, end: span.fullEnd },
        text: span.text,
      })
    }
    const labelProperty = node.data.mermaidShape
      ? /\blabel\s*:\s*("(?:\\.|[^"\\])*")/.exec(span.text)
      : null
    const template = node.data.shape === 'subgraph' ? undefined : shapeTemplates[node.data.shape]
    const labelIndex = labelProperty
      ? (labelProperty.index ?? 0) + labelProperty[0].lastIndexOf(labelProperty[1])
      : template
        ? span.text.indexOf(template.open, span.text.indexOf(node.id) + node.id.length) + template.open.length
        : span.text.indexOf(node.data.label)
    const labelText = labelProperty?.[1]
      ?? (template && labelIndex >= template.open.length
        ? span.text.slice(labelIndex, span.text.lastIndexOf(template.close))
        : node.data.label)
    if (labelIndex >= 0 && labelText && span.text.indexOf(labelText, labelIndex + labelText.length) < 0) {
      nodeLabels.set(node.id, {
        range: { start: span.start + labelIndex, end: span.start + labelIndex + labelText.length },
        fullLineRange: { start: span.start, end: span.fullEnd },
        text: labelText,
      })
    }
    if (node.data.mermaidShape) {
      const shapeProperty = /\bshape\s*:\s*["']?([A-Za-z0-9_-]+)/.exec(span.text)
      if (shapeProperty) {
        const shapeIndex = span.text.indexOf(shapeProperty[1], shapeProperty.index)
        nodeShapeNames.set(node.id, {
          range: { start: span.start + shapeIndex, end: span.start + shapeIndex + shapeProperty[1].length },
          fullLineRange: { start: span.start, end: span.fullEnd },
          text: shapeProperty[1],
        })
      }
    }
  }
  for (const node of nodes) {
    if (ambiguousNodeIds.has(node.id) || !nodeLines.has(node.id)) nodeColorUnavailableIds.add(node.id)
  }

  const colorStyleCandidates = new Map<string, Array<OwnedRange & { colors: Omit<NodeColorDirective, 'id'> }>>()
  const sourceOwnedNodeStyleIds = new Set<string>()
  for (const span of spans) {
    const styleTarget = /^\s*style\s+([A-Za-z_][A-Za-z0-9_-]*)\b/.exec(span.text)?.[1]
    if (styleTarget && nodes.some(node => node.id === styleTarget)) {
      const lines = nodeColorStyleLines.get(styleTarget) ?? []
      lines.push({
        range: { start: span.start, end: span.end },
        fullLineRange: { start: span.start, end: span.fullEnd },
        text: span.text,
      })
      nodeColorStyleLines.set(styleTarget, lines)
    }
    const directive = parseOwnedNodeColorDirective(span.text)
    if (styleTarget && nodes.some(node => node.id === styleTarget) && !directive) {
      sourceOwnedNodeStyleIds.add(styleTarget)
      continue
    }
    if (!directive || !nodes.some(node => node.id === directive.id)) continue
    const candidates = colorStyleCandidates.get(directive.id) ?? []
    candidates.push({
      range: { start: span.start, end: span.end },
      fullLineRange: { start: span.start, end: span.fullEnd },
      text: span.text,
      colors: { fillColor: directive.fillColor, strokeColor: directive.strokeColor, strokeWidth: directive.strokeWidth, textColor: directive.textColor },
    })
    colorStyleCandidates.set(directive.id, candidates)
  }
  for (const [id, candidates] of colorStyleCandidates) {
    if (candidates.length === 1 && !sourceOwnedNodeStyleIds.has(id)) {
      nodeColorStyles.set(id, candidates[0])
      nodeColorUnavailableIds.delete(id)
    }
    else nodeColorUnavailableIds.add(id)
  }
  for (const id of sourceOwnedNodeStyleIds) {
    nodeColorUnavailableIds.add(id)
    const node = nodes.find(candidate => candidate.id === id)
    if (node) {
      delete node.data.fillColor
      delete node.data.strokeColor
      delete node.data.strokeWidth
      delete node.data.textColor
    }
  }

  const edgeLines = new Map<string, OwnedRange>()
  const mappedEdgeIds = new Set<string>()
  for (const span of spans) {
    const trimmed = span.text.trim()
    const line = parseMermaidFlowchart(`flowchart TD\n${trimmed}`)
    if ('error' in line || line.edges.length !== 1) continue
    const parsedLine = line.edges[0]
    const edge = parsed.edges.find(candidate => candidate.data?.ownership !== 'represented'
      && !mappedEdgeIds.has(candidate.id)
      && candidate.source === parsedLine.source
      && candidate.target === parsedLine.target
      && (parsedLine.data?.explicitId === undefined || candidate.id === parsedLine.data.explicitId))
    if (!edge) continue
    mappedEdgeIds.add(edge.id)
    edgeLines.set(edge.id, {
      range: { start: span.start, end: span.end },
      fullLineRange: { start: span.start, end: span.fullEnd },
      text: span.text,
    })
  }

  const subgraphBlocks = new Map<string, { opening: OwnedRange; closing: OwnedRange }>()
  const subgraphStack: Array<{ id: string; opening: OwnedRange }> = []
  for (const span of spans) {
    const match = span.text.trim().match(/^subgraph\s+(?:([A-Za-z_][A-Za-z0-9_-]*)|"([\s\S]*)")/)
    if (match) {
      const id = match[1] ?? match[2].replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
      subgraphStack.push({
        id,
        opening: { range: { start: span.start, end: span.end }, fullLineRange: { start: span.start, end: span.fullEnd }, text: span.text },
      })
      continue
    }
    if (span.text.trim() === 'end') {
      const open = subgraphStack.pop()
      if (open) subgraphBlocks.set(open.id, {
        opening: open.opening,
        closing: { range: { start: span.start, end: span.end }, fullLineRange: { start: span.start, end: span.fullEnd }, text: span.text },
      })
    }
  }

  const topLevelConstructs = sourceMap.constructs.filter(construct =>
    !construct.parentIdentity && ['node', 'edge', 'subgraph', 'direction'].includes(construct.kind),
  )
  const topLevelEnds = topLevelConstructs.map(construct => {
    if (construct.kind !== 'subgraph') return construct.range.end
    const id = construct.identity.slice('subgraph:'.length)
    return subgraphBlocks.get(id)?.closing.range.end ?? construct.range.end
  })
  const insertionPoint = topLevelEnds.length > 0
    ? Math.max(...topLevelEnds)
    : sourceMap.declaration?.range.end ?? source.length
  const anchor = topLevelConstructs.find(construct => construct.range.end === insertionPoint)
    ?? topLevelConstructs.find(construct => construct.kind === 'subgraph')
  const indent = anchor?.text.match(/^\s*/)?.[0] || '  '
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const insertionPrefix = `${newline}${indent}`
  return { ...parsed, nodes, nodeLabels, nodeLines, nodeShapeNames, nodeColorStyles, nodeColorStyleLines, nodeColorUnavailableIds, edgeLines, subgraphBlocks, ambiguousNodeIds, insertionPoint, insertionPrefix, sourceMap }
}

function toAdapterResult(source: string, revision: number): AdapterResult<FlowchartAdapterModel> {
  const model = buildModel(source)
  const concreteHandles: ConcreteSourceHandle[] = []
  for (const [id, owned] of model.nodeLabels) {
    concreteHandles.push({ handle: `node:${id}`, kind: 'node-label', range: owned.range, fingerprint: owned.text })
  }
  for (const [id, owned] of model.edgeLines) {
    // An inline declaration such as `A[Start] --> B[End]` gives the node-label
    // handles a range inside the edge's full-line range. The contract forbids
    // overlapping concrete handles, so retain the safer node edits and leave
    // that edge source-owned instead of rejecting the entire Canvas.
    if ([...model.nodeLabels.values()].some(node => node.range.start < owned.range.end && owned.range.start < node.range.end)) continue
    concreteHandles.push({ handle: `edge:${id}`, kind: 'edge', range: owned.range, fingerprint: owned.text })
  }

  const uniqueNodes = model.nodes.filter((node, index, nodes) => nodes.findIndex(candidate => candidate.id === node.id) === index)
  const nodeIds = new Set(uniqueNodes.map(node => node.id))
  return {
    family: 'flowchart',
    model,
    concrete: { source, revision, handles: concreteHandles },
    canvas: {
      elements: uniqueNodes.map(node => ({
        id: `node:${node.id}`,
        kind: node.data.isSubgraph ? 'container' : 'element',
        label: node.data.label,
        focusable: true,
        selected: Boolean(node.selected),
        disabled: model.ambiguousNodeIds.has(node.id),
        operations: model.ambiguousNodeIds.has(node.id)
          ? []
          : [
              ...(model.nodeLabels.has(node.id) ? ['rename'] : []),
              ...(model.nodeLines.has(node.id) ? ['delete'] : []),
            ],
      })),
      connectors: model.edges
        .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
        .map(edge => ({
          id: `edge:${edge.id}`,
          source: `node:${edge.source}`,
          target: `node:${edge.target}`,
          label: edge.data?.label,
          operations: model.edgeLines.has(edge.id) ? ['delete'] : [],
        })),
    },
    diagnostics: [
      ...model.sourceMap.diagnostics.map(diagnostic => ({ severity: 'error' as const, ...diagnostic })),
      ...model.sourceMap.constructs
        .filter(construct => construct.ownership !== 'editable'
          && !['declaration', 'comment', 'frontmatter', 'config'].includes(construct.kind))
        .map(construct => ({
          severity: 'info' as const,
          code: construct.ownership === 'preserved-only' ? 'flowchart-preserved-only' : 'flowchart-represented-only',
          message: `${construct.identity} remains source-owned; edit it in Code view.`,
          range: construct.range,
        })),
      ...[...model.ambiguousNodeIds]
        .filter(id => !model.sourceMap.diagnostics.some(diagnostic => diagnostic.message === `Ambiguous node identity: ${id}`))
        .map(id => ({ severity: 'error' as const, code: 'ambiguous-handle', message: `Node ${id} has ambiguous source syntax` })),
    ],
  }
}

export const flowchartCompatibilityAdapter: AdapterDescriptor<FlowchartAdapterModel> = {
  id: 'flowchart-compatibility',
  family: 'flowchart',
  capabilities: Object.freeze({ visualEdit: true, preview: true, losslessOperations: true }),
  parse: toAdapterResult,
  supportsOperation: operation => ({ supported: [
    'rename-node', 'add-node', 'delete-node', 'update-node-shape', 'update-node-colors',
    'add-edge', 'delete-edge', 'update-edge',
    'add-subgraph', 'rename-subgraph', 'move-node-to-subgraph', 'delete-subgraph',
    'set-subgraph-direction', 'reorder-top-level-subgraph',
  ].includes(operation), reason: 'The compatibility adapter supports routine node and edge operations' }),
  validateSource: source => {
    try {
      buildModel(source)
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
  layoutStrategyId: 'dagre',
}

function validateIdentifier(id: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id)) throw new SemanticValidationError('Node id is not valid flowchart syntax')
}

function validateLabel(label: string): void {
  if (!label || /[\[\]]/.test(label)) throw new SemanticValidationError('Node label is not valid compatibility syntax')
}

function serializeLegacyNodeLabel(label: string): string {
  const mermaidLabel = label.replace(/\r\n?|\n/g, '<br/>')
  return /\r|\n/.test(label) ? JSON.stringify(mermaidLabel) : mermaidLabel
}

export function issueFlowchartOperation(
  parsed: AdapterResult<FlowchartAdapterModel>,
  operation: FlowchartSemanticOperation,
): SourceOperation[] {
  const { model, concrete } = parsed
  if (operation.kind === 'update-node-colors') {
    const owned = model.nodeColorStyles.get(operation.id)
    const styleLines = model.nodeColorStyleLines.get(operation.id) ?? []
    const ambiguous = model.ambiguousNodeIds.has(operation.id)
    // A trailing Mermaid style directive is unambiguous even when the node is
    // declared more than once: it applies to the id and overrides prior styles.
    const replaceableStyle = ambiguous ? undefined : owned ?? styleLines[0]
    const colors = [operation.fillColor, operation.strokeColor, operation.textColor]
    if (colors.some(color => color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(color))) {
      throw new SemanticValidationError('Node colors must use browser-native #RRGGBB values')
    }
    if (operation.strokeWidth !== undefined && ![1, 2, 3, 4, 6].includes(operation.strokeWidth)) {
      throw new SemanticValidationError('Node stroke width must be one of 1, 2, 3, 4, or 6 pixels')
    }
    if (colors.every(color => color === undefined) && operation.strokeWidth === undefined) {
      if (!replaceableStyle) return []
      const hasTrailingLineEnding = replaceableStyle.fullLineRange.end > replaceableStyle.range.end
      const precedingNewlineLength = concrete.source.slice(0, replaceableStyle.fullLineRange.start).endsWith('\r\n') ? 2 : 1
      const range = hasTrailingLineEnding
        ? replaceableStyle.fullLineRange
        : { start: replaceableStyle.fullLineRange.start - precedingNewlineLength, end: replaceableStyle.fullLineRange.end }
      return [
        { kind: 'delete', range, expectedText: concrete.source.slice(range.start, range.end), expectedRevision: concrete.revision },
        ...styleLines.slice(1).map(line => ({
          kind: 'delete' as const, range: line.fullLineRange,
          expectedText: concrete.source.slice(line.fullLineRange.start, line.fullLineRange.end), expectedRevision: concrete.revision,
        })),
      ]
    }
    const nodeLine = model.nodeLines.get(operation.id)
    const parts = [
      operation.fillColor ? `fill:${operation.fillColor}` : undefined,
      operation.strokeColor ? `stroke:${operation.strokeColor}` : undefined,
      operation.strokeWidth ? `stroke-width:${operation.strokeWidth}px` : undefined,
      operation.textColor ? `color:${operation.textColor}` : undefined,
    ].filter((part): part is string => part !== undefined)
    const text = `${replaceableStyle?.text.match(/^\s*/)?.[0] ?? nodeLine?.text.match(/^\s*/)?.[0] ?? '  '}style ${operation.id} ${parts.join(',')}`
    if (replaceableStyle) return [
      { kind: 'replace', range: replaceableStyle.range, text, expectedText: replaceableStyle.text, expectedRevision: concrete.revision },
      ...styleLines.slice(1).map(line => ({
        kind: 'delete' as const, range: line.fullLineRange,
        expectedText: concrete.source.slice(line.fullLineRange.start, line.fullLineRange.end), expectedRevision: concrete.revision,
      })),
    ]
    const newline = concrete.source.includes('\r\n') ? '\r\n' : concrete.source.includes('\r') ? '\r' : '\n'
    if (!nodeLine) return [{
      kind: 'insert', at: concrete.source.length,
      text: `${concrete.source.endsWith('\n') || concrete.source.endsWith('\r') ? '' : concrete.source.includes('\r\n') ? '\r\n' : concrete.source.includes('\r') ? '\r' : '\n'}  style ${operation.id} ${parts.join(',')}${concrete.source.endsWith('\n') || concrete.source.endsWith('\r') ? '' : concrete.source.includes('\r\n') ? '\r\n' : concrete.source.includes('\r') ? '\r' : '\n'}`,
      expectedRevision: concrete.revision,
    }]
    const hasLineEnding = nodeLine.fullLineRange.end > nodeLine.range.end
    return [{
      kind: 'insert', at: nodeLine.fullLineRange.end,
      text: `${hasLineEnding ? '' : newline}${text}${hasLineEnding ? newline : ''}`,
      expectedRevision: concrete.revision,
    }]
  }
  if (operation.kind === 'rename-node') {
    validateLabel(operation.label)
    if (model.ambiguousNodeIds.has(operation.id)) throw new SemanticValidationError(`Node ${operation.id} has ambiguous source syntax`)
    const owned = model.nodeLabels.get(operation.id)
    if (!owned) throw new SemanticValidationError(`Node ${operation.id} has no stable source handle`)
    const node = model.nodes.find(candidate => candidate.id === operation.id)
    const text = node?.data.mermaidShape
      ? JSON.stringify(operation.label.replace(/\r\n?|\n/g, '<br/>'))
      : serializeLegacyNodeLabel(operation.label)
    return [{ kind: 'replace', range: owned.range, text, expectedText: owned.text, expectedRevision: concrete.revision }]
  }
  if (operation.kind === 'add-node') {
    validateIdentifier(operation.id)
    validateLabel(operation.label)
    if (model.nodes.some(node => node.id === operation.id)) throw new SemanticValidationError(`Node ${operation.id} already exists`)
    if (operation.mermaidShape) {
      if (!/^[a-z][a-z0-9-]*$/.test(operation.mermaidShape)) throw new SemanticValidationError('Generalized node shape is not valid Mermaid syntax')
      const escapedLabel = operation.label.replace(/\r\n?|\n/g, '<br/>').replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      return [{
        kind: 'insert', at: model.insertionPoint,
        text: `${model.insertionPrefix}${operation.id}@{ shape: ${operation.mermaidShape}, label: "${escapedLabel}" }`,
        expectedRevision: concrete.revision,
      }]
    }
    const template = shapeTemplates[operation.shape ?? 'rectangle']
    return [{
      kind: 'insert',
      at: model.insertionPoint,
      text: `${model.insertionPrefix}${operation.id}${template.open}${serializeLegacyNodeLabel(operation.label)}${template.close}`,
      expectedRevision: concrete.revision,
    }]
  }

  if (operation.kind === 'update-node-shape') {
    const node = model.nodes.find(candidate => candidate.id === operation.id)
    const owned = model.nodeLabels.get(operation.id)
    if (!node || !owned || node.data.shape === 'subgraph') throw new SemanticValidationError(`Node ${operation.id} has no stable shape handle`)
    const generalizedShape = model.nodeShapeNames.get(operation.id)
    if (generalizedShape) {
      const aliases: Record<Exclude<NodeShape, 'subgraph'>, string> = {
        rectangle: 'rect', rounded: 'rounded', pill: 'stadium', diamond: 'diamond',
        circle: 'circle', hexagon: 'hex', cylinder: 'cyl',
      }
      return [{
        kind: 'replace', range: generalizedShape.range, text: aliases[operation.shape],
        expectedText: generalizedShape.text, expectedRevision: concrete.revision,
      }]
    }
    const current = shapeTemplates[node.data.shape]
    const next = shapeTemplates[operation.shape]
    const openRange = { start: owned.range.start - current.open.length, end: owned.range.start }
    const closeRange = { start: owned.range.end, end: owned.range.end + current.close.length }
    if (concrete.source.slice(openRange.start, openRange.end) !== current.open
        || concrete.source.slice(closeRange.start, closeRange.end) !== current.close) {
      throw new SemanticValidationError(`Node ${operation.id} shape syntax is ambiguous`)
    }
    return [
      { kind: 'replace', range: openRange, text: next.open, expectedText: current.open, expectedRevision: concrete.revision },
      { kind: 'replace', range: closeRange, text: next.close, expectedText: current.close, expectedRevision: concrete.revision },
    ]
  }

  if (operation.kind === 'add-edge') {
    validateIdentifier(operation.id)
    validateIdentifier(operation.source)
    validateIdentifier(operation.target)
    if (operation.label) validateLabel(operation.label)
    if (model.edges.some(edge => edge.id === operation.id)) throw new SemanticValidationError(`Edge ${operation.id} already exists`)
    const connector = edgeConnectors[operation.style ?? 'arrow']
    const label = operation.label ? `|${operation.label}|` : ''
    return [{ kind: 'insert', at: model.insertionPoint, text: `${model.insertionPrefix}${operation.source} ${operation.id}@${connector}${label} ${operation.target}`, expectedRevision: concrete.revision }]
  }

  if (operation.kind === 'add-subgraph') {
    validateIdentifier(operation.id)
    validateLabel(operation.label)
    if (model.nodes.some(node => node.id === operation.id)) throw new SemanticValidationError(`Node ${operation.id} already exists`)
    return [{ kind: 'insert', at: model.insertionPoint, text: `${model.insertionPrefix}subgraph ${operation.id} [${operation.label}]${model.insertionPrefix}end`, expectedRevision: concrete.revision }]
  }

  if (operation.kind === 'rename-subgraph') {
    validateLabel(operation.label)
    const block = model.subgraphBlocks.get(operation.id)
    if (!block) throw new SemanticValidationError(`Subgraph ${operation.id} has no stable source boundary`)
    const labelMatch = /^(\s*subgraph\s+[A-Za-z_][A-Za-z0-9_-]*\s+\[)([^\]]*)(\]\s*)$/.exec(block.opening.text)
    if (!labelMatch) throw new SemanticValidationError(`Subgraph ${operation.id} has no stable label handle`)
    const start = block.opening.range.start + labelMatch[1].length
    return [{
      kind: 'replace', range: { start, end: start + labelMatch[2].length }, text: operation.label,
      expectedText: labelMatch[2], expectedRevision: concrete.revision,
    }]
  }

  if (operation.kind === 'move-node-to-subgraph') {
    if (model.ambiguousNodeIds.has(operation.id)) throw new SemanticValidationError(`Node ${operation.id} has ambiguous source syntax`)
    const node = model.nodes.find(candidate => candidate.id === operation.id)
    const owned = model.nodeLines.get(operation.id)
    if (!node || !owned || node.data.isSubgraph) throw new SemanticValidationError(`Node ${operation.id} has no stable membership handle`)
    if ((node.parentId ?? null) === operation.subgraphId) return []
    const line = owned.text.trim()
    if (operation.subgraphId) {
      const target = model.subgraphBlocks.get(operation.subgraphId)
      if (!target) throw new SemanticValidationError(`Subgraph ${operation.subgraphId} has no stable source boundary`)
      const newline = concrete.source.includes('\r\n') ? '\r\n' : '\n'
      const indent = `${target.closing.text.match(/^\s*/)?.[0] ?? ''}  `
      return [
        { kind: 'delete', range: owned.fullLineRange, expectedText: concrete.source.slice(owned.fullLineRange.start, owned.fullLineRange.end), expectedRevision: concrete.revision },
        { kind: 'insert', at: target.closing.range.start, text: `${indent}${line}${newline}`, expectedRevision: concrete.revision },
      ]
    }
    return [
      { kind: 'delete', range: owned.fullLineRange, expectedText: concrete.source.slice(owned.fullLineRange.start, owned.fullLineRange.end), expectedRevision: concrete.revision },
      { kind: 'insert', at: model.insertionPoint, text: `${model.insertionPrefix}${line}`, expectedRevision: concrete.revision },
    ]
  }

  if (operation.kind === 'delete-subgraph') {
    const block = model.subgraphBlocks.get(operation.id)
    if (!block) throw new SemanticValidationError(`Subgraph ${operation.id} has no stable source boundary`)
    if (operation.disposition === 'delete-contents') {
      const range = { start: block.opening.fullLineRange.start, end: block.closing.fullLineRange.end }
      return [{
        kind: 'delete', range, expectedText: concrete.source.slice(range.start, range.end), expectedRevision: concrete.revision,
      }]
    }
    return [block.opening, block.closing].map(owned => ({
      kind: 'delete' as const,
      range: owned.fullLineRange,
      expectedText: concrete.source.slice(owned.fullLineRange.start, owned.fullLineRange.end),
      expectedRevision: concrete.revision,
    }))
  }

  if (operation.kind === 'reorder-top-level-subgraph') {
    if (operation.id === operation.beforeId) return []
    const topLevelSubgraphs = new Set(model.sourceMap.constructs
      .filter(construct => construct.kind === 'subgraph' && !construct.parentIdentity)
      .map(construct => construct.identity.slice('subgraph:'.length)))
    if (!topLevelSubgraphs.has(operation.id) || !topLevelSubgraphs.has(operation.beforeId)) {
      throw new SemanticValidationError('Only top-level subgraphs have stable reorder boundaries')
    }
    const block = model.subgraphBlocks.get(operation.id)
    const before = model.subgraphBlocks.get(operation.beforeId)
    if (!block || !before) throw new SemanticValidationError('Subgraph has no stable source boundary')
    const range = { start: block.opening.fullLineRange.start, end: block.closing.fullLineRange.end }
    return [
      { kind: 'delete', range, expectedText: concrete.source.slice(range.start, range.end), expectedRevision: concrete.revision },
      { kind: 'insert', at: before.opening.fullLineRange.start, text: concrete.source.slice(range.start, range.end), expectedRevision: concrete.revision },
    ]
  }

  if (operation.kind === 'set-subgraph-direction') {
    const block = model.subgraphBlocks.get(operation.id)
    if (!block) throw new SemanticValidationError(`Subgraph ${operation.id} has no stable source boundary`)
    const spans = lineSpans(concrete.source).filter(span => span.start >= block.opening.fullLineRange.end && span.end <= block.closing.range.start)
    const existing = spans.find(span => /^\s*direction\s+(?:TB|TD|BT|RL|LR)\s*$/.test(span.text))
    if (existing) {
      const text = existing.text.replace(/(direction\s+)(?:TB|TD|BT|RL|LR)/, `$1${operation.direction}`)
      return [{
        kind: 'replace', range: { start: existing.start, end: existing.end }, text,
        expectedText: existing.text, expectedRevision: concrete.revision,
      }]
    }
    const newline = concrete.source.includes('\r\n') ? '\r\n' : '\n'
    const indent = `${block.opening.text.match(/^\s*/)?.[0] ?? ''}  `
    return [{
      kind: 'insert', at: block.opening.fullLineRange.end,
      text: `${indent}direction ${operation.direction}${newline}`, expectedRevision: concrete.revision,
    }]
  }

  if (operation.kind === 'delete-edge') {
    const owned = model.edgeLines.get(operation.id)
    if (!owned) throw new SemanticValidationError(`Edge ${operation.id} has no stable source handle`)
    return [{ kind: 'delete', range: owned.fullLineRange, expectedText: concrete.source.slice(owned.fullLineRange.start, owned.fullLineRange.end), expectedRevision: concrete.revision }]
  }

  if (operation.kind === 'update-edge') {
    const edge = model.edges.find(candidate => candidate.id === operation.id)
    const owned = model.edgeLines.get(operation.id)
    if (!edge || !owned) throw new SemanticValidationError(`Edge ${operation.id} has no stable source handle`)
    if (operation.label) validateLabel(operation.label)
    const indent = owned.text.match(/^\s*/)?.[0] ?? ''
    const connector = edgeConnectors[operation.style ?? edge.data?.style ?? 'arrow']
    const label = 'label' in operation ? operation.label : edge.data?.label
    const text = `${indent}${operation.source ?? edge.source} ${edge.id}@${connector}${label ? `|${label}|` : ''} ${operation.target ?? edge.target}`
    return [{ kind: 'replace', range: owned.range, text, expectedText: owned.text, expectedRevision: concrete.revision }]
  }

  if (model.ambiguousNodeIds.has(operation.id)) throw new SemanticValidationError(`Node ${operation.id} has ambiguous source syntax`)
  const ranges: OwnedRange[] = []
  const nodeLine = model.nodeLines.get(operation.id)
  if (!nodeLine) throw new SemanticValidationError(`Node ${operation.id} has no stable source handle`)
  const subgraph = model.subgraphBlocks.get(operation.id)
  if (subgraph) ranges.push(subgraph.opening, subgraph.closing)
  else ranges.push(nodeLine)
  const nodeColorStyle = model.nodeColorStyles.get(operation.id)
  if (nodeColorStyle) ranges.push(nodeColorStyle)
  for (const edge of model.edges) {
    if (edge.source === operation.id || edge.target === operation.id) {
      const edgeLine = model.edgeLines.get(edge.id)
      if (edgeLine) ranges.push(edgeLine)
    }
  }
  return ranges.map(owned => ({
    kind: 'delete' as const,
    range: owned.fullLineRange,
    expectedText: concrete.source.slice(owned.fullLineRange.start, owned.fullLineRange.end),
    expectedRevision: concrete.revision,
  }))
}
