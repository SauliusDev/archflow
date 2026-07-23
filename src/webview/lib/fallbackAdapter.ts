import type { AdapterResult, DiagramFamily } from '../../shared/diagram-contracts'

export interface FallbackAdapterModel {
  source: string
  editable: false
  reason: string
}

export function createCodePreviewAdapterResult(
  source: string,
  revision: number,
  family: DiagramFamily,
  reason = `Visual editing is not available for ${family} diagrams`,
): AdapterResult<FallbackAdapterModel> {
  return {
    family,
    model: { source, editable: false, reason },
    concrete: { source, revision, handles: [] },
    canvas: { elements: [], connectors: [] },
    diagnostics: [{ severity: 'info', code: 'code-preview-fallback', message: reason }],
  }
}
