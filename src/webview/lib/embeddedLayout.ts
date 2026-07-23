import type { DiagramFamily, LayoutState, LayoutStateV2 } from '../../shared/diagram-contracts'
import { LAYOUT_LIMITS, validateLayoutStateV2 } from '../../shared/diagram-contracts'

export const FLOWFORGE_LAYOUT_START = '%% FLOWFORGE LAYOUT START'
export const FLOWFORGE_LAYOUT_END = '%% FLOWFORGE LAYOUT END'
const LEGACY_ARCHFLOW_LAYOUT_START = '%% ARCHFLOW LAYOUT START'
const LEGACY_ARCHFLOW_LAYOUT_END = '%% ARCHFLOW LAYOUT END'

export interface EmbeddedLayoutResult {
  content: string
  layout: LayoutState | LayoutStateV2 | null
  error?: string
}

export interface EmbeddedLayoutV2Result {
  content: string
  layout: LayoutStateV2 | null
  migrated: boolean
  error?: string
}

interface LayoutBlock {
  start: number
  end: number
  json: string
}

function markerMatches(source: string, marker: string): RegExpExecArray[] {
  const expression = new RegExp(`^[ \\t]*${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*\\r?$`, 'gmi')
  return [...source.matchAll(expression)]
}

function locateLayoutBlockWithMarkers(source: string, startMarker: string, endMarker: string): LayoutBlock | { error: string } | null {
  const starts = markerMatches(source, startMarker)
  const ends = markerMatches(source, endMarker)
  if (starts.length === 0 && ends.length === 0) return null
  if (starts.length !== 1 || ends.length !== 1 || ends[0].index <= starts[0].index) {
    return { error: 'Invalid or nested Flowforge layout block markers' }
  }
  const startLineEnd = starts[0].index + starts[0][0].length
  let bodyStart = startLineEnd
  if (source.slice(bodyStart, bodyStart + 2) === '\r\n') bodyStart += 2
  else if (source[bodyStart] === '\n' || source[bodyStart] === '\r') bodyStart += 1

  let end = ends[0].index + ends[0][0].length
  if (source.slice(end, end + 2) === '\r\n') end += 2
  else if (source[end] === '\n' || source[end] === '\r') end += 1
  return { start: starts[0].index, end, json: source.slice(bodyStart, ends[0].index) }
}

function locateLayoutBlock(source: string): LayoutBlock | { error: string } | null {
  const flowforge = locateLayoutBlockWithMarkers(source, FLOWFORGE_LAYOUT_START, FLOWFORGE_LAYOUT_END)
  if (flowforge && 'error' in flowforge) return flowforge
  const legacy = locateLayoutBlockWithMarkers(source, LEGACY_ARCHFLOW_LAYOUT_START, LEGACY_ARCHFLOW_LAYOUT_END)
  if (legacy && 'error' in legacy) return legacy
  if (flowforge && legacy) return { error: 'Multiple Flowforge layout block markers found' }
  return flowforge ?? legacy
}

function uncommentLayoutJson(body: string): string {
  return body.split(/\r?\n/).map(line => {
    const segment = line.trimStart()
    return segment.startsWith('%%') ? segment.slice(2).trimStart() : segment
  }).join('\n').trim()
}

function contentWithoutBlock(source: string, block: LayoutBlock): string {
  let start = block.start
  const prefix = source.slice(0, start)
  if (prefix.endsWith('\r\n\r\n')) start -= 2
  else if (prefix.endsWith('\n\n') || prefix.endsWith('\r\r')) start -= 1
  return source.slice(0, start) + source.slice(block.end)
}

function parseBlock(source: string): { block: LayoutBlock; value: unknown } | { error: string } | null {
  const located = locateLayoutBlock(source)
  if (!located || 'error' in located) return located
  const bytes = new TextEncoder().encode(source.slice(located.start, located.end)).byteLength
  if (bytes > LAYOUT_LIMITS.blockBytes) return { error: 'Flowforge layout block exceeds 1 MiB' }
  const json = uncommentLayoutJson(located.json)
  if (!json) return { error: 'Flowforge layout block is empty' }
  try {
    return { block: located, value: JSON.parse(json) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function isLayoutV1(value: unknown): value is LayoutState {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LayoutState>
  return candidate.version === 1 && Boolean(candidate.nodes) && typeof candidate.nodes === 'object'
    && Boolean(candidate.viewport) && typeof candidate.viewport === 'object'
}

export function migrateLayoutV1(layout: LayoutState, family: DiagramFamily): LayoutStateV2 {
  return {
    version: 2,
    diagramFamily: family,
    viewport: { ...layout.viewport },
    elements: Object.fromEntries(Object.entries(layout.nodes).map(([id, geometry]) => [`node:${id}`, { ...geometry }])),
    edges: {},
    constraints: [],
    adapterMetadata: { legacy: { migratedFrom: 1 } },
  }
}

export function stripEmbeddedLayout(source: string): EmbeddedLayoutResult {
  const parsed = parseBlock(source)
  if (!parsed) return { content: source, layout: null }
  if ('error' in parsed) return { content: source, layout: null, error: parsed.error }
  if (!isLayoutV1(parsed.value) && validateLayoutStateV2(parsed.value).valid === false) {
    return { content: source, layout: null, error: 'Invalid Flowforge layout state' }
  }
  return { content: contentWithoutBlock(source, parsed.block), layout: parsed.value as LayoutState | LayoutStateV2 }
}

export function readEmbeddedLayoutV2(source: string, family: DiagramFamily): EmbeddedLayoutV2Result {
  const parsed = parseBlock(source)
  if (!parsed) return { content: source, layout: null, migrated: false }
  if ('error' in parsed) return { content: source, layout: null, migrated: false, error: parsed.error }
  const content = contentWithoutBlock(source, parsed.block)
  if (isLayoutV1(parsed.value)) {
    if (family === 'class') {
      return {
        content: source,
        layout: null,
        migrated: false,
        error: 'V1 layout metadata is not supported for class diagrams; applying automatic layout',
      }
    }
    const layout = migrateLayoutV1(parsed.value, family)
    const validation = validateLayoutStateV2(layout)
    return validation.valid
      ? { content, layout, migrated: true }
      : { content: source, layout: null, migrated: false, error: validation.error }
  }
  const validation = validateLayoutStateV2(parsed.value)
  if (!validation.valid) return { content: source, layout: null, migrated: false, error: validation.error }
  if (validation.value!.diagramFamily !== family) {
    return { content: source, layout: null, migrated: false, error: `Layout family ${validation.value!.diagramFamily} does not match ${family}` }
  }
  return { content, layout: validation.value!, migrated: false }
}

function renderBlock(layout: LayoutState | LayoutStateV2): string {
  return `${FLOWFORGE_LAYOUT_START}\n${JSON.stringify(layout, null, 2).split('\n').map(line => `%% ${line}`).join('\n')}\n${FLOWFORGE_LAYOUT_END}\n`
}

export function embedLayoutInMermaid(source: string, layout: LayoutState | LayoutStateV2): string {
  if (layout.version === 2) {
    const validation = validateLayoutStateV2(layout)
    if (!validation.valid) throw new Error(validation.error)
  }
  const located = locateLayoutBlock(source)
  if (located && 'error' in located) throw new Error(located.error)
  const block = renderBlock(layout)
  if (located) return source.slice(0, located.start) + block + source.slice(located.end)
  const separator = source.endsWith('\n') || source.endsWith('\r') ? '\n' : '\n\n'
  return source + separator + block
}
