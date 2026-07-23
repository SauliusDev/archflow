import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ClassDefinition, ClassRelationship } from '@/features/class-diagram'
import { ClassNode, classNodeDimensions } from './ClassNode'
import { ClassRelationshipEdge } from './ClassRelationshipEdge'
import { NamespaceNode, namespaceContains, toNamespaceRelativePosition } from './NamespaceNode'

const account: ClassDefinition = {
  id: 'Account',
  label: 'Account',
  genericParameters: ['T'],
  annotation: 'abstract',
  attributes: [{ handle: 'member:Account:0', name: 'owner', type: 'String', compartment: 'attribute', visibility: 'private' }],
  methods: [{ handle: 'member:Account:1', name: 'open', parameters: ['id: String'], returnType: 'void', compartment: 'method', visibility: 'public', classifier: 'abstract' }],
}

function relationship(type: ClassRelationship['type']): ClassRelationship {
  return { id: `relationship:${type}`, type, source: 'Account', target: 'Ledger', sourceCardinality: '1', targetCardinality: '*', label: 'owns' }
}

describe('class diagram render primitives', () => {
  it('renders annotation, generic name, member compartments, and dimensions that grow with members', () => {
    const empty = classNodeDimensions({ ...account, attributes: [], methods: [] })
    const populated = classNodeDimensions(account)
    const markup = renderToStaticMarkup(<ClassNode definition={account} selected />)

    expect(markup).toContain('«abstract»')
    expect(markup).toContain('Account&lt;T&gt;')
    expect(markup).toContain('- owner: String')
    expect(markup).toContain('+ open(id: String): void *')
    expect(markup).toContain('aria-label="Account attributes"')
    expect(markup).toContain('aria-label="Account methods"')
    expect(populated.height).toBeGreaterThan(empty.height)
    expect(populated.width).toBeGreaterThanOrEqual(empty.width)
  })

  it.each([
    ['inheritance', 'triangle', 'solid'],
    ['realization', 'triangle', 'dashed'],
    ['composition', 'diamond-filled', 'solid'],
    ['aggregation', 'diamond-open', 'solid'],
    ['association', 'arrow', 'solid'],
    ['dependency', 'arrow', 'dashed'],
    ['link', 'none', 'solid'],
  ] as const)('renders %s endpoint marker and line style', (type, marker, line) => {
    const markup = renderToStaticMarkup(<svg><ClassRelationshipEdge relationship={relationship(type)} /></svg>)
    expect(markup).toContain(`data-marker="${marker}"`)
    expect(markup).toContain(`data-line-style="${line}"`)
    expect(markup).toContain('>1</text>')
    expect(markup).toContain('>*</text>')
    expect(markup).toContain('>owns</text>')
  })

  it('recognizes namespace drop targets and derives child-relative coordinates', () => {
    const bounds = { x: 100, y: 80, width: 320, height: 240 }
    expect(namespaceContains(bounds, { x: 140, y: 120 })).toBe(true)
    expect(namespaceContains(bounds, { x: 421, y: 120 })).toBe(false)
    expect(toNamespaceRelativePosition(bounds, { x: 140, y: 120 })).toEqual({ x: 40, y: 40 })
  })

  it('renders namespaces as non-intercepting containers with an accessible header', () => {
    const markup = renderToStaticMarkup(<NamespaceNode namespace={{ id: 'Domain', label: 'Domain' }} selected />)
    expect(markup).toContain('namespace-node--selected')
    expect(markup).toContain('data-namespace-id="Domain"')
    expect(markup).toContain('role="group"')
    expect(markup).toContain('aria-label="Namespace Domain"')
  })
})
