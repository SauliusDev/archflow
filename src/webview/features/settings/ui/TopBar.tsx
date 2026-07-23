import React, { useState, useEffect, useRef } from 'react'
import { useStore } from '@/state/createStore'
import { sendToHost } from '@/vscode'
import { logoDataUri } from '@/assets/logo'
import { buildSaveMessage } from '@/lib/autoSave'
import { canonicalSourceForExport } from '@/lib/adapterPlatform'

export type PanelId = 'canvas' | 'code' | 'preview'
export type PanelVisible = Record<PanelId, boolean>

interface TopBarProps {
  panelVisible: PanelVisible
  onTogglePanel: (panel: PanelId) => void
  theme: 'dark' | 'light' | 'adaptive'
  onThemeChange: (theme: 'dark' | 'light' | 'adaptive') => void
  onOpenSettings: () => void
  settingsButtonRef?: React.RefObject<HTMLButtonElement | null>
}

const THEME_LABELS: Record<'dark' | 'light' | 'adaptive', string> = {
  dark: '☾ Dark',
  light: '☀ Light',
  adaptive: '◒ Adaptive',
}

const THEME_OPTIONS = ['dark', 'light', 'adaptive'] as const

export default function TopBar({ panelVisible, onTogglePanel, theme, onThemeChange, onOpenSettings, settingsButtonRef }: TopBarProps): React.JSX.Element {
  const [isThemeOpen, setIsThemeOpen] = useState(false)
  const [focusedThemeIndex, setFocusedThemeIndex] = useState(0)
  const themeButtonRef = useRef<HTMLButtonElement>(null)
  const themeDropdownRef = useRef<HTMLDivElement>(null)
  const themeOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const isDirty = useStore(state => state.documentSession?.dirty ?? false)
  const conflict = useStore(state => state.documentSession?.conflict ?? null)

  useEffect(() => {
    if (!isThemeOpen) return
    const handleMouseDown = (e: MouseEvent): void => {
      if (
        themeButtonRef.current?.contains(e.target as Node) ||
        themeDropdownRef.current?.contains(e.target as Node)
      ) return
      setIsThemeOpen(false)
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [isThemeOpen])

  useEffect(() => {
    if (!isThemeOpen) return
    themeOptionRefs.current[focusedThemeIndex]?.focus()
  }, [focusedThemeIndex, isThemeOpen])

  const handleThemeOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, currentTheme: typeof THEME_OPTIONS[number]): void => {
    const currentIndex = THEME_OPTIONS.indexOf(currentTheme)
    let nextIndex: number | null = null
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % THEME_OPTIONS.length
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + THEME_OPTIONS.length) % THEME_OPTIONS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = THEME_OPTIONS.length - 1
    if (nextIndex !== null) {
      event.preventDefault()
      setFocusedThemeIndex(nextIndex)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onThemeChange(currentTheme)
      setIsThemeOpen(false)
      themeButtonRef.current?.focus()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsThemeOpen(false)
      themeButtonRef.current?.focus()
      return
    }
  }

  const handleThemeButtonClick = (): void => {
    if (isThemeOpen) {
      setIsThemeOpen(false)
      return
    }
    setFocusedThemeIndex(THEME_OPTIONS.indexOf(theme))
    setIsThemeOpen(true)
  }

  const handleThemeButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'Escape' || !isThemeOpen) return
    event.preventDefault()
    setIsThemeOpen(false)
  }

  const handleThemePickerBlur = (event: React.FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) setIsThemeOpen(false)
  }

  const handleExportFile = () => {
    const { documentSession, codeSource } = useStore.getState()
    const content = canonicalSourceForExport(documentSession, codeSource)
    sendToHost({ type: 'EXPORT', payload: { content, format: 'mmd', subtype: 'file' } })
  }

  const handleSaveDiagram = () => {
    if (useStore.getState().documentSession?.conflict) return
    sendToHost(buildSaveMessage())
  }

  const handleCopyClipboard = () => {
    const { documentSession, codeSource } = useStore.getState()
    const content = canonicalSourceForExport(documentSession, codeSource)
    sendToHost({ type: 'EXPORT', payload: { content, format: 'mmd', subtype: 'clipboard' } })
  }

  return (
    <header className="topbar" role="banner">
      <div className="topbar__brand">
        <img className="topbar__logo" src={logoDataUri} alt="" aria-hidden="true" />
        <span className="topbar__name" data-testid="flowforge-wordmark">flowforge</span>
      </div>
      <nav className="topbar__tabs" aria-label="Panel tabs">
        {(['canvas', 'code', 'preview'] as const).map(panel => (
          <button
            key={panel}
            className={`topbar__tab${panelVisible[panel] ? ' topbar__tab--active' : ''}`}
            aria-pressed={panelVisible[panel]}
            onClick={() => onTogglePanel(panel)}
          >
            {panel.charAt(0).toUpperCase() + panel.slice(1)}
          </button>
        ))}
      </nav>
      <div className="topbar__actions">
        <div className="topbar__save-control">
          {conflict && (
            <div className="topbar__conflict-notifier" role="alert">
              <span className="topbar__conflict-message">File changed externally</span>
              <button type="button" className="topbar__conflict-action" onClick={() => useStore.getState().resolveDocumentConflict('adopt-external')}>Use external</button>
              <button type="button" className="topbar__conflict-action" onClick={() => useStore.getState().resolveDocumentConflict('keep-local')}>Keep local</button>
            </div>
          )}
          <button
            className="topbar__btn"
            aria-label="Save diagram"
            aria-describedby="save-dirty-status"
            title="Save diagram"
            onClick={handleSaveDiagram}
          >
            <svg className="topbar__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M5 3h12l3 3v15H5z" />
              <path d="M8 3v6h8V3M8 21v-7h8v7" />
            </svg>
          </button>
          {isDirty && <span className="topbar__dirty-indicator" aria-hidden="true" />}
          <span id="save-dirty-status" className="sr-only">{isDirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>
        <button
          className="topbar__btn"
          aria-label="Export as .mmd file"
          title="Export as .mmd file"
          onClick={handleExportFile}
        >⬇</button>
        <button
          className="topbar__btn"
          aria-label="Copy Mermaid syntax to clipboard"
          title="Copy Mermaid syntax to clipboard"
          onClick={handleCopyClipboard}
        >⎘</button>
        <div className="topbar__theme-picker" onBlur={handleThemePickerBlur}>
          <button
            ref={themeButtonRef}
            className={`topbar__btn${isThemeOpen ? ' topbar__btn--active' : ''}`}
            aria-label={`Theme: ${THEME_LABELS[theme].slice(2)}. Click to change`}
            aria-haspopup="listbox"
            aria-expanded={isThemeOpen}
            title="Theme picker"
            onClick={handleThemeButtonClick}
            onKeyDown={handleThemeButtonKeyDown}
          >{THEME_LABELS[theme].slice(0, 1)}</button>
          {isThemeOpen && (
            <div
              ref={themeDropdownRef}
              role="listbox"
              aria-label="Select theme"
              className="topbar__theme-dropdown"
            >
              {THEME_OPTIONS.map((t, index) => (
                <button
                  key={t}
                  ref={element => { themeOptionRefs.current[index] = element }}
                  role="option"
                  aria-selected={theme === t}
                  tabIndex={focusedThemeIndex === index ? 0 : -1}
                  className={`topbar__theme-option${theme === t ? ' topbar__theme-option--active' : ''}`}
                  onKeyDown={event => handleThemeOptionKeyDown(event, t)}
                  onClick={() => { onThemeChange(t); setIsThemeOpen(false) }}
                >
                  {THEME_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
        <button ref={settingsButtonRef} className="topbar__btn" aria-label="Settings" title="Settings" onClick={onOpenSettings}>⚙</button>
      </div>
    </header>
  )
}
