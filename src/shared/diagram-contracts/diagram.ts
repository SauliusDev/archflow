export const DIAGRAM_FAMILIES = [
  'empty',
  'flowchart',
  'sequence',
  'zenuml',
  'class',
  'state',
  'er',
  'architecture',
  'c4-context',
  'c4-container',
  'c4-component',
  'c4-dynamic',
  'c4-deployment',
  'other',
] as const

export type DiagramFamily = typeof DIAGRAM_FAMILIES[number]

export function isDiagramFamily(value: unknown): value is DiagramFamily {
  return typeof value === 'string' && (DIAGRAM_FAMILIES as readonly string[]).includes(value)
}

export interface SourceRange { start: number; end: number }
export type SemanticHandle = string

export interface ConcreteSourceHandle {
  handle: SemanticHandle
  kind: string
  range: SourceRange
  fingerprint: string
}

export interface ConcreteSourceDocument {
  source: string
  revision: number
  handles: ConcreteSourceHandle[]
}

export type SourceOperation =
  | { kind: 'insert'; at: number; text: string; expectedRevision: number }
  | { kind: 'replace'; range: SourceRange; text: string; expectedText: string; expectedRevision: number }
  | { kind: 'delete'; range: SourceRange; expectedText: string; expectedRevision: number }

export interface CanvasElementDescriptor {
  id: SemanticHandle
  kind: 'element' | 'container' | 'compartment' | 'note' | 'anchor' | 'port' | 'ordered-lane' | 'alignment-guide'
  label: string
  focusable: boolean
  selected: boolean
  disabled: boolean
  operations: string[]
  parentId?: SemanticHandle
  metadata?: Readonly<Record<string, unknown>>
}

export interface CanvasConnectorDescriptor {
  id: SemanticHandle
  source: SemanticHandle
  target: SemanticHandle
  label?: string
  disabled?: boolean
  operations?: string[]
  metadata?: Readonly<Record<string, unknown>>
}

export interface CanvasDescriptor {
  elements: CanvasElementDescriptor[]
  connectors: CanvasConnectorDescriptor[]
}

export interface AdapterDiagnostic {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  range?: SourceRange
}

export interface AdapterResult<Model = unknown> {
  family: DiagramFamily
  model: Model
  concrete: ConcreteSourceDocument
  canvas: CanvasDescriptor
  diagnostics: AdapterDiagnostic[]
}

export interface AdapterCapabilities {
  visualEdit: boolean
  preview: boolean
  losslessOperations: boolean
}

export interface OperationSupport { supported: boolean; reason?: string }
export interface SourceValidationResult { valid: boolean; error?: string }

export interface AdapterDescriptor<Model = unknown> {
  id: string
  family: DiagramFamily
  capabilities: Readonly<AdapterCapabilities>
  parse(source: string, revision: number): AdapterResult<Model>
  supportsOperation(operation: string, handle?: SemanticHandle): OperationSupport
  validateSource(source: string): SourceValidationResult
  layoutStrategyId?: string
}

export type ValidationResult<T = never> = { valid: true; value?: T } | { valid: false; error: string }

function validRange(range: SourceRange, sourceLength: number): boolean {
  return Number.isInteger(range.start) && Number.isInteger(range.end)
    && range.start >= 0 && range.end >= range.start && range.end <= sourceLength
}

export function validateAdapterResult(result: AdapterResult): ValidationResult {
  const handles = [...result.concrete.handles].sort((a, b) => a.range.start - b.range.start || a.range.end - b.range.end)
  const ids = new Set<string>()
  for (let index = 0; index < handles.length; index++) {
    const handle = handles[index]
    if (!handle.handle || ids.has(handle.handle)) return { valid: false, error: `Duplicate semantic handle: ${handle.handle}` }
    ids.add(handle.handle)
    if (!validRange(handle.range, result.concrete.source.length)) return { valid: false, error: `Invalid source range: ${handle.handle}` }
    if (index > 0 && handles[index - 1].range.end > handle.range.start) return { valid: false, error: 'Overlapping concrete source ranges' }
  }
  const elementIds = new Set<string>()
  for (const element of result.canvas.elements) {
    if (!element.id || elementIds.has(element.id)) return { valid: false, error: `Duplicate Canvas element: ${element.id}` }
    elementIds.add(element.id)
  }
  for (const element of result.canvas.elements) {
    if (element.parentId !== undefined && !elementIds.has(element.parentId)) {
      return { valid: false, error: `Invalid Canvas parent: ${element.parentId}` }
    }
  }
  const connectorIds = new Set<string>()
  for (const connector of result.canvas.connectors) {
    if (!connector.id || connectorIds.has(connector.id)
        || !elementIds.has(connector.source) || !elementIds.has(connector.target)) {
      return { valid: false, error: `Invalid Canvas connector: ${connector.id}` }
    }
    connectorIds.add(connector.id)
  }
  return { valid: true }
}
