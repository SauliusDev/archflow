import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'

vi.mock('zustand')

const mockZoomIn = vi.fn()
const mockZoomOut = vi.fn()
const mockFitView = vi.fn()

vi.mock('@xyflow/react', () => ({
  Position: { Top: 'top', Right: 'right', Bottom: 'bottom', Left: 'left' },
  useReactFlow: vi.fn(() => ({
    zoomIn: mockZoomIn,
    zoomOut: mockZoomOut,
    fitView: mockFitView,
  })),
}))

import ZoomBar from './ZoomBar'
import { useStore } from '@/state/createStore'
import { mockReactFlow } from '../../../setupTests'
import { makeNode } from '@/test/store-helpers'

mockReactFlow()

describe('ZoomBar', () => {
  beforeEach(() => {
    useStore.setState({
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      minimapOpen: false,
      isLocked: false,
    })
    mockZoomIn.mockClear()
    mockZoomOut.mockClear()
    mockFitView.mockClear()
  })

  it('renders 100% when zoom is 1', () => {
    useStore.setState({ viewport: { x: 0, y: 0, zoom: 1 } })
    render(<ZoomBar />)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  it('renders 75% when zoom is 0.75', () => {
    useStore.setState({ viewport: { x: 0, y: 0, zoom: 0.75 } })
    render(<ZoomBar />)
    expect(screen.getByText('75%')).toBeTruthy()
  })

  it('renders 150% when zoom is 1.5', () => {
    useStore.setState({ viewport: { x: 0, y: 0, zoom: 1.5 } })
    render(<ZoomBar />)
    expect(screen.getByText('150%')).toBeTruthy()
  })

  it('clicking zoom in calls zoomIn with duration 200', () => {
    render(<ZoomBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 })
  })

  it('clicking zoom out calls zoomOut with duration 200', () => {
    render(<ZoomBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(mockZoomOut).toHaveBeenCalledWith({ duration: 200 })
  })

  it('clicking fit to view uses the imp-agent paper-grid framing', () => {
    render(<ZoomBar layoutStyle="modern" />)
    fireEvent.click(screen.getByRole('button', { name: 'Fit all nodes in viewport' }))
    expect(mockFitView).toHaveBeenCalledWith({ padding: 0.2, duration: 360, maxZoom: 1 })
  })

  it('focuses only selected nodes with the paper-grid framing', () => {
    const nodes = [
      makeNode('selected-first', { selected: true }),
      makeNode('unselected'),
      makeNode('selected-second', { selected: true }),
    ]
    useStore.setState({ nodes })
    render(<ZoomBar layoutStyle="modern" />)

    const focusSelection = screen.getByRole('button', { name: 'Focus selection' }) as HTMLButtonElement
    focusSelection.focus()
    expect(document.activeElement).toBe(focusSelection)
    expect(focusSelection.parentElement?.getAttribute('data-tooltip')).toBe('Focus selected nodes')
    fireEvent.click(focusSelection)

    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'selected-first' }, { id: 'selected-second' }],
      padding: 0.2,
      duration: 360,
      maxZoom: 1,
    })
    expect(useStore.getState().nodes).toBe(nodes)
  })

  it('disables Focus selection with an explanatory hover tooltip when no nodes are selected', () => {
    useStore.setState({ nodes: [] })
    render(<ZoomBar />)
    const focusSelection = screen.getByRole('button', { name: 'Focus selection' }) as HTMLButtonElement

    expect(focusSelection.disabled).toBe(true)
    expect(focusSelection.parentElement?.getAttribute('data-tooltip')).toBe('Select nodes to focus')
    fireEvent.click(focusSelection)
    expect(mockFitView).not.toHaveBeenCalled()
  })

  it('enables Focus selection after the store receives a selection change', () => {
    const selectedNode = makeNode('selected-after-mount')
    useStore.setState({ nodes: [selectedNode] })
    render(<ZoomBar layoutStyle="modern" />)
    const focusSelection = screen.getByRole('button', { name: 'Focus selection' }) as HTMLButtonElement

    expect(focusSelection.disabled).toBe(true)
    act(() => useStore.setState({ nodes: [{ ...selectedNode, selected: true }] }))

    expect(focusSelection.disabled).toBe(false)
    fireEvent.click(focusSelection)
    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'selected-after-mount' }],
      padding: 0.2,
      duration: 360,
      maxZoom: 1,
    })
  })

  it('keeps Focus selection available and functional when the canvas is locked', () => {
    useStore.setState({ nodes: [makeNode('selected', { selected: true })], isLocked: true })
    render(<ZoomBar layoutStyle="modern" />)
    const focusSelection = screen.getByRole('button', { name: 'Focus selection' }) as HTMLButtonElement

    expect(focusSelection.disabled).toBe(false)
    fireEvent.click(focusSelection)
    expect(mockFitView).toHaveBeenCalledWith({
      nodes: [{ id: 'selected' }],
      padding: 0.2,
      duration: 360,
      maxZoom: 1,
    })
  })

  it('clicking minimap toggle changes minimapOpen', () => {
    useStore.setState({ minimapOpen: false })
    render(<ZoomBar />)
    fireEvent.click(screen.getByRole('switch', { name: /minimap/i }))
    expect(useStore.getState().minimapOpen).toBe(true)
  })

  it('clicking lock toggle changes isLocked', () => {
    useStore.setState({ isLocked: false })
    render(<ZoomBar />)
    fireEvent.click(screen.getByRole('switch', { name: /lock/i }))
    expect(useStore.getState().isLocked).toBe(true)
  })

  it('keeps zoom controls enabled when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<ZoomBar />)
    const btn = screen.getByRole('button', { name: 'Zoom in' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('keeps zoom-out controls enabled when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<ZoomBar />)
    const btn = screen.getByRole('button', { name: 'Zoom out' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('clicking zoom in still calls zoomIn when locked', () => {
    useStore.setState({ isLocked: true })
    render(<ZoomBar />)
    const btn = screen.getByRole('button', { name: 'Zoom in' })
    fireEvent.click(btn)
    expect(mockZoomIn).toHaveBeenCalledWith({ duration: 200 })
  })

  it('minimap toggle has role=switch and aria-checked=false by default', () => {
    render(<ZoomBar />)
    const btn = screen.getByRole('switch', { name: /minimap/i })
    expect(btn.getAttribute('aria-checked')).toBe('false')
  })

  it('minimap toggle aria-checked=true when minimapOpen=true', () => {
    useStore.setState({ minimapOpen: true })
    render(<ZoomBar />)
    const btn = screen.getByRole('switch', { name: /minimap/i })
    expect(btn.getAttribute('aria-checked')).toBe('true')
  })

  it('lock toggle has role=switch and aria-checked=false by default', () => {
    render(<ZoomBar />)
    const btn = screen.getByRole('switch', { name: /lock/i })
    expect(btn.getAttribute('aria-checked')).toBe('false')
  })

  it('lock toggle aria-checked=true when isLocked=true', () => {
    useStore.setState({ isLocked: true })
    render(<ZoomBar />)
    const btn = screen.getByRole('switch', { name: /lock/i })
    expect(btn.getAttribute('aria-checked')).toBe('true')
  })

  it('uses a vector lock icon without rendering a canvas lock state label', () => {
    useStore.setState({ isLocked: true })
    const { container } = render(<ZoomBar />)
    const lock = screen.getByRole('switch', { name: 'Unlock canvas' })

    expect(lock.querySelector('svg.zoom-bar__icon')).not.toBeNull()
    expect(container.querySelector('.zoom-bar__lock-state')).toBeNull()
  })

  it('uses an open-shackle vector for the unlocked state without a diagonal stripe', () => {
    render(<ZoomBar />)
    const lock = screen.getByRole('switch', { name: 'Lock canvas' })

    expect(lock.querySelector('svg.zoom-bar__icon path[d="M14 10 19 5"]')).toBeNull()
  })

  it('retains keyboard focus and updates checked state when toggled', () => {
    render(<ZoomBar />)
    const lock = screen.getByRole('switch', { name: 'Lock canvas' })
    lock.focus()
    fireEvent.click(lock)
    expect(document.activeElement).toBe(lock)
    expect(lock.getAttribute('aria-checked')).toBe('true')
  })

  it('zoom-bar has role=toolbar', () => {
    render(<ZoomBar />)
    expect(screen.getByRole('toolbar')).toBeTruthy()
  })

  it.each([
    'Zoom out',
    'Zoom in',
    'Fit all nodes in viewport',
    'Show minimap',
    'Lock canvas',
  ])('gives the %s icon control an informative hover tooltip', (name) => {
    render(<ZoomBar />)
    const control = screen.getByRole(name.includes('minimap') || name.includes('canvas') ? 'switch' : 'button', { name })
    expect(control.parentElement?.getAttribute('data-tooltip')).toBeTruthy()
  })

  it('updates stateful switch hover tooltips with their current action', () => {
    useStore.setState({ minimapOpen: true, isLocked: true })
    render(<ZoomBar />)
    expect(screen.getByRole('switch', { name: 'Hide minimap' }).parentElement?.getAttribute('data-tooltip')).toBe('Hide overview map')
    expect(screen.getByRole('switch', { name: 'Unlock canvas' }).parentElement?.getAttribute('data-tooltip')).toBe('Unlock canvas editing')
  })
})
