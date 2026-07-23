import React from 'react'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// vi.mock() MUST be at module top level — hoisted by Vitest before imports.
vi.mock('zustand')

const { mockSendToHost } = vi.hoisted(() => ({
  mockSendToHost: vi.fn(),
}))

vi.mock('@/vscode', () => ({
  sendToHost: mockSendToHost,
}))

import { useStore } from '@/state/createStore'
import TopBar from './TopBar'
import type { PanelVisible } from './TopBar'

const mockOnTogglePanel = vi.fn()
const mockOnThemeChange = vi.fn()
const mockOnOpenSettings = vi.fn()
const readStylesheet = (relativePath: string): string => fs.readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
const variablesSource = readStylesheet('../../../styles/variables.css')
const lightThemeSource = readStylesheet('../../../styles/themes/light.css')
const adaptiveThemeSource = readStylesheet('../../../styles/themes/adaptive.css')
const topbarStylesSource = readStylesheet('../../../styles/components/topbar.css')
const editorStylesheets = [
  '../../../styles/base.css',
  '../../../styles/components/class-diagram.css',
  '../../../styles/components/command-palette.css',
  '../../../styles/components/edge.css',
  '../../../styles/components/canvas-node-inspector.css',
  '../../../styles/components/minimap.css',
  '../../../styles/components/node-color-picker.css',
  '../../../styles/components/node-toolbar.css',
  '../../../styles/components/node.css',
  '../../../styles/components/palette.css',
  '../../../styles/components/panels.css',
  '../../../styles/components/settings-dialog.css',
  '../../../styles/components/sidebar.css',
  '../../../styles/components/subgraph.css',
  '../../../styles/components/topbar.css',
  '../../../styles/components/zoom-bar.css',
].map(readStylesheet)

const defaultProps = {
  panelVisible: { canvas: true, code: false, preview: false } as PanelVisible,
  onTogglePanel: mockOnTogglePanel,
  theme: 'dark' as const,
  onThemeChange: mockOnThemeChange,
  onOpenSettings: mockOnOpenSettings,
}

beforeEach(() => {
  act(() => { useStore.setState({ filename: 'test-diagram.mmd', codeSource: 'flowchart LR\n  A-->B', documentSession: null }) })
  mockOnTogglePanel.mockClear()
  mockOnThemeChange.mockClear()
  mockOnOpenSettings.mockClear()
  mockSendToHost.mockClear()
})

