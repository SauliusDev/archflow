import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useStore } from '@/state/createStore'
import { useShallow } from 'zustand/react/shallow'
import type { NodeShape } from '@/features/flowchart'
import { canonicalSourceForExport } from '@/lib/adapterPlatform'
import { sendToHost } from '@/vscode'
import type { PanelId } from './TopBar'

function fuzzyMatch(query: string, label: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  const t = label.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

interface PaletteAction {
  id: string
  label: string
  category: string
  disabled?: boolean
  discoverWhenDisabled?: boolean
  execute: () => void
}

interface CommandPaletteProps {
  onTogglePanel: (id: PanelId) => void
  onThemeChange: (theme: 'dark' | 'light' | 'adaptive') => void
}

export default function CommandPalette({ onTogglePanel, onThemeChange }: CommandPaletteProps): React.JSX.Element | null {
  const { commandPaletteOpen, closeCommandPalette, openCommandPalette, isLocked } = useStore(
    useShallow(s => ({
      commandPaletteOpen: s.commandPaletteOpen,
      closeCommandPalette: s.closeCommandPalette,
      openCommandPalette: s.openCommandPalette,
      isLocked: s.isLocked,
    }))
  )
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!commandPaletteOpen) return
    setQuery('')
    setSelectedIdx(0)
    const id = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [commandPaletteOpen])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        if (commandPaletteOpen) {
          closeCommandPalette()
        } else {
          openCommandPalette()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [commandPaletteOpen, closeCommandPalette, openCommandPalette])

  const actions: PaletteAction[] = useMemo(() => {
    const close = () => useStore.getState().closeCommandPalette()

    const shapes: Array<[NodeShape, string]> = [
      ['rectangle', 'Add Rectangle Node'],
      ['rounded', 'Add Rounded Node'],
      ['pill', 'Add Pill Node'],
      ['diamond', 'Add Diamond Node'],
      ['circle', 'Add Circle Node'],
      ['hexagon', 'Add Hexagon Node'],
      ['cylinder', 'Add Cylinder Node'],
      ['subgraph', 'Add Subgraph Container'],
    ]
    const shapeActions: PaletteAction[] = shapes.map(([shape, label]) => ({
      id: `add-${shape}`,
      label,
      category: 'Shapes',
      execute: () => {
        close()
        useStore.getState().requestAddNode(shape)
      },
    }))
    const generalizedShapeActions: PaletteAction[] = [
      ['bang', 'Bang', 'rectangle'], ['notch-rect', 'Notched rectangle', 'rectangle'],
      ['hourglass', 'Hourglass', 'rectangle'], ['bolt', 'Bolt', 'rectangle'],
      ['brace', 'Brace', 'rectangle'], ['brace-r', 'Right brace', 'rectangle'],
      ['braces', 'Braces', 'rectangle'], ['lean-r', 'Lean right', 'rectangle'],
      ['lean-l', 'Lean left', 'rectangle'], ['h-cyl', 'Horizontal cylinder', 'cylinder'],
      ['lin-cyl', 'Lined cylinder', 'cylinder'], ['curv-trap', 'Curved trapezoid', 'rectangle'],
      ['div-rect', 'Divided rectangle', 'rectangle'], ['doc', 'Document', 'rectangle'],
      ['tri', 'Triangle', 'rectangle'], ['fork', 'Fork', 'rectangle'],
      ['win-pane', 'Window pane', 'rectangle'], ['f-circ', 'Filled circle', 'circle'],
      ['lin-rect', 'Lined rectangle', 'rectangle'], ['sm-circ', 'Small circle', 'circle'],
      ['fr-circ', 'Framed circle', 'circle'], ['cross-circ', 'Cross circle', 'circle'],
      ['tag-doc', 'Tagged document', 'rectangle'], ['tag-rect', 'Tagged rectangle', 'rectangle'],
      ['trap-t', 'Trapezoid', 'rectangle'], ['trap-b', 'Inverted trapezoid', 'rectangle'],
    ].map(([mermaidShape, label, shape]) => ({
      id: `add-generalized-${mermaidShape}`,
      label: `Add ${label} Node`,
      category: 'Generalized shapes',
      execute: () => { close(); useStore.getState().requestAddNode(shape as NodeShape, mermaidShape) },
    }))

    return [
      ...shapeActions,
      ...generalizedShapeActions,
      {
        id: 'add-lane', label: 'Add Swimlane', category: 'Flowchart',
        execute: () => { close(); useStore.getState().addLane() },
      },
      {
        id: 'connect-from-selection', label: 'Connect from Selected Node', category: 'Flowchart',
        execute: () => {
          const state = useStore.getState()
          const selected = state.nodes.find(node => node.selected && !node.data.isSubgraph)
          close()
          if (selected) state.setPendingConnect(selected.id)
          else state.announce('Select a node first')
        },
      },
      ...(['straight', 'orthogonal', 'curved'] as const).map(routeMode => ({
        id: `route-${routeMode}`,
        label: `Route Selected Edge: ${routeMode[0].toUpperCase()}${routeMode.slice(1)}`,
        category: 'Flowchart',
        disabled: isLocked,
        discoverWhenDisabled: true,
        execute: () => {
          const state = useStore.getState()
          if (state.isLocked) return
          const selected = state.edges.find(edge => edge.selected)
          close()
          if (selected) state.setEdgeRouteMode(selected.id, routeMode)
          else state.announce('Select an edge first')
        },
      })),
      {
        id: 'undo', label: 'Undo', category: 'Edit',
        execute: () => { close(); useStore.getState().undo() },
      },
      {
        id: 'redo', label: 'Redo', category: 'Edit',
        execute: () => { close(); useStore.getState().redo() },
      },
      {
        id: 'auto-layout', label: 'Apply Auto-Layout', category: 'Layout',
        execute: () => {
          close()
          const { nodes, applyAutoLayout, requestFitView } = useStore.getState()
          if (nodes.length === 0) return
          applyAutoLayout()
          requestFitView()
        },
      },
      {
        id: 'export-mmd', label: 'Export as .mmd File', category: 'Export',
        execute: () => {
          close()
          const { documentSession, codeSource } = useStore.getState()
          const content = canonicalSourceForExport(documentSession, codeSource)
          sendToHost({ type: 'EXPORT', payload: { content, format: 'mmd', subtype: 'file' } })
        },
      },
      {
        id: 'copy-syntax', label: 'Copy Mermaid Syntax', category: 'Export',
        execute: () => {
          close()
          const { documentSession, codeSource } = useStore.getState()
          const content = canonicalSourceForExport(documentSession, codeSource)
          sendToHost({ type: 'EXPORT', payload: { content, format: 'mmd', subtype: 'clipboard' } })
        },
      },
      {
        id: 'toggle-canvas', label: 'Toggle Canvas Panel', category: 'View',
        execute: () => { close(); onTogglePanel('canvas') },
      },
      {
        id: 'toggle-code', label: 'Toggle Code Panel', category: 'View',
        execute: () => { close(); onTogglePanel('code') },
      },
      {
        id: 'toggle-preview', label: 'Toggle Preview Panel', category: 'View',
        execute: () => { close(); onTogglePanel('preview') },
      },

      {
        id: 'zoom-fit', label: 'Fit View', category: 'Zoom',
        execute: () => { close(); useStore.getState().dispatchZoomAction('fit') },
      },
      {
        id: 'zoom-100', label: 'Zoom to 100%', category: 'Zoom',
        execute: () => { close(); useStore.getState().dispatchZoomAction('reset') },
      },
      {
        id: 'zoom-in', label: 'Zoom In', category: 'Zoom',
        execute: () => { close(); useStore.getState().dispatchZoomAction('in') },
      },
      {
        id: 'zoom-out', label: 'Zoom Out', category: 'Zoom',
        execute: () => { close(); useStore.getState().dispatchZoomAction('out') },
      },
      {
        id: 'toggle-lock', label: 'Toggle Canvas Lock', category: 'View',
        execute: () => { close(); useStore.getState().toggleLock() },
      },
      {
        id: 'toggle-minimap', label: 'Toggle Minimap', category: 'View',
        execute: () => { close(); useStore.getState().toggleMinimap() },
      },
      {
        id: 'theme-dark',
        label: 'Switch to Dark Theme',
        category: 'View',
        execute: () => { close(); onThemeChange('dark') },
      },
      {
        id: 'theme-light',
        label: 'Switch to Light Theme',
        category: 'View',
        execute: () => { close(); onThemeChange('light') },
      },
      {
        id: 'theme-adaptive',
        label: 'Switch to Adaptive Theme',
        category: 'View',
        execute: () => { close(); onThemeChange('adaptive') },
      },
    ]
  }, [isLocked, onTogglePanel, onThemeChange])

  const filtered = useMemo(
    () => actions.filter(a => fuzzyMatch(query, a.label) && (!a.disabled || a.discoverWhenDisabled)),
    [actions, query]
  )

  const clampedIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1))

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeCommandPalette()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => (i >= filtered.length - 1 ? 0 : i + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => (i <= 0 ? filtered.length - 1 : i - 1))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const action = filtered[clampedIdx]
      if (action && !action.disabled) action.execute()
      return
    }
  }, [filtered, clampedIdx, closeCommandPalette])

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setSelectedIdx(0)
  }, [])

  if (!commandPaletteOpen) return null

  return (
    <div
      className="command-palette-backdrop"
      onMouseDown={e => { if (e.button !== 0) return; closeCommandPalette() }}
      role="presentation"
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="command-palette__input"
          type="text"
          placeholder="Search actions…"
          value={query}
          onChange={handleQueryChange}
          onKeyDown={handleInputKeyDown}
          aria-label="Search actions"
          aria-autocomplete="list"
          aria-controls="command-palette-list"
          aria-activedescendant={filtered[clampedIdx] ? `cmd-${filtered[clampedIdx].id}` : undefined}
        />
        <ul
          id="command-palette-list"
          className="command-palette__list"
          role="listbox"
          aria-multiselectable={false}
          aria-label="Actions"
        >
          {filtered.length === 0 && (
            <li className="command-palette__empty">No results</li>
          )}
          {filtered.map((action, idx) => (
            <li
              key={action.id}
              id={`cmd-${action.id}`}
              role="option"
              aria-selected={idx === clampedIdx}
              className={`command-palette__item${idx === clampedIdx ? ' command-palette__item--selected' : ''}${action.disabled ? ' command-palette__item--disabled' : ''}`}
              aria-disabled={action.disabled || undefined}
              onMouseDown={e => { e.preventDefault(); if (!action.disabled) action.execute() }}
              onMouseEnter={() => setSelectedIdx(idx)}
            >
              <span className="command-palette__item-label">{action.label}</span>
              <span className="command-palette__item-category">{action.category}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
