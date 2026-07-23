import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import DescriptorCanvas from './DescriptorCanvas'

const base = { label: '', focusable: true, selected: false, disabled: false, operations: ['select'] }

describe('DescriptorCanvas shared primitives', () => {
  it('renders every shared primitive and connector label by semantic handle', () => {
    const onSelect = vi.fn()
    render(<DescriptorCanvas
      descriptor={{
        elements: [
          { ...base, id: 'element:A', kind: 'element', label: 'A' },
          { ...base, id: 'container:B', kind: 'container', label: 'B' },
          { ...base, id: 'note:C', kind: 'note', label: 'C' },
          { ...base, id: 'port:D', kind: 'port', label: 'D' },
          { ...base, id: 'lane:E', kind: 'ordered-lane', label: 'E' },
          { ...base, id: 'compartment:F', kind: 'compartment', label: 'F' },
          { ...base, id: 'anchor:G', kind: 'anchor', label: 'G' },
          { ...base, id: 'guide:H', kind: 'alignment-guide', label: 'H' },
        ],
        connectors: [{ id: 'edge:AB', source: 'element:A', target: 'container:B', label: 'relates', operations: ['select'] }],
      }}
      geometry={{ 'element:A': { x: 10, y: 20, width: 100, height: 40 } }}
      onSelect={onSelect}
    />)

    expect(screen.getAllByRole('button')).toHaveLength(9)
    const element = screen.getByRole('button', { name: 'element: A' })
    expect(element.getAttribute('data-semantic-handle')).toBe('element:A')
    expect(element.style.transform).toBe('translate(10px, 20px)')
    expect(element.style.width).toBe('100px')
    expect(element.style.height).toBe('40px')
    fireEvent.click(screen.getByRole('button', { name: 'note: C' }))
    expect(onSelect).toHaveBeenCalledWith('note:C')
    expect(screen.getByRole('status').textContent).toBe('C selected')
    fireEvent.click(screen.getByRole('button', { name: 'connector: relates' }))
    expect(onSelect).toHaveBeenCalledWith('edge:AB')
  })

  it('exposes selected state and blocks unavailable or read-only actions', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<DescriptorCanvas
      descriptor={{ elements: [{ ...base, id: 'element:A', kind: 'element', label: 'A', selected: true, disabled: true }], connectors: [] }}
      geometry={{}}
      onSelect={onSelect}
    />)
    const element = screen.getByRole('button', { name: 'element: A' })
    expect(element.getAttribute('aria-pressed')).toBe('true')
    expect((element as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(element)
    expect(onSelect).not.toHaveBeenCalled()

    rerender(<DescriptorCanvas
      descriptor={{ elements: [{ ...base, id: 'element:A', kind: 'element', label: 'A' }], connectors: [] }}
      geometry={{}}
      readOnly
      onSelect={onSelect}
    />)
    expect((screen.getByRole('button', { name: 'element: A' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
