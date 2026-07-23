import { describe, expect, it } from 'vitest'
import { parseClassDiagram } from './parser'
import type { ClassParseResult } from './types'
import { serializeClassDiagram } from './serializer'

const corpus = import.meta.glob<string>(
  '../../../../../test/fixtures/mermaid-docs/class/examples/*.mmd',
  { eager: true, query: '?raw', import: 'default' },
)

const unsupported = new Map([
  ['004-class-labels.mmd', 'bracketed class labels'],
  ['005-class-labels.mmd', 'backtick class identifiers'],
  ['013-two-way-relations.mmd', 'two-way relationships'],
  ['014-lollipop-interfaces.mmd', 'lollipop interfaces'],
  ['015-lollipop-interfaces.mmd', 'lollipop interfaces'],
])

function model(result: ClassParseResult) {
  return {
    classes: result.classes.map(item => ({
      id: item.id, label: item.label, genericParameters: item.genericParameters, annotation: item.annotation ?? null, parentId: item.parentId ?? null,
      attributes: item.attributes.map(({ range: _range, ...member }) => member),
      methods: item.methods.map(({ range: _range, ...member }) => member),
    })),
    namespaces: result.namespaces.map(item => ({ id: item.id, label: item.label, parentId: item.parentId ?? null })),
    relationships: result.relationships.map(({ id: _id, ...relationship }) => relationship),
  }
}

describe('class diagram corpus', () => {
  it('classifies every pinned fixture and round-trips every supported fixture semantically', () => {
    expect(Object.keys(corpus)).toHaveLength(32)
    for (const [path, source] of Object.entries(corpus)) {
      const name = path.split('/').at(-1) ?? path
      if (unsupported.has(name)) {
        expect(parseClassDiagram(source).diagnostics.length, `${name}: ${unsupported.get(name)}`).toBeGreaterThan(0)
        continue
      }
      const parsed = parseClassDiagram(source)
      expect(parsed.diagnostics, name).toEqual([])
      expect(model(parseClassDiagram(serializeClassDiagram(parsed))), name).toEqual(model(parsed))
    }
  })
})
