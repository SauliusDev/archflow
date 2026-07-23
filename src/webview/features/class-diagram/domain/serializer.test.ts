import { describe, expect, it } from 'vitest'
import { parseClassDiagram } from './parser'
import { serializeClassDiagram } from './serializer'

describe('serializeClassDiagram', () => {
  it('emits valid classDiagram source preserving member metadata in reference order', () => {
    const parsed = parseClassDiagram('classDiagram\nclass Account {\n  -int balance$\n  +deposit(amount) bool*\n}\nAccount "1" --> "*" Ledger : records\n')
    const serialized = serializeClassDiagram(parsed)

    expect(serialized).toBe([
      'classDiagram',
      'class Account {',
      '  -int balance$',
      '  +deposit(amount) bool*',
      '}',
      'class Ledger',
      'Account "1" --> "*" Ledger : records',
      '',
    ].join('\n'))
    expect(parseClassDiagram(serialized)).toMatchObject({
      classes: expect.arrayContaining([expect.objectContaining({ id: 'Account' })]),
      relationships: [expect.objectContaining({ source: 'Account', target: 'Ledger', type: 'association' })],
    })
  })

  it('preserves notes, directives, frontmatter, and comments when serializing an edited model', () => {
    const parsed = parseClassDiagram('---\ntitle: Keep\n---\nclassDiagram\n%% retain\nnote for Account "Important"\nclass Account\nclick Account href "https://example.com"\nstyle Account fill:#fff\ndirection LR\n')
    const serialized = serializeClassDiagram(parsed)

    expect(serialized).toContain('title: Keep')
    expect(serialized).toContain('%% retain')
    expect(serialized).toContain('note for Account "Important"')
    expect(serialized).toContain('click Account href "https://example.com"')
    expect(serialized).toContain('style Account fill:#fff')
    expect(serialized).toContain('direction LR')
  })

  it('drops only preserved constructs that refer exclusively to a deleted class', () => {
    const parsed = parseClassDiagram('classDiagram\n%% retain\nclass Account\nclass Ledger\nnote for Account "Remove"\nnote for Ledger "Keep"\nclick Account href "https://example.com"\nstyle Ledger fill:#fff\n')
    const serialized = serializeClassDiagram({ ...parsed, classes: parsed.classes.filter(item => item.id !== 'Account') })

    expect(serialized).not.toContain('note for Account')
    expect(serialized).not.toContain('click Account')
    expect(serialized).toContain('note for Ledger')
    expect(serialized).toContain('style Ledger')
    expect(serialized).toContain('%% retain')
  })
})
