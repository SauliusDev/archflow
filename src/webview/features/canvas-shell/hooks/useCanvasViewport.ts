import { useCallback, useEffect } from 'react'
import type { Viewport } from '@xyflow/react'
import { useStore } from '@/state/createStore'

interface CanvasViewportControls {
  setViewport: (viewport: Viewport) => void
  fitView: (options: CanvasFitViewOptions) => void
  zoomIn: (options: { duration: number }) => void
  zoomOut: (options: { duration: number }) => void
  zoomTo: (zoom: number, options: { duration: number }) => void
}

export interface CanvasFitViewOptions {
  padding: number
  duration: number
  maxZoom?: number
}

const CLASSIC_FIT_VIEW_OPTIONS: CanvasFitViewOptions = { padding: 0.1, duration: 200, maxZoom: 1 }

export function useCanvasViewport({ setViewport, fitView, zoomIn, zoomOut, zoomTo, fitViewOptions = CLASSIC_FIT_VIEW_OPTIONS }: CanvasViewportControls & { fitViewOptions?: CanvasFitViewOptions }): { handleViewportChange: (viewport: Viewport) => void } {
  const viewportToRestore = useStore(state => state.viewportToRestore)
  const clearViewportRestore = useStore(state => state.clearViewportRestore)
  const fitViewRequested = useStore(state => state.fitViewRequested)
  const clearFitViewRequest = useStore(state => state.clearFitViewRequest)
  const pendingZoomAction = useStore(state => state.pendingZoomAction)
  const clearPendingZoomAction = useStore(state => state.clearPendingZoomAction)
  const persistViewport = useStore(state => state.setViewport)
  const handleViewportChange = useCallback((viewport: Viewport): void => persistViewport(viewport), [persistViewport])

  useEffect(() => {
    if (!viewportToRestore) return
    clearViewportRestore()
    setViewport(viewportToRestore)
  }, [clearViewportRestore, setViewport, viewportToRestore])
  useEffect(() => {
    if (!fitViewRequested) return
    clearFitViewRequest()
    fitView({ ...fitViewOptions, duration: fitViewOptions.duration === 360 ? 360 : 0 })
  }, [clearFitViewRequest, fitView, fitViewOptions, fitViewRequested])
  useEffect(() => {
    if (!pendingZoomAction) return
    clearPendingZoomAction()
    switch (pendingZoomAction) {
      case 'in': zoomIn({ duration: 200 }); break
      case 'out': zoomOut({ duration: 200 }); break
      case 'reset': zoomTo(1, { duration: 200 }); break
      case 'fit': fitView(fitViewOptions); break
    }
  }, [clearPendingZoomAction, fitView, fitViewOptions, pendingZoomAction, zoomIn, zoomOut, zoomTo])

  return { handleViewportChange }
}
