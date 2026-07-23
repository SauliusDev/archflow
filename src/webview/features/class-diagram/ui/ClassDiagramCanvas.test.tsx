import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('zustand')

import ClassDiagramCanvas from './ClassDiagramCanvas'
import { useStore } from '@/state/createStore'
import { classAdapter } from '@/features/class-diagram'
import { createDocumentSession } from '@/lib/documentSession'
import type { LayoutStateV2 } from '../../../../shared/diagram-contracts'

const source = [
  'classDiagram',
  'class Account {',
  '  -String owner',
  '}',
  'class Ledger {',
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
  useStore.getState().initializeDocumentSession(createDocumentSession('class-ui-session', 1, projection, layout))
}

function initializeWithNamespace(): void {
  const namespaced = ['classDiagram', 'namespace Domain {', '  class Account {', '  }', '}', 'class Ledger {', '}', 'Account --> Ledger', ''].join('\n')
  useStore.getState().initializeDocumentSession(createDocumentSession('class-namespace-session', 1, classAdapter.parse(namespaced, 1), layout))
}

describe('ClassDiagramCanvas', () => {
  beforeEach(() => initialize())

  it('creates a class and commits an inline rename with Enter', () => {
    render(<ClassDiagramCanvas />)

    fireEvent.click(screen.getByRole('button', { name: 'Add class' }))
    expect((screen.getByRole('textbox', { name: 'Class name' }) as HTMLInputElement).value).toBe('Class')
    fireEvent.change(screen.getByRole('textbox', { name: 'Class name' }), { target: { value: 'Invoice' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Class name' }), { key: 'Enter' })

    expect(useStore.getState().codeSource).toContain('class Invoice')
  })

  it('cancels an inline rename with Escape', () => {
    render(<ClassDiagramCanvas />)

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Account' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Class name' }), { target: { value: 'Customer' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Class name' }), { key: 'Escape' })

    expect(useStore.getState().codeSource).toContain('class Account')
    expect(useStore.getState().codeSource).not.toContain('class Customer')
  })

  it('adds, edits, reorders, deletes, and changes member metadata', () => {
    render(<ClassDiagramCanvas />)
    fireEvent.click(screen.getByRole('button', { name: 'Select class Account' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'New attribute' }), { target: { value: '+Int balance' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add attribute' }))
    expect(useStore.getState().codeSource).toContain('+Int balance')

    fireEvent.click(screen.getByRole('button', { name: 'Edit owner' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Member member:Account:0' }), { target: { value: '+String holder' } })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Member member:Account:0' }), { key: 'Enter' })
    expect(useStore.getState().codeSource).toContain('+String holder')

    fireEvent.click(screen.getByRole('button', { name: 'Make holder private' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make holder public' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make holder static' }))
    expect(useStore.getState().codeSource).toContain('+String holder$')

    fireEvent.click(screen.getByRole('button', { name: 'Delete holder' }))
    expect(useStore.getState().codeSource).not.toContain('holder')
  })

  it('creates and edits relationships while duplicate creation is rejected by the store', () => {
    render(<ClassDiagramCanvas />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Relationship source' }), { target: { value: 'Ledger' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Relationship target' }), { target: { value: 'Account' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Relationship type' }), { target: { value: 'dependency' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create relationship' }))
    expect(useStore.getState().codeSource).toContain('Ledger ..> Account')

    fireEvent.click(screen.getByRole('button', { name: 'Select relationship relationship:6' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Selected relationship type' }), { target: { value: 'composition' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Source cardinality' }), { target: { value: '1' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Target cardinality' }), { target: { value: '*' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reverse relationship' }))
    expect(useStore.getState().codeSource).toContain('Ledger "*" *-- "1" Account')

    act(() => useStore.getState().applyClassOperation({ kind: 'add-relationship', source: 'Ledger', target: 'Account', type: 'composition' }))
    expect(useStore.getState().announcement).toBe('A matching relationship already exists')
  })

  it('deletes a class and attached relationships together', () => {
    render(<ClassDiagramCanvas />)
    fireEvent.click(screen.getByRole('button', { name: 'Select class Account' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete class Account' }))

    expect(useStore.getState().codeSource).not.toContain('Account')
    expect(useStore.getState().codeSource).not.toContain('posts')
  })

  it('persists moved and resized class geometry without rewriting semantic source', () => {
    render(<ClassDiagramCanvas />)
    const sourceBeforeGeometry = useStore.getState().codeSource

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Move class Account' }), { clientX: 10, clientY: 20 })
    fireEvent.pointerUp(window, { clientX: 130, clientY: 92 })
    fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize class Account' }), { clientX: 100, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 160, clientY: 140 })

    const geometry = useStore.getState().documentSession?.layout.elements['class:Account']
    expect(geometry).toMatchObject({ x: 168, y: 120, width: 240, height: 158 })
    expect(useStore.getState().codeSource).toBe(sourceBeforeGeometry)
    expect(useStore.getState().documentSession?.history.past).toHaveLength(2)
  })

  it('adds a namespace with default geometry and preserves relationships through containment changes', () => {
    render(<ClassDiagramCanvas />)
    const relationship = 'Account --> Ledger : posts'

    fireEvent.click(screen.getByRole('button', { name: 'Add namespace' }))
    expect(useStore.getState().codeSource).toContain('namespace Namespace {\n}')
    expect(useStore.getState().documentSession?.layout.elements['namespace:Namespace']).toEqual({ x: 48, y: 48, width: 320, height: 240 })

    fireEvent.click(screen.getByRole('button', { name: 'Select class Account' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Class namespace' }), { target: { value: 'Namespace' } })
    expect(useStore.getState().codeSource).toContain(relationship)
    fireEvent.click(screen.getByRole('button', { name: 'Delete namespace Namespace' }))
    expect(useStore.getState().codeSource).toContain(relationship)
  })

  it('moves classes into and out of existing namespaces and promotes children on namespace deletion', () => {
    initializeWithNamespace()
    render(<ClassDiagramCanvas />)
    fireEvent.click(screen.getByRole('button', { name: 'Select class Ledger' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Class namespace' }), { target: { value: 'Domain' } })
    expect(useStore.getState().codeSource).toContain('  class Ledger {')

    fireEvent.change(screen.getByRole('combobox', { name: 'Class namespace' }), { target: { value: '' } })
    expect(useStore.getState().codeSource).toContain('\nclass Ledger {')

    fireEvent.click(screen.getByRole('button', { name: 'Delete namespace Domain' }))
    expect(useStore.getState().codeSource).not.toContain('namespace Domain')
    expect(useStore.getState().codeSource).toContain('class Account')
    expect(useStore.getState().codeSource).toContain('Account --> Ledger')
  })
})
