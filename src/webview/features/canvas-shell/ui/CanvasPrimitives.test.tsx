import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasDescriptor } from '../../../../shared/diagram-contracts'
import CanvasPrimitives from './CanvasPrimitives'

const descriptor: CanvasDescriptor = {
  elements: [
    { id: 'node:A', kind: 'element', label: 'Account', focusable: true, selected: true, disabled: false, operations: ['rename'] },
    { id: 'container:Domain', kind: 'container', label: 'Domain', focusable: true, selected: false, disabled: false, operations: ['add'] },
    { id: 'compartment:Fields', kind: 'compartment', label: 'Fields', focusable: false, selected: false, disabled: false, operations: [] },
    { id: 'note:1', kind: 'note', label: 'Important', focusable: true, selected: false, disabled: false, operations: ['edit'] },
    { id: 'anchor:A:east', kind: 'anchor', label: 'East anchor', focusable: true, selected: false, disabled: false, operations: ['connect'] },
    { id: 'port:A:http', kind: 'port', label: 'HTTP port', focusable: true, selected: false, disabled: true, operations: ['connect'] },
    { id: 'lane:1', kind: 'ordered-lane', label: 'First lane', focusable: true, selected: false, disabled: false, operations: ['reorder'], metadata: { position: 1, size: 2 } },
    { id: 'guide:x', kind: 'alignment-guide', label: 'X alignment', focusable: false, selected: false, disabled: false, operations: [] },
  ],
  connectors: [{ id: 'edge:A-Domain', source: 'node:A', target: 'container:Domain', label: 'belongs to', operations: ['delete'] }],
}

describe('CanvasPrimitives', () => {
  it('exposes every primitive with a non-color kind cue, accessible name, state, and ordered-lane metadata', () => {
    render(<CanvasPrimitives descriptor={descriptor} onOperation={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Account, element' }).getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByRole('button', { name: 'HTTP port, port' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('element')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'First lane, ordered lane' }).getAttribute('aria-posinset')).toBe('1')
    expect(screen.getByRole('button', { name: 'First lane, ordered lane' }).getAttribute('aria-setsize')).toBe('2')
    expect(screen.getByRole('listitem', { name: 'belongs to connector from Account to Domain' })).not.toBeNull()
  })

  it('provides click and keyboard parity and announces adapter-issued operations', () => {
    const onOperation = vi.fn()
    render(<CanvasPrimitives descriptor={descriptor} onOperation={onOperation} />)
    const account = screen.getByRole('button', { name: 'Account, element' })
    fireEvent.click(account)
    fireEvent.keyDown(account, { key: 'Enter' })
    expect(onOperation).toHaveBeenNthCalledWith(1, 'rename', 'node:A')
    expect(onOperation).toHaveBeenNthCalledWith(2, 'rename', 'node:A')
    expect(screen.getByRole('status').textContent).toBe('rename Account')
  })

  it('does not expose unavailable actions on non-focusable primitives', () => {
    render(<CanvasPrimitives descriptor={descriptor} onOperation={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Fields/ })).toBeNull()
    expect(screen.getByText('Fields').closest('[data-canvas-kind]')?.getAttribute('tabindex')).toBe('-1')
  })
})
