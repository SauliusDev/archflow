import type { AdapterDescriptor, AdapterResult, DiagramFamily } from './diagram-contracts'
import { validateAdapterResult } from './diagram-contracts'

export type AdapterInitialization =
  | { status: 'ready'; family: DiagramFamily; adapter: AdapterDescriptor; result: AdapterResult }
  | { status: 'unavailable'; family: DiagramFamily; reason: string }
  | { status: 'failed'; family: DiagramFamily; reason: string }

export class AdapterRegistry {
  private readonly adapters: ReadonlyMap<DiagramFamily, AdapterDescriptor>

  constructor(descriptors: readonly AdapterDescriptor[]) {
    const adapters = new Map<DiagramFamily, AdapterDescriptor>()
    for (const descriptor of descriptors) {
      if (adapters.has(descriptor.family)) {
        throw new Error(`Duplicate adapter registration for ${descriptor.family}`)
      }
      adapters.set(descriptor.family, Object.freeze({
        ...descriptor,
        capabilities: Object.freeze({ ...descriptor.capabilities }),
      }))
    }
    this.adapters = adapters
  }

  get(family: DiagramFamily): AdapterDescriptor | undefined {
    return this.adapters.get(family)
  }

  initialize(family: DiagramFamily, source: string, revision: number): AdapterInitialization {
    const adapter = this.adapters.get(family)
    if (!adapter) return { status: 'unavailable', family, reason: `No adapter is registered for ${family}` }
    if (!adapter.capabilities.visualEdit) {
      return { status: 'unavailable', family, reason: `Visual editing is unavailable for ${family}` }
    }
    try {
      const result = adapter.parse(source, revision)
      if (result.family !== family) return { status: 'failed', family, reason: `Adapter returned family ${result.family}` }
      const validation = validateAdapterResult(result)
      if (!validation.valid) return { status: 'failed', family, reason: validation.error }
      return { status: 'ready', family, adapter, result }
    } catch (error) {
      return { status: 'failed', family, reason: error instanceof Error ? error.message : String(error) }
    }
  }
}
