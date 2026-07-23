import { useEffect } from 'react'
import { useStore } from '@/state/createStore'
import { GRID_SNAP } from '@/state/types'
import type { NodeShape } from '@/features/flowchart'

const validPaletteShapes = new Set<string>(['rectangle', 'rounded', 'pill', 'diamond', 'circle', 'hexagon', 'cylinder', 'subgraph'])

export function useCanvasDrop(screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }, snapToGrid = true) {
  const isLocked = useStore(state => state.isLocked)
  const addNode = useStore(state => state.addNode)
  const addSubgraph = useStore(state => state.addSubgraph)
  const addLane = useStore(state => state.addLane)
  const pendingAddNode = useStore(state => state.pendingAddNode)
  const clearPendingAddNode = useStore(state => state.clearPendingAddNode)
  const snap = (position: { x: number; y: number }) => ({
    x: Math.round(position.x / GRID_SNAP) * GRID_SNAP,
    y: Math.round(position.y / GRID_SNAP) * GRID_SNAP,
  })

  useEffect(() => {
    clearPendingAddNode()
  }, [clearPendingAddNode])
  useEffect(() => {
    if (!pendingAddNode) return
    const { shape, mermaidShape } = pendingAddNode
    clearPendingAddNode()
    const element = document.querySelector('.react-flow')
    const rect = element?.getBoundingClientRect()
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const position = screenToFlowPosition(center)
    const placedPosition = snapToGrid ? snap(position) : position
    if (shape === 'subgraph') addSubgraph(placedPosition)
    else addNode({ id: crypto.randomUUID(), type: 'flowNode', position: placedPosition, data: { label: 'New Node', shape, ...(mermaidShape ? { mermaidShape } : {}) } })
  }, [addNode, addSubgraph, clearPendingAddNode, pendingAddNode, screenToFlowPosition, snapToGrid])

  function handleCanvasDragOver(event: React.DragEvent): void {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  function handleCanvasDrop(event: React.DragEvent): void {
    event.preventDefault()
    if (isLocked) return
    const raw = event.dataTransfer.getData('application/reactflow-palette')
    if (!raw) return
    const generalized = raw.match(/^generalized:([a-z0-9-]+):(rectangle|rounded|pill|diamond|circle|hexagon|cylinder)$/)
    if (!generalized && raw !== 'lane' && !validPaletteShapes.has(raw)) return
    const shape = (generalized?.[2] ?? raw) as NodeShape
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const placedPosition = snapToGrid ? snap(position) : position
    if (raw === 'lane') addLane()
    else if (shape === 'subgraph') addSubgraph(placedPosition)
    else addNode({ id: crypto.randomUUID(), type: 'flowNode', position: placedPosition, data: { label: 'New Node', shape, ...(generalized ? { mermaidShape: generalized[1] } : {}) } })
  }
  return { handleCanvasDragOver, handleCanvasDrop }
}
