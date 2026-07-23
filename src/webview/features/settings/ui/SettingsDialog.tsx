import React, { useCallback, useEffect, useRef } from 'react'
import type { FlowchartNodeConnections } from '../../../../shared/diagram-contracts'
import type { LayoutStyle, NewEdgeRouteMode } from '../../../../shared/protocol'

interface SettingsDialogProps {
  open: boolean
  autoSave: boolean
  onAutoSaveChange(value: boolean): void
  smartRouting: boolean
  onSmartRoutingChange(value: boolean): void
  snapToGrid: boolean
  onSnapToGridChange(value: boolean): void
  newEdgeRouteMode: NewEdgeRouteMode
  onNewEdgeRouteModeChange(value: NewEdgeRouteMode): void
  layoutStyle: LayoutStyle
  onLayoutStyleChange(value: LayoutStyle): void
  nodeConnections: FlowchartNodeConnections
  onNodeConnectionsChange(value: FlowchartNodeConnections): void
  onClose(): void
  returnFocusRef: React.RefObject<HTMLButtonElement | null>
}

const ROUTE_MODES: readonly NewEdgeRouteMode[] = ['straight', 'orthogonal', 'curved']

export default function SettingsDialog({ open, autoSave, onAutoSaveChange, smartRouting, onSmartRoutingChange, snapToGrid, onSnapToGridChange, newEdgeRouteMode, onNewEdgeRouteModeChange, layoutStyle, onLayoutStyleChange, nodeConnections, onNodeConnectionsChange, onClose, returnFocusRef }: SettingsDialogProps): React.JSX.Element | null {
  const autoSaveRef = useRef<HTMLInputElement>(null)
  const smartRoutingRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const close = useCallback((): void => {
    onClose()
    returnFocusRef.current?.focus()
  }, [onClose, returnFocusRef])

  useEffect(() => {
    if (!open) return
    autoSaveRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(document.querySelectorAll<HTMLElement>('.settings-dialog button:not(:disabled), .settings-dialog select:not(:disabled), .settings-dialog input:not(:disabled):not([type="radio"]), .settings-dialog input[type="radio"]:checked:not(:disabled)'))
      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)
      if (currentIndex === -1) return
      event.preventDefault()
      const nextIndex = (currentIndex + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length
      focusable[nextIndex]?.focus()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, open])

  if (!open) return null
  const connectionPolicy = nodeConnections
  const updateConnectionPolicy = onNodeConnectionsChange

  return (
    <div
      className="settings-dialog-backdrop"
      onClick={event => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title">
        <div className="settings-dialog__header">
          <h2 id="settings-dialog-title">Settings</h2>
          <button ref={closeRef} className="settings-dialog__close" type="button" aria-label="Close settings" onClick={close}>×</button>
        </div>
        <div className="settings-dialog__body">
          <label className="settings-dialog__preference">
            <span>
              <strong>Auto save</strong>
              <small id="settings-dialog-auto-save-description">Automatically save after editing stops.</small>
            </span>
            <span className="settings-dialog__switch">
              <input
                ref={autoSaveRef}
                type="checkbox"
                aria-label="Auto save"
                aria-describedby="settings-dialog-auto-save-description"
                checked={autoSave}
                onChange={event => onAutoSaveChange(event.target.checked)}
              />
              <span aria-hidden="true" />
            </span>
          </label>
          <label className="settings-dialog__preference">
            <span>
              <strong>Smart routing</strong>
              <small id="settings-dialog-smart-routing-description">Automatically avoid nodes and existing edges in flowcharts.</small>
            </span>
            <span className="settings-dialog__switch">
              <input
                ref={smartRoutingRef}
                type="checkbox"
                aria-label="Smart routing"
                aria-describedby="settings-dialog-smart-routing-description"
                checked={smartRouting}
                onChange={event => onSmartRoutingChange(event.target.checked)}
              />
              <span aria-hidden="true" />
            </span>
          </label>
          <label className="settings-dialog__preference">
            <span>
              <strong>Snap to grid</strong>
              <small id="settings-dialog-snap-to-grid-description">Align new and moved items to the canvas grid.</small>
            </span>
            <span className="settings-dialog__switch">
              <input
                type="checkbox"
                aria-label="Snap to grid"
                aria-describedby="settings-dialog-snap-to-grid-description"
                checked={snapToGrid}
                onChange={event => onSnapToGridChange(event.target.checked)}
              />
              <span aria-hidden="true" />
            </span>
          </label>
          <label className="settings-dialog__preference">
            <span>
              <strong>Layout style</strong>
              <small id="settings-dialog-layout-style-description">Choose the current editor chrome or a rounded modern layout.</small>
            </span>
            <select aria-label="Layout style" aria-describedby="settings-dialog-layout-style-description" value={layoutStyle} onChange={event => onLayoutStyleChange(event.target.value as LayoutStyle)}>
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
            </select>
          </label>
          <fieldset className="settings-dialog__route-default">
            <legend>Default connector path</legend>
            <small id="settings-dialog-new-edge-route-description">Choose how new flowchart connections are drawn.</small>
            <div role="radiogroup" aria-label="New edge route" aria-describedby="settings-dialog-new-edge-route-description">
              {ROUTE_MODES.map(mode => {
                const label = `${mode.charAt(0).toUpperCase()}${mode.slice(1)}`
                return (
                  <label key={mode} className={`settings-dialog__route-option settings-dialog__route-option--${mode}${newEdgeRouteMode === mode ? ' settings-dialog__route-option--selected' : ''}`}>
                    <input
                      type="radio"
                      name="new-edge-route-mode"
                      aria-label={`${label} new-edge route`}
                      checked={newEdgeRouteMode === mode}
                      onChange={() => onNewEdgeRouteModeChange(mode)}
                    />
                    <span className="settings-dialog__route-preview" aria-hidden="true"><i /></span>
                    <span className="settings-dialog__route-label">{label}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <fieldset className="settings-dialog__node-connections">
            <legend>Node connections</legend>
            <small id="settings-dialog-node-connections-description">Choose free border attachments or explicit cardinal node sides.</small>
            <div role="radiogroup" aria-label="Node connections" aria-describedby="settings-dialog-node-connections-description">
              <label className={`settings-dialog__connection-option${connectionPolicy.mode === 'free' ? ' settings-dialog__connection-option--selected' : ''}`}>
                <input type="radio" name="node-connection-mode" aria-label="Free node connections" checked={connectionPolicy.mode === 'free'} onChange={() => updateConnectionPolicy({ mode: 'free', autoReassign: false })} />
                <span>Free</span>
              </label>
              <label className={`settings-dialog__connection-option${connectionPolicy.mode === 'side' ? ' settings-dialog__connection-option--selected' : ''}`}>
                <input type="radio" name="node-connection-mode" aria-label="Side node connections" checked={connectionPolicy.mode === 'side'} onChange={() => updateConnectionPolicy({ mode: 'side', autoReassign: false })} />
                <span>Side</span>
              </label>
            </div>
            <label className={`settings-dialog__preference settings-dialog__preference--nested${connectionPolicy.mode === 'free' ? ' settings-dialog__preference--disabled' : ''}`}>
              <span>
                <strong>Auto-reassign sides</strong>
                <small id="settings-dialog-auto-reassign-description">{connectionPolicy.mode === 'free' ? 'Side node connections must be enabled to automatically reassign attachments after moves.' : 'Automatically choose the optimal cardinal side when a connected node moves.'}</small>
              </span>
              <span className="settings-dialog__switch">
                <input type="checkbox" aria-label="Auto-reassign sides" aria-describedby="settings-dialog-auto-reassign-description" disabled={connectionPolicy.mode === 'free'} checked={connectionPolicy.autoReassign} onChange={event => updateConnectionPolicy({ mode: 'side', autoReassign: event.target.checked })} />
                <span aria-hidden="true" />
              </span>
            </label>
          </fieldset>
        </div>
      </section>
    </div>
  )
}
