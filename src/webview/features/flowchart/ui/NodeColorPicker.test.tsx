import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('zustand')

import { useStore } from '@/state/createStore'
import NodeColorPicker from './NodeColorPicker'

const TEST_NODE_ID = 'n1'
const mockUpdateNodeColors = vi.fn()
const mockOnClose = vi.fn()
const triggerRef = { current: null } as React.RefObject<HTMLButtonElement | null>

const defaultProps = {
  nodeId: TEST_NODE_ID,
  onClose: mockOnClose,
  triggerRef,
}

beforeEach(() => {
  useStore.setState({
    nodes: [{
      id: TEST_NODE_ID,
      position: { x: 0, y: 0 },
      data: { label: 'Test', shape: 'rectangle' },
      type: 'flowNode',
    }],
    updateNodeColors: mockUpdateNodeColors,
  })
  mockUpdateNodeColors.mockClear()
  mockOnClose.mockClear()
})

describe('NodeColorPicker', () => {
  it('renders three sections: Fill, Border, Text', () => {
    render(<NodeColorPicker {...defaultProps} />)
    expect(screen.getByText('Fill')).not.toBeNull()
    expect(screen.getByText('Border')).not.toBeNull()
    expect(screen.getByText('Text')).not.toBeNull()
  })

  it('renders a labelled native color input and selected value for every channel', () => {
    render(<NodeColorPicker {...defaultProps} fillColor="#112233" />)
    expect(screen.getByLabelText('Fill color').getAttribute('type')).toBe('color')
    expect(screen.getByLabelText('Fill color value').textContent).toBe('#112233')
    expect(screen.getByLabelText('Border color, default theme color').getAttribute('type')).toBe('color')
    expect(screen.getByLabelText('Text color, default theme color').getAttribute('type')).toBe('color')
  })

  it('identifies an inherited channel as Default rather than a selected black color', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const fill = screen.getByLabelText('Fill color, default theme color')
    expect(fill.getAttribute('data-inherited')).toBe('true')
    expect(screen.getByLabelText('Fill color value').textContent).toBe('Default')
    expect(screen.getByRole('button', { name: 'Fill color #1e2022' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('retains the other channels when a native color changes', () => {
    render(<NodeColorPicker {...defaultProps} fillColor="#112233" strokeColor="#445566" textColor="#778899" />)
    fireEvent.change(screen.getByLabelText('Fill color'), { target: { value: '#abcdef' } })
    expect(mockUpdateNodeColors).toHaveBeenCalledWith(TEST_NODE_ID, { fillColor: '#abcdef', strokeColor: '#445566', textColor: '#778899' })
  })

  it('each section shows 8 swatches', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const fillGroup = screen.getByRole('group', { name: 'Fill color swatches' })
    const borderGroup = screen.getByRole('group', { name: 'Border color swatches' })
    const textGroup = screen.getByRole('group', { name: 'Text color swatches' })
    expect(fillGroup.querySelectorAll('button').length).toBe(8)
    expect(borderGroup.querySelectorAll('button').length).toBe(8)
    expect(textGroup.querySelectorAll('button').length).toBe(8)
  })

  it('renders a reset button', () => {
    render(<NodeColorPicker {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Reset node colors to default' })).not.toBeNull()
  })

  it('clicking a fill swatch calls updateNodeColors with correct fillColor', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const fillSwatch = screen.getByRole('button', { name: 'Fill color #1e2022' })
    fireEvent.click(fillSwatch)
    expect(mockUpdateNodeColors).toHaveBeenCalledWith(TEST_NODE_ID, {
      fillColor: '#1e2022',
      strokeColor: undefined,
      textColor: undefined,
    })
  })

  it('clicking a border swatch calls updateNodeColors with correct strokeColor', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const borderSwatch = screen.getByRole('button', { name: 'Border color #1e2022' })
    fireEvent.click(borderSwatch)
    expect(mockUpdateNodeColors).toHaveBeenCalledWith(TEST_NODE_ID, {
      fillColor: undefined,
      strokeColor: '#1e2022',
      textColor: undefined,
    })
  })

  it('clicking a text swatch calls updateNodeColors with correct textColor', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const textSwatch = screen.getByRole('button', { name: 'Text color #1e2022' })
    fireEvent.click(textSwatch)
    expect(mockUpdateNodeColors).toHaveBeenCalledWith(TEST_NODE_ID, {
      fillColor: undefined,
      strokeColor: undefined,
      textColor: '#1e2022',
    })
  })

  it('clicking reset calls updateNodeColors with all undefined values', () => {
    render(<NodeColorPicker {...defaultProps} fillColor="#1e2022" strokeColor="#1e2022" textColor="#1e2022" />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset node colors to default' }))
    expect(mockUpdateNodeColors).toHaveBeenCalledWith(TEST_NODE_ID, {
      fillColor: undefined,
      strokeColor: undefined,
      textColor: undefined,
    })
  })

  it('selected fill swatch gets active class when fillColor matches', () => {
    render(<NodeColorPicker {...defaultProps} fillColor="#1e2022" />)
    const activeSwatch = screen.getByRole('button', { name: 'Fill color #1e2022' })
    expect(activeSwatch.className).toContain('node-color-picker__swatch--active')
  })

  it('selected stroke swatch gets active class when strokeColor matches', () => {
    render(<NodeColorPicker {...defaultProps} strokeColor="#1e2022" />)
    const activeSwatch = screen.getByRole('button', { name: 'Border color #1e2022' })
    expect(activeSwatch.className).toContain('node-color-picker__swatch--active')
  })

  it('selected text swatch gets active class when textColor matches', () => {
    render(<NodeColorPicker {...defaultProps} textColor="#1e2022" />)
    const activeSwatch = screen.getByRole('button', { name: 'Text color #1e2022' })
    expect(activeSwatch.className).toContain('node-color-picker__swatch--active')
  })

  it('does not own Escape handling outside the toolbar state owner', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const picker = document.querySelector('.node-color-picker')!
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    picker.dispatchEvent(event)
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('mousedown outside picker calls onClose', () => {
    render(<NodeColorPicker {...defaultProps} />)
    document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('mousedown inside picker does NOT call onClose', () => {
    render(<NodeColorPicker {...defaultProps} />)
    const picker = document.querySelector('.node-color-picker')!
    picker.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(mockOnClose).not.toHaveBeenCalled()
  })

  it('mousedown on triggerRef element does NOT call onClose', () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    const ref = { current: btn } as React.RefObject<HTMLButtonElement | null>
    render(<NodeColorPicker {...defaultProps} triggerRef={ref} />)
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(mockOnClose).not.toHaveBeenCalled()
    document.body.removeChild(btn)
  })
})