describe('TopBar', () => {
  it('keeps the theme-safe Flowforge brand token and script wordmark contract', () => {
    const wordmarkRule = topbarStylesSource.match(/\.topbar__name\s*\{([^}]*)\}/)?.[1]

    expect(variablesSource).toMatch(/--mv-brand-flowforge:\s*#3994bc;/)
    expect(lightThemeSource).toMatch(/--mv-brand-flowforge:\s*#004baf;/)
    expect(adaptiveThemeSource).toMatch(/--mv-brand-flowforge:\s*var\(--vscode-textLink-foreground, var\(--vscode-focusBorder, var\(--vscode-foreground, #004baf\)\)\);/)
    expect(wordmarkRule).toMatch(/font-family:\s*'Apple Chancery', 'Snell Roundhand', 'Segoe Script', 'URW Chancery L', cursive;/)
    expect(wordmarkRule).toMatch(/font-size:\s*18px;/)
    expect(wordmarkRule).toMatch(/font-weight:\s*500;/)
    expect(wordmarkRule).toMatch(/color:\s*var\(--mv-brand-flowforge\);/)
    expect(wordmarkRule).toMatch(/line-height:\s*1;/)
    expect(wordmarkRule).toMatch(/white-space:\s*nowrap;/)
  })

  it('maps the complete shared color vocabulary for adaptive VS Code themes', () => {
    const vscodeMappedTokens = [
      'bg-deep', 'canvas-bg', 'bg-surface', 'bg-elevated', 'bg-overlay', 'bg-hover', 'glass-bg', 'glass-bg-heavy', 'backdrop',
      'text-bright', 'text-primary', 'text-secondary', 'text-dim', 'accent', 'accent-dim', 'accent-mid', 'border', 'border-light', 'border-focus',
      'green', 'yellow', 'red', 'danger-bg', 'syntax-keyword', 'syntax-string', 'syntax-function', 'syntax-identifier', 'syntax-comment', 'syntax-tag', 'syntax-plain',
      'node-fill', 'node-stroke', 'node-text', 'node-selected', 'edge-stroke', 'edge-selected', 'subgraph-fill', 'subgraph-stroke', 'subgraph-header-bg', 'dot-color',
      'hover-bg', 'focus-ring', 'panel-bg', 'input-bg', 'text', 'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-bar',
    ]
    for (const token of vscodeMappedTokens) {
      expect(adaptiveThemeSource).toContain(`--mv-${token}:`)
    }
    for (const token of vscodeMappedTokens.filter(token => token !== 'backdrop')) {
      expect(adaptiveThemeSource).toMatch(new RegExp(`--mv-${token}:\\s*(?:var\\(--vscode-|[^;]*var\\(--vscode-)`))
    }
    expect(adaptiveThemeSource).toContain('--mv-edge-stroke:')
    expect(adaptiveThemeSource).toContain('--vscode-contrastBorder')
    expect(adaptiveThemeSource).toMatch(/--mv-backdrop:\s*rgba\(0, 0, 0, 0\.45\);/)
    expect(adaptiveThemeSource).toMatch(/--mv-backdrop:\s*color-mix/)
    expect(adaptiveThemeSource).toContain('@supports (background: color-mix')
  })

  it('keeps every loaded editor stylesheet free of raw colors and fallback literals', () => {
    const rawColor = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|(?<!mv-)\btransparent\b|var\(--mv-[^)]*,/
    for (const stylesheet of editorStylesheets) expect(stylesheet).not.toMatch(rawColor)
  })

  it('preserves the decorative logo and stable Flowforge wordmark hook', () => {
    const { container } = render(<TopBar {...defaultProps} />)
    const brand = container.querySelector('.topbar__brand')
    const wordmark = screen.getByTestId('flowforge-wordmark')
    const logo = brand?.querySelector('img.topbar__logo')

    expect(wordmark.textContent).toBe('flowforge')
    expect(wordmark.classList.contains('topbar__name')).toBe(true)
    expect(logo).toBeInstanceOf(HTMLImageElement)
    expect(logo?.getAttribute('alt')).toBe('')
    expect(logo?.getAttribute('aria-hidden')).toBe('true')
    expect(brand?.contains(wordmark)).toBe(true)
  })

  it('does not render the filename (shown natively in VS Code tab)', () => {
    const { container } = render(<TopBar {...defaultProps} />)
    expect(container.querySelector('.topbar__filename')).toBeNull()
  })

  it('renders Canvas, Code, and Preview tabs', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Canvas' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Code' })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Preview' })).not.toBeNull()
  })

  it('tabs are wrapped in a nav element', () => {
    const { container } = render(<TopBar {...defaultProps} />)
    const nav = container.querySelector('nav.topbar__tabs')
    expect(nav).not.toBeNull()
  })

  it('Canvas tab has active class when canvas is visible', () => {
    const { container } = render(<TopBar {...defaultProps} />)
    const buttons = container.querySelectorAll('.topbar__tab')
    const canvasBtn = Array.from(buttons).find(b => b.textContent === 'Canvas')
    expect(canvasBtn?.classList.contains('topbar__tab--active')).toBe(true)
  })

  it('Code tab does not have active class when code is not visible', () => {
    const { container } = render(<TopBar {...defaultProps} />)
    const buttons = container.querySelectorAll('.topbar__tab')
    const codeBtn = Array.from(buttons).find(b => b.textContent === 'Code')
    expect(codeBtn?.classList.contains('topbar__tab--active')).toBe(false)
  })

  it('clicking Canvas tab calls onTogglePanel with "canvas"', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }))
    expect(mockOnTogglePanel).toHaveBeenCalledWith('canvas')
  })

  it('clicking Code tab calls onTogglePanel with "code"', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Code' }))
    expect(mockOnTogglePanel).toHaveBeenCalledWith('code')
  })

  it('clicking Preview tab calls onTogglePanel with "preview"', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(mockOnTogglePanel).toHaveBeenCalledWith('preview')
  })

  it('active tab has aria-pressed true', () => {
    render(<TopBar {...defaultProps} />)
    const canvasBtn = screen.getByRole('button', { name: 'Canvas' })
    expect(canvasBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('inactive tab has aria-pressed false', () => {
    render(<TopBar {...defaultProps} />)
    const codeBtn = screen.getByRole('button', { name: 'Code' })
    expect(codeBtn.getAttribute('aria-pressed')).toBe('false')
  })

  it('renders theme picker button and settings button', () => {
    render(<TopBar {...defaultProps} theme="dark" onThemeChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /Theme: Dark/ })).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Settings' })).not.toBeNull()
  })

  it('theme picker and settings buttons are enabled', () => {
    render(<TopBar {...defaultProps} theme="dark" onThemeChange={vi.fn()} />)
    const themeBtn = screen.getByRole('button', { name: /Theme: Dark/ }) as HTMLButtonElement
    const settingsBtn = screen.getByRole('button', { name: 'Settings' }) as HTMLButtonElement
    expect(themeBtn.disabled).toBe(false)
    expect(settingsBtn.disabled).toBe(false)
  })

  it('opens Settings through its supplied callback', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(mockOnOpenSettings).toHaveBeenCalledOnce()
  })

  it('renders Export .mmd button', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Export as .mmd file' })).not.toBeNull()
  })

  it('uses a vector save icon', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Save diagram' }).querySelector('svg.topbar__icon')).not.toBeNull()
  })

  it('renders Copy syntax button', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Copy Mermaid syntax to clipboard' })).not.toBeNull()
  })

  it('Export .mmd button is not disabled', () => {
    render(<TopBar {...defaultProps} />)
    const btn = screen.getByRole('button', { name: 'Export as .mmd file' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('Copy syntax button is not disabled', () => {
    render(<TopBar {...defaultProps} />)
    const btn = screen.getByRole('button', { name: 'Copy Mermaid syntax to clipboard' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('clicking Export .mmd calls sendToHost with file subtype', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export as .mmd file' }))
    expect(mockSendToHost).toHaveBeenCalledWith({
      type: 'EXPORT',
      payload: { content: 'flowchart LR\n  A-->B', format: 'mmd', subtype: 'file' },
    })
  })

  it('clicking Copy syntax calls sendToHost with clipboard subtype', () => {
    render(<TopBar {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy Mermaid syntax to clipboard' }))
    expect(mockSendToHost).toHaveBeenCalledWith({
      type: 'EXPORT',
      payload: { content: 'flowchart LR\n  A-->B', format: 'mmd', subtype: 'clipboard' },
    })
  })

  it('sends layout-free canonical Mermaid to both export delivery surfaces', () => {
    const semanticSource = 'flowchart TD\n  A[Start]\n  B[End]\n  A --> B\n'
    useStore.setState({
      codeSource: `${semanticSource}\n%% FLOWFORGE LAYOUT START\n%% {}\n%% FLOWFORGE LAYOUT END\n`,
      documentSession: { source: semanticSource } as never,
    })
    render(<TopBar {...defaultProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'Export as .mmd file' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Mermaid syntax to clipboard' }))

    expect(mockSendToHost).toHaveBeenNthCalledWith(1, {
      type: 'EXPORT', payload: { content: semanticSource, format: 'mmd', subtype: 'file' },
    })
    expect(mockSendToHost).toHaveBeenNthCalledWith(2, {
      type: 'EXPORT', payload: { content: semanticSource, format: 'mmd', subtype: 'clipboard' },
    })
  })

  it('uses the canonical save transaction and exposes the clean save state', () => {
    render(<TopBar {...defaultProps} />)
    const save = screen.getByRole('button', { name: 'Save diagram' })
    fireEvent.click(save)
    expect(mockSendToHost).toHaveBeenCalledWith(expect.objectContaining({ type: 'SAVE' }))
    expect(save.getAttribute('aria-describedby')).toBe('save-dirty-status')
    expect(screen.getByText('All changes saved').getAttribute('id')).toBe('save-dirty-status')
    expect(screen.queryByText('Unsaved changes')).toBeNull()
  })

  it('shows an accessible dirty indicator only for a dirty document session', () => {
    act(() => { useStore.setState({ documentSession: { dirty: true } as never }) })
    const { container } = render(<TopBar {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Save diagram' })).not.toBeNull()
    expect(container.querySelector('.topbar__dirty-indicator')).not.toBeNull()
    expect(screen.getByText('Unsaved changes').getAttribute('id')).toBe('save-dirty-status')
  })

  it('anchors the external-change notifier to the left of the save icon', () => {
    const resolveDocumentConflict = vi.fn()
    act(() => { useStore.setState({ documentSession: { conflict: { eventId: 'external' } }, resolveDocumentConflict } as never) })
    const { container } = render(<TopBar {...defaultProps} />)

    const notifier = container.querySelector('.topbar__conflict-notifier')
    const saveControl = container.querySelector('.topbar__save-control')
    expect(notifier).not.toBeNull()
    expect(saveControl?.contains(notifier)).toBe(true)
    expect(screen.getByText('File changed externally')).not.toBeNull()
    expect(topbarStylesSource).toMatch(/\.topbar__conflict-notifier\s*\{[^}]*right:\s*calc\(100% \+ 8px\)/s)

    fireEvent.click(screen.getByRole('button', { name: 'Use external' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep local' }))
    expect(resolveDocumentConflict).toHaveBeenNthCalledWith(1, 'adopt-external')
    expect(resolveDocumentConflict).toHaveBeenNthCalledWith(2, 'keep-local')
  })

  it('does not expose JSON save or load controls', () => {
    render(<TopBar {...defaultProps} />)
    expect(screen.queryByRole('button', { name: /JSON/i })).toBeNull()
  })

  describe('theme picker', () => {
    it('renders with aria-label reflecting dark theme', () => {
      render(<TopBar {...defaultProps} theme="dark" onThemeChange={vi.fn()} />)
      const btn = screen.getByRole('button', { name: /Theme: Dark/ })
      expect(btn).not.toBeNull()
    })

    it('renders with aria-label reflecting adaptive theme', () => {
      render(<TopBar {...defaultProps} theme="adaptive" onThemeChange={vi.fn()} />)
      const btn = screen.getByRole('button', { name: /Theme: Adaptive/ })
      expect(btn).not.toBeNull()
    })

    it('clicking the theme button opens the dropdown (listbox visible)', () => {
      render(<TopBar {...defaultProps} />)
      const btn = screen.getByRole('button', { name: /Theme: Dark/ })
      fireEvent.click(btn)
      expect(screen.getByRole('listbox', { name: 'Select theme' })).not.toBeNull()
    })

    it('dropdown shows Dark, Light and Adaptive options', () => {
      render(<TopBar {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
      expect(screen.getByText('☾ Dark')).not.toBeNull()
      expect(screen.getByText('☀ Light')).not.toBeNull()
      expect(screen.getByText('◒ Adaptive')).not.toBeNull()
    })

    it('clicking Light option calls onThemeChange with "light" and closes dropdown', () => {
      const mockChange = vi.fn()
      render(<TopBar {...defaultProps} onThemeChange={mockChange} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
      fireEvent.click(screen.getByText('☀ Light'))
      expect(mockChange).toHaveBeenCalledWith('light')
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('clicking Adaptive option calls onThemeChange with "adaptive" and closes dropdown', () => {
      const mockChange = vi.fn()
      render(<TopBar {...defaultProps} onThemeChange={mockChange} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
      fireEvent.click(screen.getByText('◒ Adaptive'))
      expect(mockChange).toHaveBeenCalledWith('adaptive')
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('clicking Dark option calls onThemeChange with "dark" and closes dropdown', () => {
      const mockChange = vi.fn()
      render(<TopBar {...defaultProps} theme="adaptive" onThemeChange={mockChange} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Adaptive/ }))
      fireEvent.click(screen.getByText('☾ Dark'))
      expect(mockChange).toHaveBeenCalledWith('dark')
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('mousedown outside the dropdown closes it', () => {
      render(<TopBar {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
      expect(screen.getByRole('listbox')).not.toBeNull()
      act(() => {
        fireEvent.mouseDown(document.body)
      })
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('active option has aria-selected="true"', () => {
      render(<TopBar {...defaultProps} theme="dark" onThemeChange={vi.fn()} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
      const options = screen.getAllByRole('option')
      const darkOption = options.find(o => o.textContent === '☾ Dark')
      const adaptiveOption = options.find(o => o.textContent === '◒ Adaptive')
      expect(darkOption?.getAttribute('aria-selected')).toBe('true')
      expect(adaptiveOption?.getAttribute('aria-selected')).toBe('false')
    })

    it('updates roving tabindex through arrow, end, and wrap navigation', () => {
      const mockChange = vi.fn()
      render(<TopBar {...defaultProps} onThemeChange={mockChange} />)
      const trigger = screen.getByRole('button', { name: /Theme: Dark/ })
      fireEvent.click(trigger)

      const options = screen.getAllByRole('option') as HTMLButtonElement[]
      expect(document.activeElement).toBe(options[0])
      expect(options.map(option => option.tabIndex)).toEqual([0, -1, -1])

      fireEvent.keyDown(options[0], { key: 'ArrowDown' })
      expect(document.activeElement).toBe(options[1])
      expect(options.map(option => option.tabIndex)).toEqual([-1, 0, -1])
      fireEvent.keyDown(options[1], { key: 'End' })
      expect(document.activeElement).toBe(options[2])
      expect(options.map(option => option.tabIndex)).toEqual([-1, -1, 0])
      fireEvent.keyDown(options[2], { key: 'ArrowDown' })
      expect(document.activeElement).toBe(options[0])
      expect(options.map(option => option.tabIndex)).toEqual([0, -1, -1])
      fireEvent.keyDown(options[0], { key: 'ArrowUp' })
      expect(document.activeElement).toBe(options[2])
      expect(options.map(option => option.tabIndex)).toEqual([-1, -1, 0])
      fireEvent.keyDown(options[0], { key: 'Home' })
      expect(document.activeElement).toBe(options[0])

      fireEvent.keyDown(options[0], { key: 'End' })
      expect(document.activeElement).toBe(options[2])
      fireEvent.keyDown(options[2], { key: 'Enter' })
      expect(mockChange).toHaveBeenCalledWith('adaptive')
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })

    it.each([
      ['light', 1],
      ['adaptive', 2],
    ] as const)('opens %s with its selected option as the sole tab stop', (theme, expectedIndex) => {
      render(<TopBar {...defaultProps} theme={theme} />)
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`Theme: ${theme}`, 'i') }))
      const options = screen.getAllByRole('option') as HTMLButtonElement[]
      expect(document.activeElement).toBe(options[expectedIndex])
      expect(options.map(option => option.tabIndex)).toEqual(options.map((_, index) => index === expectedIndex ? 0 : -1))
    })

    it('selects with Space and restores focus to the picker trigger', () => {
      const mockChange = vi.fn()
      render(<TopBar {...defaultProps} onThemeChange={mockChange} />)
      const trigger = screen.getByRole('button', { name: /Theme: Dark/ })
      fireEvent.click(trigger)
      fireEvent.keyDown(screen.getAllByRole('option')[0], { key: ' ' })
      expect(mockChange).toHaveBeenCalledWith('dark')
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })

    it('allows native Tab to progress to Settings before closing the menu', async () => {
      const user = userEvent.setup()
      render(<TopBar {...defaultProps} />)
      fireEvent.click(screen.getByRole('button', { name: /Theme: Dark/ }))
      expect(document.activeElement).toBe(screen.getAllByRole('option')[0])

      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Settings' }))
      expect(screen.queryByRole('listbox')).toBeNull()
    })

    it('closes on Escape and restores focus to the picker trigger', () => {
      render(<TopBar {...defaultProps} />)
      const trigger = screen.getByRole('button', { name: /Theme: Dark/ })
      fireEvent.click(trigger)
      fireEvent.keyDown(screen.getAllByRole('option')[0], { key: 'Escape' })
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })

    it('closes on Escape from the picker trigger after focus returns to it', () => {
      render(<TopBar {...defaultProps} />)
      const trigger = screen.getByRole('button', { name: /Theme: Dark/ })
      fireEvent.click(trigger)
      trigger.focus()
      fireEvent.keyDown(trigger, { key: 'Escape' })
      expect(screen.queryByRole('listbox')).toBeNull()
      expect(document.activeElement).toBe(trigger)
    })

    it('dropdown is absent from DOM when closed', () => {
      render(<TopBar {...defaultProps} />)
      expect(screen.queryByRole('listbox')).toBeNull()
    })
  })
})
