import { describe, expect, it } from 'vitest'
import { parseClassDiagram } from './parser'
import { issueClassMemberReplacement, issueClassOperation } from './operations'

const source = [
  'classDiagram',
  'namespace Domain {',
  '  class Account {',
  '    <<interface>>',
  '    +String owner',
  '    +deposit(amount) bool',
  '  }',
  '}',
  'class Ledger',
  'Account "1" --> "*" Ledger : posts',
  '',
].join('\n')

function issue(operation: Parameters<typeof issueClassOperation>[1], revision = 7) {
  return issueClassOperation(parseClassDiagram(source, revision), operation)
}

describe('class semantic source operations', () => {
  it('defines surgical, revision-guarded operations for every semantic kind', () => {
    const operations = [
      issue({ kind: 'add-class', id: 'Entry' }),
      issue({ kind: 'rename-class', id: 'Account', label: 'Customer' }),
      issue({ kind: 'delete-class', id: 'Account' }),
      issue({ kind: 'add-member', classId: 'Account', memberText: '+close() bool' }),
      issue({ kind: 'edit-member', handle: 'member:Account:1', memberText: '+deposit(amount, memo) bool' }),
      issue({ kind: 'reorder-member', handle: 'member:Account:1' }),
      issue({ kind: 'delete-member', handle: 'member:Account:0' }),
      issue({ kind: 'set-visibility', handle: 'member:Account:0', visibility: 'private' }),
      issue({ kind: 'set-classifier', handle: 'member:Account:0', classifier: 'static' }),
      issue({ kind: 'set-annotation', id: 'Account', annotation: 'service' }),
      issue({ kind: 'add-relationship', source: 'Account', target: 'Ledger', type: 'dependency' }),
      issue({ kind: 'update-relationship', id: 'relationship:9', type: 'composition', label: 'owns' }),
      issue({ kind: 'reverse-relationship', id: 'relationship:9' }),
      issue({ kind: 'delete-relationship', id: 'relationship:9' }),
      issue({ kind: 'set-cardinality', id: 'relationship:9', end: 'source', value: '0..1' }),
      issue({ kind: 'add-namespace', id: 'DomainTwo' }),
      issue({ kind: 'move-class-to-namespace', id: 'Ledger', namespaceId: 'Domain' }),
      issue({ kind: 'delete-namespace', id: 'Domain' }),
    ]

    expect(operations.every(group => group.every(operation => operation.expectedRevision === 7))).toBe(true)
    expect(operations.flat().some(operation => operation.kind === 'insert')).toBe(true)
    expect(operations.flat().some(operation => operation.kind === 'replace')).toBe(true)
    expect(operations.flat().some(operation => operation.kind === 'delete')).toBe(true)
  })

  it('uses expected text guards for owned replacements and deletes', () => {
    const rename = issue({ kind: 'rename-class', id: 'Account', label: 'Customer' })
    const annotation = issue({ kind: 'set-annotation', id: 'Account', annotation: 'service' })
    const relationship = issue({ kind: 'set-cardinality', id: 'relationship:9', end: 'source', value: '0..1' })
    const deletion = issue({ kind: 'delete-class', id: 'Account' })

    expect(rename.every(operation => operation.kind === 'replace' && operation.expectedText.length > 0)).toBe(true)
    expect(annotation).toEqual([expect.objectContaining({
      kind: 'replace', text: '    <<service>>', expectedText: '    <<interface>>', expectedRevision: 7,
    })])
    expect(relationship).toEqual([expect.objectContaining({
      kind: 'replace', text: 'Account "0..1" --> "*" Ledger : posts', expectedRevision: 7,
    })])
    expect(deletion.every(operation => operation.kind === 'delete' && operation.expectedText.length > 0)).toBe(true)
  })

  it('replaces only the owned member range and preserves unrelated source bytes', () => {
    const parsed = parseClassDiagram(source)
    const operation = issueClassMemberReplacement(parsed, 'member:Account:1', '+deposit(amount, memo) bool')

    expect(operation).toMatchObject({
      kind: 'replace',
      expectedText: '    +deposit(amount) bool',
      expectedRevision: 1,
    })
  })

  it('appends a new namespace after the source boundary without changing existing relationships', () => {
    const operations = issue({ kind: 'add-namespace', id: 'DomainTwo' })

    expect(operations).toEqual([expect.objectContaining({
      kind: 'insert', at: source.length, text: 'namespace DomainTwo {\n}', expectedRevision: 7,
    })])
    expect(source).toContain('Account "1" --> "*" Ledger : posts')
  })
})
