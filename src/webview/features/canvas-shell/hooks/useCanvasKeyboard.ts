import { useEffect } from 'react'
import { useStore } from '@/state/createStore'
import { GRID_SNAP } from '@/state/types'
import type { CanvasFitViewOptions } from './useCanvasViewport'

interface CanvasKeyboardControls {
  zoomIn: (options: { duration: number }) => void
  zoomOut: (options: { duration: number }) => void
  zoomTo: (zoom: number, options: { duration: number }) => void
  fitView: (options: CanvasFitViewOptions) => void
}

function isEditableElement(): boolean {
  const activeElement = document.activeElement as HTMLElement | null
  return activeElement?.tagName === 'INPUT'
    || activeElement?.tagName === 'TEXTAREA'
    || Boolean(activeElement?.isContentEditable)
}

export function useCanvasKeyboard({ zoomIn, zoomOut, zoomTo, fitView, fitViewOptions = { padding: 0.1, duration: 200, maxZoom: 1 } }: CanvasKeyboardControls & { fitViewOptions?: CanvasFitViewOptions }): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const editable = isEditableElement()
      const state = useStore.getState()

      if (event.key === 'Escape' && !editable) {
        state.deselectAll()
        state.setPendingConnect(null)
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (editable) return
        const selectedNodes = state.nodes.filter(node => node.selected)
        if (selectedNodes.some(node => node.data.isLane)) {
          state.announce('Choose a lane delete action in the context menu')
          return
        }
        const selectedNodeIds = selectedNodes.map(node => node.id)
        const selectedEdgeIds = state.edges.filter(edge => edge.selected).map(edge => edge.id)
        if (selectedNodeIds.length > 0) {
          state.removeNodes(selectedNodeIds)
          state.setPendingConnect(null)
        } else if (selectedEdgeIds.length > 0) {
          state.removeEdges(selectedEdgeIds)
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        if (editable) return
        event.preventDefault()
        state.undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
        if (editable) return
        event.preventDefault()
        state.redo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        if (editable) return
        event.preventDefault()
        state.selectAll()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        if (editable) return
        event.preventDefault()
        const selectedIds = state.nodes.filter(node => node.selected).map(node => node.id)
        if (selectedIds.length > 0) state.duplicateNodes(selectedIds)
        return
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)
        && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (editable || state.isLocked) return
        const selectedNodes = state.nodes.filter(node => node.selected && !node.parentId && !node.data.isSubgraph)
        if (selectedNodes.length === 0) return
        event.preventDefault()
        const deltas: Record<string, { x: number; y: number }> = {
          ArrowUp: { x: 0, y: -GRID_SNAP }, ArrowDown: { x: 0, y: GRID_SNAP },
          ArrowLeft: { x: -GRID_SNAP, y: 0 }, ArrowRight: { x: GRID_SNAP, y: 0 },
        }
        const delta = deltas[event.key]
        state.moveNodes(selectedNodes.map(node => ({
          id: node.id, position: { x: node.position.x + delta.x, y: node.position.y + delta.y },
        })))
        return
      }
      if (!event.ctrlKey || editable) return
      if (event.key === '0' && !event.shiftKey) { event.preventDefault(); zoomTo(1, { duration: 200 }); return }
      if ((event.key === '=' || event.key === '+') && !event.shiftKey) { event.preventDefault(); zoomIn({ duration: 200 }); return }
      if (event.key === '-' && !event.shiftKey) { event.preventDefault(); zoomOut({ duration: 200 }); return }
      if (event.key === 'F' && event.shiftKey) { event.preventDefault(); fitView(fitViewOptions) }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [fitView, fitViewOptions, zoomIn, zoomOut, zoomTo])
}
