import React, { useCallback, useEffect, useId, useRef } from 'react'
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
const DEFAULT_NODE_CONNECTIONS: FlowchartNodeConnections = { mode: 'side', autoReassign: true }

export default function SettingsDialog({ open, autoSave, onAutoSaveChange, smartRouting, onSmartRoutingChange, snapToGrid, onSnapToGridChange, newEdgeRouteMode, onNewEdgeRouteModeChange, layoutStyle, onLayoutStyleChange, nodeConnections, onNodeConnectionsChange, onClose, returnFocusRef }: SettingsDialogProps): React.JSX.Element | null {
  const autoSaveRef = useRef<HTMLInputElement>(null)
  const smartRoutingRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const connectionModeName = `node-connection-mode-${useId()}`
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
      const focusable = Array.from(document.querySelectorAll<HTMLElement>('.settings-dialog button:not(:disabled), .settings-dialog a[href], .settings-dialog select:not(:disabled), .settings-dialog input:not(:disabled):not([type="radio"]), .settings-dialog input[type="radio"]:checked:not(:disabled)'))
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
  const resetToDefaults = (): void => {
    onAutoSaveChange(true)
    onSmartRoutingChange(false)
    onSnapToGridChange(false)
    onNewEdgeRouteModeChange('curved')
    onLayoutStyleChange('modern')
    updateConnectionPolicy(DEFAULT_NODE_CONNECTIONS)
  }

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
          <div className="settings-dialog__quick-settings" role="group" aria-label="General settings">
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
              <span className="settings-dialog__preference-heading">
                <strong>Smart routing</strong>
                <span className="settings-dialog__experimental-badge">Experimental</span>
              </span>
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
          </div>
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
                    <span className="settings-dialog__route-label">
                      <span>{label}</span>
                      {mode !== 'straight' && <span className="settings-dialog__experimental-badge">Experimental</span>}
                    </span>
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
                <input type="radio" name={connectionModeName} aria-label="Free node connections" checked={connectionPolicy.mode === 'free'} onChange={() => updateConnectionPolicy({ mode: 'free', autoReassign: false })} />
                <span>Free</span>
              </label>
              <label className={`settings-dialog__connection-option${connectionPolicy.mode === 'side' ? ' settings-dialog__connection-option--selected' : ''}`}>
                <input type="radio" name={connectionModeName} aria-label="Side node connections" checked={connectionPolicy.mode === 'side'} onChange={() => updateConnectionPolicy({ mode: 'side', autoReassign: false })} />
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
          <div className="settings-dialog__actions">
            <button type="button" className="settings-dialog__reset" onClick={resetToDefaults}>Reset to defaults</button>
          </div>
          <section className="settings-dialog__about" aria-labelledby="settings-dialog-about-title">
            <div>
              <strong id="settings-dialog-about-title">About FlowForge</strong>
              <small>View the project source code, releases, and documentation on GitHub.</small>
            </div>
            <a
              className="settings-dialog__github-link"
              href="https://github.com/SauliusDev/flowforge"
              target="_blank"
              rel="noreferrer"
            >
              <span className="settings-dialog__github-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" focusable="false">
                  <path d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.23.49-2.7-1.08-2.7-1.08-.36-.93-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.81.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.67.07-.52.28-.87.51-1.07-1.78-.2-3.65-.89-3.65-3.96 0-.88.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.12 0 0 .68-.22 2.2.82A7.65 7.65 0 0 1 8 4.8c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.52.56.83 1.27.83 2.15 0 3.08-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.14.46.55.38A8 8 0 0 0 8 0Z" />
                </svg>
              </span>
              <span>View FlowForge on GitHub</span>
            </a>
          </section>
        </div>
      </section>
    </div>
  )
}
