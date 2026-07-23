import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAutoSave, useManualSave } from '../lib/autoSave'
import { useStore } from '@/state/createStore'
import Canvas from '../features/canvas-shell'
import CodePreviewFallback from '../components/ui/CodePreviewFallback'
import PanelLayout from '../components/ui/PanelLayout'
import { TopBar, type PanelId, type PanelVisible, CommandPalette, SettingsDialog } from '../features/settings'

import LiveRegion from '../components/ui/LiveRegion'
import { useHostBridge } from './useHostBridge'
import { SmartRoutingContext } from '../features/flowchart/ui/SmartRoutingContext'
import { NewEdgeRouteModeContext } from '../features/flowchart/ui/NewEdgeRouteModeContext'
import { flowchartNodeConnections } from '../../shared/diagram-contracts'
import '@xyflow/react/dist/style.css'
import '../styles/variables.css'
import '../styles/base.css'
import '../styles/components/panels.css'
import '../styles/themes/dark.css'
import '../styles/themes/light.css'
import '../styles/themes/adaptive.css'
import '../styles/components/topbar.css'
import '../styles/components/node.css'
import '../styles/components/edge.css'
import '../styles/components/sidebar.css'
import '../styles/components/canvas-control-tooltip.css'
import '../styles/components/canvas-node-inspector.css'
import '../styles/components/subgraph.css'
import '../styles/components/palette.css'
import '../styles/components/node-toolbar.css'
import '../styles/components/node-color-picker.css'

import '../styles/components/zoom-bar.css'
import '../styles/components/minimap.css'
import '../styles/components/command-palette.css'
import '../styles/components/settings-dialog.css'

const CodePanel = React.lazy(() => import('../features/import-export').then(({ CodePanel }) => ({ default: CodePanel })))
const PreviewPanel = React.lazy(() => import('../features/import-export').then(({ PreviewPanel }) => ({ default: PreviewPanel })))

type AppTheme = 'dark' | 'light' | 'adaptive'

export default function App(): React.JSX.Element {
  const { autoSave, setAutoSave, smartRouting, setSmartRouting, snapToGrid, setSnapToGrid, newEdgeRouteMode, setNewEdgeRouteMode, layoutStyle, setLayoutStyle, diagramFamily, fallbackReason } = useHostBridge()
  const documentSession = useStore(state => state.documentSession)
  const nodeConnections = documentSession?.family === 'flowchart'
    ? flowchartNodeConnections(documentSession.layout)
    : { mode: 'free', autoReassign: false } as const
  const setNodeConnectionPolicy = useStore(state => state.setNodeConnectionPolicy)
  const [appTheme, setAppTheme] = useState<AppTheme>('dark')
  const [panelVisible, setPanelVisible] = useState<PanelVisible>({ canvas: true, code: false, preview: false })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)

  useAutoSave(autoSave)
  useManualSave()

  const handleTogglePanel = useCallback((panel: PanelId): void => {
    const next: PanelVisible = { ...panelVisible, [panel]: !panelVisible[panel] }
    if (!(Object.keys(next) as PanelId[]).some(key => next[key])) return
    const label = panel.charAt(0).toUpperCase() + panel.slice(1)
    useStore.getState().announce(`${label} panel ${next[panel] ? 'shown' : 'hidden'}`)
    setPanelVisible(next)
  }, [panelVisible])

  useEffect(() => {
    const timer = setTimeout(() => {
      import('../features/import-export')
    }, 1500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (appTheme === 'adaptive') document.documentElement.setAttribute('data-theme', 'vscode-adaptive')
    else if (appTheme === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
  }, [appTheme])

  const canvasSupported = !fallbackReason && (diagramFamily === 'flowchart' || diagramFamily === 'class' || diagramFamily === 'empty')

  return (
    <div className="app" data-layout-style={layoutStyle}>
      <TopBar panelVisible={panelVisible} onTogglePanel={handleTogglePanel} theme={appTheme} onThemeChange={setAppTheme} onOpenSettings={() => setSettingsOpen(true)} settingsButtonRef={settingsButtonRef} />
      <main className="app__main">
        <SmartRoutingContext.Provider value={smartRouting}>
          <NewEdgeRouteModeContext.Provider value={newEdgeRouteMode}>
            <PanelLayout
              panelVisible={panelVisible}
              canvas={canvasSupported ? <Canvas snapToGrid={snapToGrid} layoutStyle={layoutStyle} /> : <CodePreviewFallback family={diagramFamily} reason={fallbackReason ?? undefined} onOpenCode={() => setPanelVisible({ canvas: false, code: true, preview: false })} />}
              code={<React.Suspense fallback={<div className="code-panel-loading" />}><CodePanel /></React.Suspense>}
              preview={<React.Suspense fallback={<div className="preview-panel-loading" />}><PreviewPanel /></React.Suspense>}
            />
          </NewEdgeRouteModeContext.Provider>
        </SmartRoutingContext.Provider>

        <CommandPalette onTogglePanel={handleTogglePanel} onThemeChange={setAppTheme} />
        <LiveRegion />
      </main>
      <SettingsDialog open={settingsOpen} autoSave={autoSave} onAutoSaveChange={setAutoSave} smartRouting={smartRouting} onSmartRoutingChange={setSmartRouting} snapToGrid={snapToGrid} onSnapToGridChange={setSnapToGrid} newEdgeRouteMode={newEdgeRouteMode} onNewEdgeRouteModeChange={setNewEdgeRouteMode} layoutStyle={layoutStyle} onLayoutStyleChange={setLayoutStyle} nodeConnections={nodeConnections} onNodeConnectionsChange={setNodeConnectionPolicy} onClose={() => setSettingsOpen(false)} returnFocusRef={settingsButtonRef} />
    </div>
  )
}
