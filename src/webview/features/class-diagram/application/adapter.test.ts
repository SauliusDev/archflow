import { describe, expect, it } from 'vitest'
import { validateAdapterResult } from '../../../../shared/diagram-contracts'
import { classAdapter } from './adapter'
import { webviewAdapterRegistry } from '../../../lib/adapterPlatform'

describe('classAdapter', () => {
  it('projects classes, namespaces, and members through the adapter contract', () => {
    const result = classAdapter.parse('classDiagram\nnamespace Domain {\n  class Account {\n    +String owner\n  }\n}\nAccount --> Ledger\n', 7)

    expect(validateAdapterResult(result)).toEqual({ valid: true })
    expect(result).toMatchObject({ family: 'class', concrete: { revision: 7 } })
    expect(result.canvas.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'namespace:Domain', kind: 'container' }),
      expect.objectContaining({ id: 'class:Account', kind: 'element', parentId: 'namespace:Domain' }),
      expect.objectContaining({ id: 'member:Account:0', kind: 'compartment', parentId: 'class:Account' }),
    ]))
    expect(result.canvas.connectors).toEqual([expect.objectContaining({ source: 'class:Account', target: 'class:Ledger' })])
  })

  it('registers the class adapter without changing the flowchart adapter', () => {
    expect(webviewAdapterRegistry.get('class')).toMatchObject({ id: classAdapter.id, family: 'class' })
    expect(webviewAdapterRegistry.get('flowchart')?.id).toBe('flowchart-compatibility')
  })
})
