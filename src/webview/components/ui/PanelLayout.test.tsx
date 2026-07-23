import React from 'react'
import { render, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import PanelLayout from './PanelLayout'
import type { PanelVisible } from '@/features/settings'

const ALL_VISIBLE: PanelVisible = { canvas: true, code: true, preview: true }
const CANVAS_ONLY: PanelVisible = { canvas: true, code: false, preview: false }
const CANVAS_CODE: PanelVisible = { canvas: true, code: true, preview: false }
const CANVAS_HIDDEN: PanelVisible = { canvas: false, code: true, preview: false }

const mockCanvas = <div data-testid="canvas-mock" />
const mockCode = <div data-testid="code-mock" />
const mockPreview = <div data-testid="preview-mock" />

describe('PanelLayout', () => {
  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      width: 500,
      height: 600,
      left: 0,
      top: 0,
      right: 500,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('canvas panel is always present in DOM regardless of panelVisible.canvas', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_HIDDEN} canvas={mockCanvas} code={mockCode} />
    )
    const panels = container.querySelectorAll('.panel-layout__panel')
    expect(panels.length).toBeGreaterThanOrEqual(1)
    const canvasPanel = panels[0] as HTMLElement
    expect(canvasPanel).not.toBeNull()
  })

  it('canvas panel has display:none when panelVisible.canvas is false', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_HIDDEN} canvas={mockCanvas} code={mockCode} />
    )
    const panels = container.querySelectorAll('.panel-layout__panel')
    const canvasPanel = panels[0] as HTMLElement
    expect(canvasPanel.style.display).toBe('none')
  })

  it('canvas panel has no display:none when panelVisible.canvas is true', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_ONLY} canvas={mockCanvas} />
    )
    const panels = container.querySelectorAll('.panel-layout__panel')
    const canvasPanel = panels[0] as HTMLElement
    expect(canvasPanel.style.display).not.toBe('none')
  })

  it('shows no resize handles when only 1 panel is visible', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_ONLY} canvas={mockCanvas} />
    )
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles.length).toBe(0)
  })

  it('shows 1 resize handle when canvas and code are visible', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles.length).toBe(1)
  })

  it('shows 2 resize handles when all 3 panels are visible', () => {
    const { container } = render(
      <PanelLayout panelVisible={ALL_VISIBLE} canvas={mockCanvas} code={mockCode} preview={mockPreview} />
    )
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles.length).toBe(2)
  })

  it('resize handle has role="separator" and aria-orientation="vertical"', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    const handle = container.querySelector('.resize-handle')
    expect(handle).not.toBeNull()
    expect(handle!.getAttribute('role')).toBe('separator')
    expect(handle!.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('renders a compact three-dot grip for each resize handle', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    expect(container.querySelectorAll('.resize-handle__grip span')).toHaveLength(3)
  })

  it('code panel is not rendered when code prop is undefined (even if panelVisible.code is true)', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} />
    )
    const panels = container.querySelectorAll('.panel-layout__panel')
    expect(panels.length).toBe(1)
    const handles = container.querySelectorAll('.resize-handle')
    expect(handles.length).toBe(0)
  })

  it('code panel is rendered when visible and code prop is provided', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    const panels = container.querySelectorAll('.panel-layout__panel')
    expect(panels.length).toBe(2)
    const codeContent = container.querySelector('[data-testid="code-mock"]')
    expect(codeContent).not.toBeNull()
  })

  it('drag: mousedown + mousemove updates panel flexBasis on DOM elements', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    const handle = container.querySelector('.resize-handle')!
    expect(handle).not.toBeNull()

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(document, { clientX: 600 })

    const panels = container.querySelectorAll('.panel-layout__panel')
    const canvasPanel = panels[0] as HTMLElement
    expect(canvasPanel.style.flexBasis).toBe('600px')

    fireEvent.mouseUp(document)
  })

  it('drag: panel minimum width of 80px is respected (cannot drag below min)', () => {
    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    const handle = container.querySelector('.resize-handle')!

    // Start drag at x=500, move far left (would bring left panel below 80px)
    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(document, { clientX: 0 })

    const panels = container.querySelectorAll('.panel-layout__panel')
    const canvasPanel = panels[0] as HTMLElement
    // Min width is 80; left panel should be clamped at 80px
    expect(parseInt(canvasPanel.style.flexBasis, 10)).toBeGreaterThanOrEqual(80)

    fireEvent.mouseUp(document)
  })

  it('drag: mouseup syncs DOM widths to React state and removes document listeners', () => {
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')

    const { container } = render(
      <PanelLayout panelVisible={CANVAS_CODE} canvas={mockCanvas} code={mockCode} />
    )
    const handle = container.querySelector('.resize-handle')!

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(document, { clientX: 550 })

    act(() => {
      fireEvent.mouseUp(document)
    })

    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
  })
})
