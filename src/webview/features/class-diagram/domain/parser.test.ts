import { describe, expect, it } from 'vitest'
import { parseClassDiagram } from './parser'

describe('parseClassDiagram', () => {
  it('parses block and statement declarations, including classes introduced by relationships', () => {
    const result = parseClassDiagram([
      'classDiagram',
      'class Account {',
      '  +String owner',
      '  +deposit(amount) bool',
      '}',
      'Account : -int balance$',
      'Account : ~String internalCode',
      'Account <|-- SavingsAccount',
      '',
    ].join('\n'))

    expect(result.classes.map(item => item.id)).toEqual(['Account', 'SavingsAccount'])
    expect(result.classes[0]).toMatchObject({
      attributes: [
        expect.objectContaining({ name: 'owner', type: 'String', visibility: 'public' }),
        expect.objectContaining({ name: 'balance', type: 'int', visibility: 'private', classifier: 'static' }),
        expect.objectContaining({ name: 'internalCode', type: 'String', visibility: 'package' }),
      ],
      methods: [expect.objectContaining({ name: 'deposit', parameters: ['amount'], returnType: 'bool' })],
    })
    expect(result.relationships).toEqual([expect.objectContaining({ type: 'inheritance', source: 'SavingsAccount', target: 'Account' })])
  })

  it('keeps annotations, generic parameters, namespaces, cardinality, labels, and member handles structured', () => {
    const result = parseClassDiagram([
      'classDiagram',
      'namespace Shapes {',
      '  class Square~Shape~ {',
      '    <<interface>>',
      '    #List~int~ points',
      '    +getPoints() List~int~*',
      '  }',
      '}',
      'Square "1" --> "*" Canvas : renders',
      '',
    ].join('\n'))

    expect(result.namespaces).toEqual([expect.objectContaining({ id: 'Shapes' })])
    expect(result.classes[0]).toMatchObject({ id: 'Square', genericParameters: ['Shape'], annotation: 'interface', parentId: 'Shapes' })
    expect(result.classes[0].attributes[0]).toMatchObject({ handle: 'member:Square:0', visibility: 'protected', type: 'List~int~' })
    expect(result.classes[0].methods[0]).toMatchObject({ handle: 'member:Square:1', classifier: 'abstract', returnType: 'List~int~' })
    expect(result.relationships[0]).toMatchObject({ type: 'association', source: 'Square', target: 'Canvas', sourceCardinality: '1', targetCardinality: '*', label: 'renders' })
  })

  it('keeps compartment order and stable member handles across attribute and method members', () => {
    const result = parseClassDiagram('classDiagram\nclass Item {\n  first\n  second\n  execute()\n  finish()\n}\n')

    expect(result.classes[0].attributes.map(member => [member.name, member.handle])).toEqual([
      ['first', 'member:Item:0'], ['second', 'member:Item:1'],
    ])
    expect(result.classes[0].methods.map(member => [member.name, member.handle])).toEqual([
      ['execute', 'member:Item:2'], ['finish', 'member:Item:3'],
    ])
  })

  it.each([
    ['interface', 'class Shape <<interface>>'],
    ['abstract', 'class Shape <<abstract>>'],
    ['enumeration', 'class Shape <<enumeration>>'],
    ['service', 'class Shape <<service>>'],
  ] as const)('parses the %s annotation', (annotation, declaration) => {
    expect(parseClassDiagram(`classDiagram\n${declaration}\n`).classes[0]).toMatchObject({ annotation })
  })

  it.each([
    ['A <|-- B', 'inheritance', 'B', 'A'],
    ['A *-- B', 'composition', 'A', 'B'],
    ['A o-- B', 'aggregation', 'A', 'B'],
    ['A --> B', 'association', 'A', 'B'],
    ['A ..> B', 'dependency', 'A', 'B'],
    ['A ..|> B', 'realization', 'A', 'B'],
    ['A -- B', 'link', 'A', 'B'],
  ] as const)('parses %s as %s', (source, type, relationshipSource, target) => {
    expect(parseClassDiagram(`classDiagram\n${source}\n`).relationships[0]).toMatchObject({ type, source: relationshipSource, target })
  })

  it('parents classes to their namespace while retaining their identifiers', () => {
    const result = parseClassDiagram('classDiagram\nnamespace Domain {\n  class Account\n}\n')
    expect(result.namespaces).toEqual([expect.objectContaining({ id: 'Domain' })])
    expect(result.classes).toEqual([expect.objectContaining({ id: 'Account', parentId: 'Domain' })])
  })

  it('attributes every line to a non-overlapping source construct and diagnoses unsupported syntax', () => {
    const source = 'classDiagram\n%% preserved\nclass Account\nAccount : +id\nAccount <|-- Savings\nclass `Unsafe Label`\n'
    const result = parseClassDiagram(source)
    const lines = source.trimEnd().split('\n')

    expect(result.sourceMap.constructs).toHaveLength(lines.length)
    expect(result.sourceMap.constructs.map(item => item.range)).toEqual([
      { start: 0, end: 12 }, { start: 13, end: 25 }, { start: 26, end: 39 },
      { start: 40, end: 53 }, { start: 54, end: 74 }, { start: 75, end: 95 },
    ])
    expect(result.sourceMap.constructs.map(item => item.ownership)).toContain('preserved-only')
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'unsupported-class-label', range: { start: 75, end: 95 } }))
  })
})
