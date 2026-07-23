import { describe, expect, it } from 'vitest'
import { createDocumentSession } from '../../../lib/documentSession'
import type { LayoutStateV2 } from '../../../../shared/diagram-contracts'
import { classAdapter } from './adapter'
import { executeClassDiagramCommand, executeClassGeometryCommand } from './commands'

const layout: LayoutStateV2 = {
  version: 2,
  diagramFamily: 'class',
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: {},
  edges: {},
  constraints: [],
}

function session(source = 'classDiagram\nclass Account {\n}\n'): ReturnType<typeof createDocumentSession> {
  return createDocumentSession('class-command', 1, classAdapter.parse(source, 1), layout)
}

const dependencies = { createId: () => 'class-transaction' }

describe('executeClassDiagramCommand', () => {
  it('commits class source and derived layout in one revisioned history entry', () => {
    const result = executeClassDiagramCommand(session(), { kind: 'add-class', id: 'Ledger' }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).toContain('class Ledger')
    expect(result.value.layout.elements['class:Ledger']).toEqual({ x: 72, y: 72, width: 180, height: 120 })
    expect(result.value.workingRevision).toBe(2)
    expect(result.value.history.past).toHaveLength(1)
    expect(result.value.history.past[0]).toMatchObject({ id: 'class-transaction', description: 'Add class Ledger' })
  })

  it('keeps namespace-relative geometry correct when moving a class', () => {
    const current = { ...session('classDiagram\nnamespace Domain {\n  class Account {\n  }\n}\n'), layout: {
      ...layout,
      elements: {
        'namespace:Domain': { x: 100, y: 50, width: 320, height: 240 },
        'class:Account': { x: 20, y: 30, width: 180, height: 120 },
      },
    } }
    const result = executeClassDiagramCommand(current, { kind: 'move-class-to-namespace', id: 'Account', namespaceId: null }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.layout.elements['class:Account']).toMatchObject({ x: 120, y: 80 })
  })

  it('removes deleted class geometry in the same source transaction', () => {
    const current = createDocumentSession('class-delete', 1, classAdapter.parse('classDiagram\nclass Account {\n}\nclass Ledger {\n}\n', 1), {
      ...layout,
      elements: { 'class:Account': { x: 48, y: 48, width: 180, height: 120 }, 'class:Ledger': { x: 240, y: 48, width: 180, height: 120 } },
    })
    const result = executeClassDiagramCommand(current, { kind: 'delete-class', id: 'Account' }, dependencies)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) return
    expect(result.value.source).not.toContain('class Account')
    expect(result.value.layout.elements).toEqual({ 'class:Ledger': { x: 240, y: 48, width: 180, height: 120 } })
    expect(result.value.history.past).toEqual([expect.objectContaining({ id: 'class-transaction', description: 'Delete class Account' })])
  })

  it('rejects unsupported families, unresolved conflicts, and invalid operations', () => {
    expect(executeClassDiagramCommand({ ...session(), family: 'flowchart' as const }, { kind: 'add-class', id: 'Ledger' }, dependencies)).toMatchObject({ ok: false, code: 'unsupported-family' })
    const conflicted = { ...session(), conflict: { eventId: 'external', content: '', hostRevision: 2, projection: session().projection, layout } }
    expect(executeClassDiagramCommand(conflicted, { kind: 'add-class', id: 'Ledger' }, dependencies)).toMatchObject({ ok: false, code: 'external-conflict' })
    expect(executeClassDiagramCommand(session(), { kind: 'rename-class', id: 'Missing', label: 'Nope' }, dependencies)).toMatchObject({ ok: false, code: 'invalid-operation' })
    const current = session()
    const stale = { ...current, projection: { ...current.projection, concrete: { ...current.projection.concrete, revision: 7 } } }
    expect(executeClassDiagramCommand(stale, { kind: 'rename-class', id: 'Account', label: 'Ledger' }, dependencies)).toMatchObject({ ok: false, code: 'stale-transaction' })
  })

  it('classifies unexpected semantic and geometry executor exceptions as safe internal failures', () => {
    const throwingDependencies = { createId: () => { throw new Error('credential=super-secret') } }

    const semantic = executeClassDiagramCommand(session(), { kind: 'add-class', id: 'Ledger' }, throwingDependencies)
    const geometry = executeClassGeometryCommand(session(), 'Account', { x: 40, y: 80, width: 180, height: 120 }, throwingDependencies)

    expect(semantic).toMatchObject({ ok: false, code: 'internal-error' })
    expect(geometry).toMatchObject({ ok: false, code: 'internal-error' })
    if (!semantic.ok) expect(semantic.message).not.toContain('super-secret')
    if (!geometry.ok) expect(geometry.message).not.toContain('super-secret')
  })

  it('does not misclassify arbitrary semantic planning exceptions as validation failures', () => {
    const explosiveOperation = Object.defineProperty({}, 'kind', {
      get: () => { throw new Error('credential=super-secret must be retained') },
    })
    const result = executeClassDiagramCommand(session(), explosiveOperation as never, dependencies)

    expect(result).toMatchObject({ ok: false, code: 'internal-error' })
    if (result.ok) return
    expect(result.message).not.toContain('super-secret')
  })
})
