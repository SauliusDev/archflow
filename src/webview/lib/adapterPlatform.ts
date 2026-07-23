import { AdapterRegistry } from '../../shared/adapterRegistry'
import type { AdapterResult, DiagramFamily } from '../../shared/diagram-contracts'
import type { DocumentSession } from './documentSession'
import { createCodePreviewAdapterResult } from './fallbackAdapter'
import { flowchartCompatibilityAdapter } from '@/features/flowchart'
import { classAdapter } from '../features/class-diagram'

export const webviewAdapterRegistry = new AdapterRegistry([flowchartCompatibilityAdapter, classAdapter])

export function initializeAdapterProjection(
  family: DiagramFamily,
  source: string,
  revision: number,
): AdapterResult {
  const initialized = webviewAdapterRegistry.initialize(family, source, revision)
  if (initialized.status === 'ready' && !initialized.result.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    return initialized.result
  }
  if (initialized.status === 'ready') {
    const diagnostic = initialized.result.diagnostics.find(item => item.severity === 'error')
    return createCodePreviewAdapterResult(source, revision, family, `Canvas unavailable: ${diagnostic?.message ?? 'unsafe source structure'}`)
  }
  return createCodePreviewAdapterResult(
    source,
    revision,
    family,
    `Canvas unavailable: ${initialized.reason}`,
  )
}

export function parseAdapterProjection(
  family: DiagramFamily,
  source: string,
  revision: number,
): AdapterResult {
  const adapter = webviewAdapterRegistry.get(family)
  if (!adapter) throw new Error(`No adapter registered for ${family}`)
  return adapter.parse(source, revision)
}

export function validateAdapterSource(family: DiagramFamily, source: string): boolean {
  return webviewAdapterRegistry.get(family)?.validateSource(source).valid ?? source.length > 0
}

export function canonicalSourceForExport(
  session: DocumentSession | null,
  codeSource: string | undefined,
): string {
  if (session) return session.source
  return codeSource?.trim().length ? codeSource : 'flowchart TD\n'
}
