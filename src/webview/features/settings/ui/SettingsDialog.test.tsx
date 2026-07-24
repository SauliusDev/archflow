import React, { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import SettingsDialog from './SettingsDialog'

describe('SettingsDialog', () => {
  function renderDialog() {
    const triggerRef = createRef<HTMLButtonElement>()
    const onClose = vi.fn()
    const onAutoSaveChange = vi.fn()
    const onSmartRoutingChange = vi.fn()
    const onNewEdgeRouteModeChange = vi.fn()
    const onLayoutStyleChange = vi.fn()
    const view = render(
      <>
        <button ref={triggerRef}>Settings</button>
        <SettingsDialog open autoSave={false} onAutoSaveChange={onAutoSaveChange} smartRouting onSmartRoutingChange={onSmartRoutingChange} snapToGrid={false} onSnapToGridChange={vi.fn()} newEdgeRouteMode="curved" onNewEdgeRouteModeChange={onNewEdgeRouteModeChange} layoutStyle="classic" onLayoutStyleChange={onLayoutStyleChange} nodeConnections={{ mode: 'free', autoReassign: false }} onNodeConnectionsChange={vi.fn()} onClose={onClose} returnFocusRef={triggerRef} />
      </>,
    )
    return { ...view, onClose, onAutoSaveChange, onSmartRoutingChange, onNewEdgeRouteModeChange, onLayoutStyleChange, triggerRef }
  }

  it('renders an accessible modal and focuses the initial preference control', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Settings' })).not.toBeNull()
    const autoSave = screen.getByRole('checkbox', { name: 'Auto save' }) as HTMLInputElement
    expect(autoSave.checked).toBe(false)
    expect(autoSave.getAttribute('aria-describedby')).toBe('settings-dialog-auto-save-description')
    expect(document.getElementById('settings-dialog-auto-save-description')?.textContent).toBe('Automatically save after editing stops.')
    expect(document.getElementById('settings-dialog-new-edge-route-description')?.textContent).toBe('Choose how new flowchart connections are drawn.')
    expect(screen.getByRole('checkbox', { name: 'Smart routing' })).toHaveProperty('checked', true)
    expect(document.activeElement).toBe(autoSave)
  })

  it('groups the compact top-level settings', () => {
    renderDialog()
    expect(screen.getByRole('group', { name: 'General settings' })).not.toBeNull()
  })

  it('marks Smart routing and its experimental route modes', () => {
    renderDialog()
    expect(screen.getAllByText('Experimental')).toHaveLength(3)
    expect(screen.getByRole('checkbox', { name: 'Smart routing' }).closest('label')?.textContent).toContain('Experimental')
    expect(screen.getByRole('radio', { name: 'Orthogonal new-edge route' }).closest('label')?.textContent).toContain('Experimental')
    expect(screen.getByRole('radio', { name: 'Curved new-edge route' }).closest('label')?.textContent).toContain('Experimental')
  })

  it('links to the FlowForge GitHub project from the About section', () => {
    renderDialog()

    const githubLink = screen.getByRole('link', { name: 'View FlowForge on GitHub' })
    expect(githubLink.getAttribute('href')).toBe('https://github.com/SauliusDev/flowforge')
    expect(githubLink.getAttribute('target')).toBe('_blank')
    expect(githubLink.getAttribute('rel')).toBe('noreferrer')
  })

  it('exposes a named route-default control with selected state and keyboard activation', () => {
    const { onNewEdgeRouteModeChange } = renderDialog()
    const straight = screen.getByRole('radio', { name: 'Straight new-edge route' })
    const curved = screen.getByRole('radio', { name: 'Curved new-edge route' })

    expect(curved).toHaveProperty('checked', true)
    fireEvent.keyDown(straight, { key: ' ' })
    fireEvent.click(straight)
    expect(onNewEdgeRouteModeChange).toHaveBeenCalledWith('straight')
  })

  it('keeps Tab and Shift+Tab focus inside the dialog controls', () => {
    renderDialog()
    const autoSave = screen.getByRole('checkbox', { name: 'Auto save' })
    const smartRouting = screen.getByRole('checkbox', { name: 'Smart routing' })
    const snapToGrid = screen.getByRole('checkbox', { name: 'Snap to grid' })
    const close = screen.getByRole('button', { name: 'Close settings' })

    const curved = screen.getByRole('radio', { name: 'Curved new-edge route' })
    fireEvent.keyDown(autoSave, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Tab' })
    expect(document.activeElement).toBe(autoSave)

    smartRouting.focus()
    fireEvent.keyDown(smartRouting, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(autoSave)

    curved.focus()
    fireEvent.keyDown(curved, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Layout style' }))

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Layout style' }), { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(snapToGrid)

    snapToGrid.focus()
    fireEvent.keyDown(snapToGrid, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(smartRouting)

    fireEvent.keyDown(smartRouting, { key: 'Tab' })
    expect(document.activeElement).toBe(snapToGrid)

    fireEvent.keyDown(snapToGrid, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('combobox', { name: 'Layout style' }))

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Layout style' }), { key: 'Tab' })
    expect(document.activeElement).toBe(curved)

    const githubLink = screen.getByRole('link', { name: 'View FlowForge on GitHub' })
    githubLink.focus()
    fireEvent.keyDown(githubLink, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
  })

  it.each([
    ['Escape', (backdrop: HTMLElement) => fireEvent.keyDown(backdrop, { key: 'Escape' })],
    ['Close', () => fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))],
    ['backdrop', (backdrop: HTMLElement) => fireEvent.click(backdrop)],
  ])('closes on %s and restores trigger focus', (_method, dismiss) => {
    const { container, onClose, triggerRef } = renderDialog()
    dismiss(container.querySelector('.settings-dialog-backdrop')!)
    expect(onClose).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(triggerRef.current)
  })

  it('reports only the Boolean Auto save preference change', () => {
    const { onAutoSaveChange } = renderDialog()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto save' }))
    expect(onAutoSaveChange).toHaveBeenCalledWith(true)
  })

  it('reports the Boolean Smart routing preference change', () => {
    const { onSmartRoutingChange } = renderDialog()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Smart routing' }))
    expect(onSmartRoutingChange).toHaveBeenCalledWith(false)
  })

  it('shows the placement setting and reports free-placement mode', () => {
    const onSnapToGridChange = vi.fn()
    const triggerRef = createRef<HTMLButtonElement>()
    render(<SettingsDialog open autoSave onAutoSaveChange={vi.fn()} smartRouting onSmartRoutingChange={vi.fn()} snapToGrid={false} onSnapToGridChange={onSnapToGridChange} newEdgeRouteMode="curved" onNewEdgeRouteModeChange={vi.fn()} layoutStyle="classic" onLayoutStyleChange={vi.fn()} nodeConnections={{ mode: 'free', autoReassign: false }} onNodeConnectionsChange={vi.fn()} onClose={vi.fn()} returnFocusRef={triggerRef} />)

    const snapToGrid = screen.getByRole('checkbox', { name: 'Snap to grid' }) as HTMLInputElement
    expect(snapToGrid.checked).toBe(false)
    fireEvent.click(snapToGrid)
    expect(onSnapToGridChange).toHaveBeenCalledWith(true)
  })

  it('shows the layout-style dropdown and reports Modern selection', () => {
    const { onLayoutStyleChange } = renderDialog()
    const layoutStyle = screen.getByRole('combobox', { name: 'Layout style' }) as HTMLSelectElement
    expect(layoutStyle.value).toBe('classic')
    fireEvent.change(layoutStyle, { target: { value: 'modern' } })
    expect(onLayoutStyleChange).toHaveBeenCalledWith('modern')
  })

  it('resets every setting to its default value', () => {
    const onAutoSaveChange = vi.fn()
    const onSmartRoutingChange = vi.fn()
    const onSnapToGridChange = vi.fn()
    const onNewEdgeRouteModeChange = vi.fn()
    const onLayoutStyleChange = vi.fn()
    const onNodeConnectionsChange = vi.fn()
    const triggerRef = createRef<HTMLButtonElement>()
    render(<SettingsDialog open autoSave={false} onAutoSaveChange={onAutoSaveChange} smartRouting onSmartRoutingChange={onSmartRoutingChange} snapToGrid onSnapToGridChange={onSnapToGridChange} newEdgeRouteMode="straight" onNewEdgeRouteModeChange={onNewEdgeRouteModeChange} layoutStyle="classic" onLayoutStyleChange={onLayoutStyleChange} nodeConnections={{ mode: 'free', autoReassign: false }} onNodeConnectionsChange={onNodeConnectionsChange} onClose={vi.fn()} returnFocusRef={triggerRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))

    expect(onAutoSaveChange).toHaveBeenCalledWith(true)
    expect(onSmartRoutingChange).toHaveBeenCalledWith(false)
    expect(onSnapToGridChange).toHaveBeenCalledWith(false)
    expect(onNewEdgeRouteModeChange).toHaveBeenCalledWith('curved')
    expect(onLayoutStyleChange).toHaveBeenCalledWith('modern')
    expect(onNodeConnectionsChange).toHaveBeenCalledWith({ mode: 'side', autoReassign: true })
  })

  it('persists side connection mode and its auto-reassign preference through named controls', () => {
    const onNodeConnectionsChange = vi.fn()
    const triggerRef = createRef<HTMLButtonElement>()
    render(React.createElement(SettingsDialog as unknown as React.ComponentType<Record<string, unknown>>, {
      open: true, autoSave: true, onAutoSaveChange: vi.fn(), smartRouting: true, onSmartRoutingChange: vi.fn(),
      snapToGrid: false, onSnapToGridChange: vi.fn(), newEdgeRouteMode: 'curved', onNewEdgeRouteModeChange: vi.fn(),
      layoutStyle: 'classic', onLayoutStyleChange: vi.fn(), onClose: vi.fn(), returnFocusRef: triggerRef,
      nodeConnections: { mode: 'free', autoReassign: false }, onNodeConnectionsChange,
    }))

    const side = screen.getByRole('radio', { name: 'Side node connections' })
    expect(side).toHaveProperty('checked', false)
    fireEvent.click(side)
    expect(onNodeConnectionsChange).toHaveBeenLastCalledWith({ mode: 'side', autoReassign: false })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Auto-reassign sides' }))
    expect(onNodeConnectionsChange).toHaveBeenCalledWith({ mode: 'side', autoReassign: false })
  })

  it('switches from Side to Free when the Free option is clicked', () => {
    const triggerRef = createRef<HTMLButtonElement>()
    function ControlledDialog(): React.JSX.Element {
      const [nodeConnections, setNodeConnections] = React.useState({ mode: 'side' as const, autoReassign: true })
      return <SettingsDialog open autoSave onAutoSaveChange={vi.fn()} smartRouting onSmartRoutingChange={vi.fn()} snapToGrid={false} onSnapToGridChange={vi.fn()} newEdgeRouteMode="curved" onNewEdgeRouteModeChange={vi.fn()} layoutStyle="classic" onLayoutStyleChange={vi.fn()} nodeConnections={nodeConnections} onNodeConnectionsChange={setNodeConnections} onClose={vi.fn()} returnFocusRef={triggerRef} />
    }

    render(<ControlledDialog />)

    const free = screen.getByRole('radio', { name: 'Free node connections' }) as HTMLInputElement
    expect(free.checked).toBe(false)
    fireEvent.click(screen.getByText('Free'))
    expect(free.checked).toBe(true)
    expect(screen.getByRole('radio', { name: 'Side node connections' })).toHaveProperty('checked', false)
  })

  it('disables auto-reassign in Free mode with an explanatory description', () => {
    const triggerRef = createRef<HTMLButtonElement>()
    render(React.createElement(SettingsDialog as unknown as React.ComponentType<Record<string, unknown>>, {
      open: true, autoSave: true, onAutoSaveChange: vi.fn(), smartRouting: true, onSmartRoutingChange: vi.fn(),
      snapToGrid: false, onSnapToGridChange: vi.fn(), newEdgeRouteMode: 'curved', onNewEdgeRouteModeChange: vi.fn(),
      layoutStyle: 'classic', onLayoutStyleChange: vi.fn(), onClose: vi.fn(), returnFocusRef: triggerRef,
      nodeConnections: { mode: 'free', autoReassign: false }, onNodeConnectionsChange: vi.fn(),
    }))

    const autoReassign = screen.getByRole('checkbox', { name: 'Auto-reassign sides' }) as HTMLInputElement
    expect(autoReassign.disabled).toBe(true)
    expect(document.getElementById('settings-dialog-auto-reassign-description')?.textContent).toMatch(/Side node connections/)
  })
})
