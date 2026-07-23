import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import PreviewBar from './PreviewBar'
import type { PreviewBarProps } from './PreviewBar'

function makeProps(overrides: Partial<PreviewBarProps> = {}): PreviewBarProps {
  return {
    direction: 'TD',
    theme: 'dark',
    curve: 'basis',
    look: 'classic',
    zoom: 1,
    onDirectionChange: vi.fn(),
    onThemeChange: vi.fn(),
    onCurveChange: vi.fn(),
    onLookChange: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onZoomReset: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  }
}

describe('PreviewBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders direction, theme, curve buttons and zoom controls', () => {
    render(<PreviewBar {...makeProps()} />)
    expect(screen.getByText('TD')).toBeDefined()
    expect(screen.getByText('dark')).toBeDefined()
    expect(screen.getByText('basis')).toBeDefined()
    expect(screen.getByText('Sketch')).toBeDefined()
    expect(screen.getByTitle('Zoom out')).toBeDefined()
    expect(screen.getByTitle('Zoom in')).toBeDefined()
    expect(screen.getByTitle('Reset zoom')).toBeDefined()
    expect(screen.getByText('100%')).toBeDefined()
  })

  it('clicking direction trigger opens direction dropdown', () => {
    render(<PreviewBar {...makeProps()} />)
    fireEvent.click(screen.getByText('TD'))
    expect(screen.getByText('BT')).toBeDefined()
    expect(screen.getByText('LR')).toBeDefined()
    expect(screen.getByText('RL')).toBeDefined()
  })

  it('clicking the same direction trigger again closes dropdown (toggle)', () => {
    render(<PreviewBar {...makeProps()} />)
    const trigger = screen.getByText('TD')
    fireEvent.click(trigger)
    expect(screen.getByText('BT')).toBeDefined()
    // After open, two TD elements exist (trigger + option); click the first (trigger)
    fireEvent.click(screen.getAllByText('TD')[0])
    expect(screen.queryByText('BT')).toBeNull()
  })

  it('selecting a direction option calls onDirectionChange and closes dropdown', () => {
    const props = makeProps()
    render(<PreviewBar {...props} />)
    fireEvent.click(screen.getByText('TD'))
    fireEvent.click(screen.getByText('LR'))
    expect(props.onDirectionChange).toHaveBeenCalledWith('LR')
    expect(screen.queryByText('BT')).toBeNull()
  })

  it('clicking theme trigger opens theme dropdown; direction dropdown closes', () => {
    render(<PreviewBar {...makeProps()} />)
    fireEvent.click(screen.getByText('TD'))
    expect(screen.getByText('BT')).toBeDefined()
    fireEvent.click(screen.getByText('dark'))
    expect(screen.queryByText('BT')).toBeNull()
    expect(screen.getByText('forest')).toBeDefined()
    expect(screen.getByText('neutral')).toBeDefined()
  })

  it('clicking outside the bar fires mousedown and closes dropdown', () => {
    render(<PreviewBar {...makeProps()} />)
    fireEvent.click(screen.getByText('TD'))
    expect(screen.getByText('BT')).toBeDefined()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('BT')).toBeNull()
  })

  it('pressing Escape closes open dropdown', () => {
    render(<PreviewBar {...makeProps()} />)
    fireEvent.click(screen.getByText('TD'))
    expect(screen.getByText('BT')).toBeDefined()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('BT')).toBeNull()
  })

  it('clicking Sketch toggles look between classic and handDrawn', () => {
    const props = makeProps({ look: 'classic' })
    render(<PreviewBar {...props} />)
    fireEvent.click(screen.getByText('Sketch'))
    expect(props.onLookChange).toHaveBeenCalledWith('handDrawn')

    const props2 = makeProps({ look: 'handDrawn' })
    render(<PreviewBar {...props2} />)
    fireEvent.click(screen.getAllByText('Sketch')[1])
    expect(props2.onLookChange).toHaveBeenCalledWith('classic')
  })

  it('clicking + / − calls onZoomIn / onZoomOut; clicking % calls onZoomReset', () => {
    const props = makeProps()
    render(<PreviewBar {...props} />)
    fireEvent.click(screen.getByTitle('Zoom in'))
    expect(props.onZoomIn).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTitle('Zoom out'))
    expect(props.onZoomOut).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByTitle('Reset zoom'))
    expect(props.onZoomReset).toHaveBeenCalledTimes(1)
  })

  it('clicking export button calls onExport', () => {
    const props = makeProps()
    render(<PreviewBar {...props} />)
    fireEvent.click(screen.getByTitle('Export SVG'))
    expect(props.onExport).toHaveBeenCalledTimes(1)
  })
})
