import { describe, expect, it, vi } from 'vitest'

vi.mock('zustand')

import { useStore } from '@/state/createStore'
import { classAdapter } from '@/features/class-diagram'
import { createDocumentSession } from './documentSession'
import type { LayoutStateV2 } from '../../shared/diagram-contracts'

const source = [
  'classDiagram',
  'namespace Domain {',
  '  class Account {',
  '    +String owner',
  '    -Int balance',
  '    +deposit(amount) bool',
  '  }',
  '  class Ledger {',
  '  }',
  '}',
  'class Journal {',
  '}',
  'Account --> Ledger : posts',
  '',
].join('\n')

const layout: LayoutStateV2 = {
  version: 2,
  diagramFamily: 'class',
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: {},
  edges: {},
  constraints: [],
}

function initialize(): void {
  const projection = classAdapter.parse(source, 1)
  useStore.getState().initializeDocumentSession(createDocumentSession('class-session', 1, projection, layout))
}

describe('class diagram store mutations', () => {
  it.each([
    ['apply class operation', (state: ReturnType<typeof useStore.getState>) => state.applyClassOperation({ kind: 'add-class', id: 'Entry' })],
    ['update class geometry', (state: ReturnType<typeof useStore.getState>) => state.updateClassGeometry('Account', { x: 48, y: 48, width: 180, height: 120 })],
  ])('reports %s session guards without mutation', (_name, action) => {
    initialize()
    const before = useStore.getState()

    for (const [session, announcement] of [
      [{ ...before.documentSession!, family: 'flowchart' as const, conflict: null }, 'This action is unavailable for this diagram.'],
      [{ ...before.documentSession!, conflict: { eventId: 'external' } }, 'Resolve external changes before editing.'],
    ] as const) {
      useStore.setState({ documentSession: session as never, announcement: null })
      action(useStore.getState())
      const after = useStore.getState()
      expect(after).toMatchObject({ announcement, codeSource: before.codeSource, classDiagram: before.classDiagram })
      expect(after.documentSession).toBe(session)
    }
  })

  it('commits each semantic operation as one revisioned source transaction', () => {
    initialize()

    useStore.getState().applyClassOperation({ kind: 'rename-class', id: 'Ledger', label: 'Journal' })

    const state = useStore.getState()
    expect(state.codeSource).toContain('class Journal')
    expect(state.classDiagram?.classes.some(item => item.id === 'Journal')).toBe(true)
    expect(state.documentSession?.history.past).toHaveLength(1)
    expect(state.documentSession?.history.past[0]).toMatchObject({ description: 'Rename class Ledger' })
  })

  it('routes every class semantic operation through exactly one history entry', () => {
    const relationshipId = 'relationship:12'
    const attribute = 'member:Account:0'
    const secondAttribute = 'member:Account:1'
    const operations = [
        { kind: 'add-class', id: 'Entry' },
        { kind: 'rename-class', id: 'Journal', label: 'JournalEntry' },
        { kind: 'delete-class', id: 'Journal' },
        { kind: 'add-member', classId: 'Account', memberText: '+close() bool' },
        { kind: 'edit-member', handle: attribute, memberText: '+String holder' },
        { kind: 'reorder-member', handle: secondAttribute, beforeHandle: attribute },
        { kind: 'delete-member', handle: attribute },
        { kind: 'set-visibility', handle: attribute, visibility: 'private' },
        { kind: 'set-classifier', handle: attribute, classifier: 'static' },
        { kind: 'set-annotation', id: 'Account', annotation: 'service' },
        { kind: 'add-relationship', source: 'Account', target: 'Journal', type: 'dependency' },
        { kind: 'update-relationship', id: relationshipId, type: 'composition', label: 'owns' },
        { kind: 'reverse-relationship', id: relationshipId },
        { kind: 'delete-relationship', id: relationshipId },
        { kind: 'set-cardinality', id: relationshipId, end: 'source', value: '0..1' },
        { kind: 'add-namespace', id: 'DomainTwo' },
        { kind: 'move-class-to-namespace', id: 'Journal', namespaceId: 'Domain' },
        { kind: 'delete-namespace', id: 'Domain' },
    ] as const;

    for (const operation of operations) {
      initialize()
      useStore.getState().applyClassOperation(operation)
      expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
    }
  })

  it('undoes and redoes a class deletion and its attached relationships atomically', () => {
    initialize()

    useStore.getState().applyClassOperation({ kind: 'delete-class', id: 'Account' })
    expect(useStore.getState().codeSource).not.toContain('Account')
    expect(useStore.getState().documentSession?.history.past).toHaveLength(1)

    useStore.getState().undo()
    expect(useStore.getState().codeSource).toBe(source)

    useStore.getState().redo()
    expect(useStore.getState().codeSource).not.toContain('Account')
  })

  it('adopts valid code edits without replacing geometry for unchanged class identifiers', () => {
    initialize()
    const beforeLayout: LayoutStateV2 = {
      ...useStore.getState().documentSession!.layout,
      elements: { 'class:Account': { x: 240, y: 120, width: 280, height: 190 } },
    }
    useStore.setState(state => ({ documentSession: { ...state.documentSession!, layout: beforeLayout } }))

    useStore.getState().applyCodeSource(source.replace('-Int balance', '-Int availableBalance'))

    const state = useStore.getState()
    expect(state.classDiagram?.classes.find(item => item.id === 'Account')?.attributes[1]?.name).toBe('availableBalance')
    expect(state.documentSession?.layout.elements['class:Account']).toEqual({ x: 240, y: 120, width: 280, height: 190 })
  })

  it('keeps the last valid class model and geometry when code is invalid', () => {
    initialize()
    const before = useStore.getState()
    const model = before.classDiagram
    const session = before.documentSession!
    const layout: LayoutStateV2 = { ...session.layout, elements: { 'class:Account': { x: 40, y: 80, width: 220, height: 160 } } }
    useStore.setState({ documentSession: { ...session, layout } })

    useStore.getState().applyCodeSource('classDiagram\nclass `Unsupported`\n')

    expect(useStore.getState().classDiagram).toBe(model)
    expect(useStore.getState().documentSession?.source).toBe(source)
    expect(useStore.getState().documentSession?.layout).toEqual(layout)
  })

  it('persists class geometry in LayoutStateV2 without changing canonical source', () => {
    initialize()
    const before = useStore.getState().codeSource

    useStore.getState().updateClassGeometry('Account', { x: 144, y: 96, width: 260, height: 180 })

    expect(useStore.getState().codeSource).toBe(before)
    expect(useStore.getState().documentSession?.layout.elements['class:Account']).toEqual({ x: 144, y: 96, width: 260, height: 180 })
    expect(useStore.getState().documentSession?.history.past).toHaveLength(1)
  })

  it('converts geometry between namespace-relative and top-level coordinates without altering relationships', () => {
    initialize()
    const session = useStore.getState().documentSession!
    useStore.setState({ documentSession: {
      ...session,
      layout: { ...session.layout, elements: {
        'namespace:Domain': { x: 100, y: 50, width: 320, height: 240 },
        'class:Journal': { x: 400, y: 300, width: 180, height: 120 },
      } },
    } })

    useStore.getState().applyClassOperation({ kind: 'move-class-to-namespace', id: 'Journal', namespaceId: 'Domain' })
    expect(useStore.getState().documentSession?.layout.elements['class:Journal']).toMatchObject({ x: 300, y: 250 })
    expect(useStore.getState().codeSource).toContain('Account --> Ledger : posts')

    useStore.getState().applyClassOperation({ kind: 'move-class-to-namespace', id: 'Journal', namespaceId: null })
    expect(useStore.getState().documentSession?.layout.elements['class:Journal']).toMatchObject({ x: 400, y: 300 })
    expect(useStore.getState().codeSource).toContain('Account --> Ledger : posts')
  })
})
